import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { useTheme } from "@/lib/theme"
import { api } from "@/lib/api"
import type { Domain, SmtpCredentialsReveal } from "@/lib/types"
import { motion, AnimatePresence } from "framer-motion"
import {
  Copy,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader,
  Sun,
  Moon,
  Zap,
} from "lucide-react"

const stepLabels = ["Add domain", "DNS records", "Verify", "Create address", "SMTP setup"]

const providers = ["Cloudflare", "GoDaddy", "Namecheap", "Other"]

const blockedDomains = ["gmail.com", "outlook.com", "yahoo.com", "hotmail.com"]

function validateDomain(domain: string): string | null {
  const trimmed = domain.trim()
  if (!trimmed) return "Domain is required."
  if (/\s/.test(trimmed)) return "Domain must not contain spaces."
  if (/^https?:\/\//i.test(trimmed)) return "Remove the http:// or https:// prefix."
  if (!trimmed.includes(".")) return "Enter a valid domain (e.g. yourdomain.com)."
  const lower = trimmed.toLowerCase()
  for (const blocked of blockedDomains) {
    if (lower === blocked || lower.endsWith("." + blocked)) {
      return "This domain belongs to a major email provider and cannot be used."
    }
  }
  return null
}

function validateEmailPrefix(prefix: string): string | null {
  const trimmed = prefix.trim()
  if (!trimmed) return "Email prefix is required."
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return "Only letters, numbers, dots, and hyphens are allowed."
  return null
}

function validateForwardTo(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address."
  return null
}

type VerifyState = "idle" | "checking" | "verified" | "pending"

export default function SetupPage() {
  const { theme, toggle } = useTheme()
  const { toast } = useToast()

  const [step, setStep] = useState(0)

  // Step 0
  const [domain, setDomain] = useState("")
  const [domainTouched, setDomainTouched] = useState(false)
  const [addingDomain, setAddingDomain] = useState(false)

  // Step 1 & 2 (populated after domain creation)
  const [createdDomain, setCreatedDomain] = useState<Domain | null>(null)
  const [activeProvider, setActiveProvider] = useState("Cloudflare")
  const [dnsConfirmed, setDnsConfirmed] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<Record<string, VerifyState>>({
    mx: "idle", spf: "idle", dkim: "idle", dmarc: "idle",
  })
  const [isVerifying, setIsVerifying] = useState(false)

  // Cloudflare OAuth (step 1)
  const [cfConfiguring, setCfConfiguring] = useState(false)
  const [cfConfigured, setCfConfigured] = useState(false)

  // Step 3
  const [emailPrefix, setEmailPrefix] = useState("")
  const [emailPrefixTouched, setEmailPrefixTouched] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [forwardTo, setForwardTo] = useState("")
  const [forwardToTouched, setForwardToTouched] = useState(false)
  const [addingAddress, setAddingAddress] = useState(false)

  // Step 4
  const [smtpCredentials, setSmtpCredentials] = useState<SmtpCredentialsReveal | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const displayDomain = domain.trim() || "yourdomain.com"

  const domainError = useMemo(() => (domainTouched ? validateDomain(domain) : null), [domain, domainTouched])
  const emailPrefixError = useMemo(() => (emailPrefixTouched ? validateEmailPrefix(emailPrefix) : null), [emailPrefix, emailPrefixTouched])
  const forwardToError = useMemo(() => (forwardToTouched ? validateForwardTo(forwardTo) : null), [forwardTo, forwardToTouched])

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast({ type: "success", title: "Copied!", description: `${label} copied to clipboard` })
  }

  // Map DNS records from API to verifyStatus keys
  function dnsRecordsToStatus(records: Domain["dnsRecords"]): Record<string, VerifyState> {
    const status: Record<string, VerifyState> = { mx: "idle", spf: "idle", dkim: "idle", dmarc: "idle" }
    for (const rec of records) {
      const v: VerifyState = rec.verified ? "verified" : "pending"
      if (rec.type === "MX") {
        status.mx = v
      } else if (rec.type === "TXT" && rec.value.includes("spf1")) {
        status.spf = v
      } else if (rec.name.includes("_dmarc")) {
        status.dmarc = v
      } else if (rec.type === "CNAME") {
        // 3 DKIM CNAME records — show as verified only when all are done
        if (status.dkim !== "pending") status.dkim = v
      }
    }
    return status
  }

  async function handleCloudflareOAuth() {
    if (!createdDomain) return
    setCfConfiguring(true)
    try {
      const result = await api.post<{ created: number; skipped: number }>(
        `/domains/${createdDomain.id}/cloudflare/setup`, {}
      )
      setCfConfigured(true)
      const msg = result.skipped > 0
        ? `${result.created} records added, ${result.skipped} already existed.`
        : `${result.created} DNS records added.`
      toast({ type: "success", title: "Cloudflare configured!", description: msg })
    } catch (err: any) {
      toast({ type: "error", title: err.message || "Failed to configure Cloudflare" })
    } finally {
      setCfConfiguring(false)
    }
  }

  async function handleVerify() {
    if (!createdDomain) return
    setIsVerifying(true)
    setVerifyStatus({ mx: "checking", spf: "checking", dkim: "checking", dmarc: "checking" })
    try {
      const updated = await api.post<Domain>(`/domains/${createdDomain.id}/verify`)
      setCreatedDomain(updated)
      const status = dnsRecordsToStatus(updated.dnsRecords)
      setVerifyStatus(status)
      const verifiedCount = Object.values(status).filter((s) => s === "verified").length
      if (verifiedCount === 4) {
        toast({ type: "success", title: "All records verified!" })
      } else {
        toast({ type: "info", title: `${verifiedCount} of 4 records verified`, description: "DNS changes may take up to 48h." })
      }
    } catch (err: any) {
      setVerifyStatus({ mx: "idle", spf: "idle", dkim: "idle", dmarc: "idle" })
      toast({ type: "error", title: err.message || "Verification failed" })
    } finally {
      setIsVerifying(false)
    }
  }

  const canContinue = (): boolean => {
    if (step === 0) return validateDomain(domain) === null
    if (step === 2) return dnsConfirmed
    if (step === 3) return validateEmailPrefix(emailPrefix) === null && validateForwardTo(forwardTo) === null
    return true
  }

  async function handleContinue() {
    if (step === 0) {
      // Create domain via API
      setAddingDomain(true)
      try {
        const d = await api.post<Domain>("/domains", { domain: domain.trim().toLowerCase() })
        setCreatedDomain(d)
        setStep(1)
      } catch (err: any) {
        toast({ type: "error", title: err.message || "Failed to add domain" })
      } finally {
        setAddingDomain(false)
      }
    } else if (step === 3) {
      // Create email address
      setAddingAddress(true)
      try {
        await api.post(`/domains/${createdDomain!.id}/addresses`, {
          prefix: emailPrefix.trim(),
          displayName: displayName.trim() || undefined,
          forwardingTo: forwardTo.trim() || undefined,
        })
        // Calling regenerate (not GET) is the only way to obtain the
        // plaintext password — the GET endpoint never returns it. We're
        // in the onboarding flow so the user has never seen the value;
        // regenerating immediately is equivalent to revealing the freshly-
        // created one.
        const creds = await api.post<SmtpCredentialsReveal>(
          `/domains/${createdDomain!.id}/smtp/regenerate`,
        )
        setSmtpCredentials(creds)
        setStep(4)
      } catch (err: any) {
        toast({ type: "error", title: err.message || "Failed to create address" })
      } finally {
        setAddingAddress(false)
      }
    } else {
      setStep((s) => Math.min(s + 1, 4))
    }
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  // ---- DNS records for display (real or placeholder) ----
  const dnsRecordsForDisplay = createdDomain?.dnsRecords.filter((r) =>
    r.type === "MX" || r.value.includes("spf1") || r.name.includes("_dmarc") ||
    (r.type === "TXT" && r.name.includes("_amazonses"))
  ) ?? []

  const dkimRecords = createdDomain?.dnsRecords.filter((r) => r.type === "CNAME") ?? []

  // ---- Progress Bar ----
  function renderProgress() {
    return (
      <div className="mb-8 flex items-center justify-center">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors " +
                (i <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")
              }>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className="mt-1.5 hidden text-[11px] font-medium text-muted-foreground md:block">{label}</span>
            </div>
            {i < stepLabels.length - 1 && (
              <div className={"mx-2 mb-5 h-0.5 w-10 sm:w-14 " + (i < step ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>
    )
  }

  // ---- Step 0: Add domain ----
  function renderStep0() {
    return (
      <div>
        <h2 className="text-xl font-bold text-foreground">What's your domain?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Enter the domain you want to use for sending and receiving email.</p>
        <div className="mt-6">
          <Label htmlFor="domain">Domain</Label>
          <Input
            id="domain"
            placeholder="yourdomain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={() => setDomainTouched(true)}
            className="mt-1.5 font-mono bg-card"
          />
          {domainError && <p className="mt-1 text-xs text-status-error">{domainError}</p>}
        </div>
        {domain.trim().length > 3 && domain.includes(".") && !domainError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-status-pending/30 bg-status-pending/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" />
            <p className="text-sm text-muted-foreground">
              If this domain already has MX records, adding Selfinbox's MX record will change where incoming mail is delivered.
            </p>
          </div>
        )}
      </div>
    )
  }

  // ---- Step 1: DNS records ----
  function renderStep1() {
    const allRecords = [...dnsRecordsForDisplay, ...dkimRecords]
    return (
      <div>
        <h2 className="text-xl font-bold text-foreground">Add these DNS records</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add the following records to your domain's DNS settings.</p>

        <div className="mt-5 flex rounded-lg bg-secondary p-1">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => setActiveProvider(p)}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (activeProvider === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              {p}
            </button>
          ))}
        </div>

        {activeProvider === "Cloudflare" && (
          <div className={
            "mt-4 rounded-xl border p-4 transition-colors " +
            (cfConfigured ? "border-status-active/40 bg-status-active/5" : "border-primary/30 bg-primary/5")
          }>
            {cfConfigured ? (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 shrink-0 text-status-active" />
                <div>
                  <p className="text-sm font-medium text-foreground">DNS records added to Cloudflare</p>
                  <p className="text-xs text-muted-foreground">You can proceed to verification.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Auto-configure Cloudflare DNS</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Authorize Selfinbox to add the required DNS records to your Cloudflare account automatically. No manual copying needed.
                </p>
                <Button
                  onClick={handleCloudflareOAuth}
                  disabled={cfConfiguring}
                  className="w-full"
                >
                  {cfConfiguring
                    ? <><Loader className="mr-2 h-4 w-4 animate-spin" />Connecting...</>
                    : <><Zap className="mr-2 h-4 w-4" />Connect with Cloudflare</>
                  }
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 space-y-3">
          {allRecords.map((rec) => {
            const isMx = rec.type === "MX"
            const [mxPriority, mxHost] = isMx ? rec.value.split(" ") : ["", ""]
            return (
              <div key={rec.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{rec.type}</span>
                {/* Name row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground/60 mb-0.5">Name</p>
                    <p className="break-all font-mono text-xs text-foreground">{rec.name}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => copyToClipboard(rec.name, "Name")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* MX: priority + host separately */}
                {isMx ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground/60 mb-0.5">Priority</p>
                        <p className="font-mono text-xs text-foreground">{mxPriority}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground/60 mb-0.5">Value</p>
                        <p className="break-all font-mono text-xs text-primary">{mxHost}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => copyToClipboard(mxHost, "MX value")}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground/60 mb-0.5">Value</p>
                      <p className="break-all font-mono text-xs text-primary">{rec.value}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => copyToClipboard(rec.value, `${rec.type} value`)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- Step 2: Verify ----
  function renderStep2() {
    const recordLabels: { key: string; label: string }[] = [
      { key: "mx", label: "MX" },
      { key: "spf", label: "TXT (SPF)" },
      { key: "dkim", label: "CNAME (DKIM)" },
      { key: "dmarc", label: "TXT (DMARC)" },
    ]

    function statusIcon(state: VerifyState) {
      switch (state) {
        case "checking": return <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
        case "verified": return <CheckCircle className="h-4 w-4 text-status-active" />
        case "pending": return (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-pending opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-pending" />
          </span>
        )
        default: return <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      }
    }

    function statusLabel(state: VerifyState) {
      switch (state) {
        case "checking": return "Checking..."
        case "verified": return "Verified"
        case "pending": return "Pending"
        default: return "Not checked"
      }
    }

    function statusColor(state: VerifyState) {
      switch (state) {
        case "verified": return "text-status-active"
        case "pending": return "text-status-pending"
        default: return "text-muted-foreground"
      }
    }

    return (
      <div>
        <h2 className="text-xl font-bold text-foreground">Verify DNS records</h2>
        <p className="mt-1 text-sm text-muted-foreground">Confirm that you have added all required DNS records.</p>

        <div className="mt-5 space-y-2">
          {recordLabels.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <span className="text-sm font-medium text-foreground">{label}</span>
              <div className="flex items-center gap-2">
                {statusIcon(verifyStatus[key])}
                <span className={"text-xs font-medium " + statusColor(verifyStatus[key])}>
                  {statusLabel(verifyStatus[key])}
                </span>
              </div>
            </div>
          ))}
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={dnsConfirmed}
            onChange={(e) => setDnsConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <div>
            <span className="text-sm font-medium text-foreground">I've added all DNS records</span>
            <p className="text-xs text-muted-foreground">DNS propagation can take up to 48 hours.</p>
          </div>
        </label>

        {dnsConfirmed && (
          <div className="mt-4">
            <Button onClick={handleVerify} disabled={isVerifying} className="w-full">
              {isVerifying ? <><Loader className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Verify now"}
            </Button>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-status-pending" />
            <p className="text-xs text-muted-foreground">
              DNS changes can take up to 48 hours to propagate. If verification fails, wait and try again. You can continue without full verification — the background checker will activate your domain automatically.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---- Step 3: Create address ----
  function renderStep3() {
    return (
      <div>
        <h2 className="text-xl font-bold text-foreground">Create your first email</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set up an email address on {displayDomain}.</p>

        <div className="mt-6">
          <Label>Email address</Label>
          <div className="mt-1.5 flex">
            <Input
              placeholder="name"
              value={emailPrefix}
              onChange={(e) => setEmailPrefix(e.target.value)}
              onBlur={() => setEmailPrefixTouched(true)}
              className="rounded-r-none font-mono"
            />
            <span className="flex items-center rounded-r-lg border border-l-0 border-border bg-secondary px-3 text-sm text-muted-foreground">
              @{displayDomain}
            </span>
          </div>
          {emailPrefixError && <p className="mt-1 text-xs text-status-error">{emailPrefixError}</p>}
        </div>

        <div className="mt-4">
          <Label>Display name (optional)</Label>
          <Input
            placeholder="HookSense"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Shown as the sender name, e.g. HookSense &lt;noreply@yourdomain.com&gt;
          </p>
        </div>

        <div className="mt-4">
          <Label>Forward to (optional)</Label>
          <Input
            placeholder="your@gmail.com"
            value={forwardTo}
            onChange={(e) => setForwardTo(e.target.value)}
            onBlur={() => setForwardToTouched(true)}
            className="mt-1.5"
          />
          {forwardToError ? (
            <p className="mt-1 text-xs text-status-error">{forwardToError}</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Incoming emails will be forwarded to this address. You can always change this later.
            </p>
          )}
        </div>
      </div>
    )
  }

  // ---- Step 4: SMTP credentials ----
  function renderStep4() {
    const creds = smtpCredentials
      ? [
          { id: "server", label: "SMTP Server", value: smtpCredentials.host },
          { id: "port", label: "Port", value: String(smtpCredentials.port) },
          { id: "username", label: "Username", value: smtpCredentials.username },
          { id: "encryption", label: "Encryption", value: smtpCredentials.encryption },
        ]
      : []

    return (
      <div>
        <div className="flex items-center gap-3 rounded-xl border border-status-active/30 bg-status-active/5 p-4">
          <CheckCircle className="h-5 w-5 shrink-0 text-status-active" />
          <div>
            <p className="text-sm font-medium text-foreground">Your email is ready!</p>
            <p className="text-xs text-muted-foreground">Use the credentials below to configure your email client.</p>
          </div>
        </div>

        <h2 className="mt-6 text-xl font-bold text-foreground">SMTP credentials</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use these credentials to send email from your favorite client.</p>

        <div className="mt-5 space-y-3">
          {creds.map((cred) => (
            <div key={cred.id} className="rounded-xl border border-border bg-card p-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{cred.label}</span>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 break-all font-mono text-sm text-foreground">{cred.value}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(cred.value, cred.label)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {smtpCredentials && (
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Password</span>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 break-all font-mono text-sm text-foreground">
                  {showPassword ? smtpCredentials.password : "••••••••••••••••••••"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(smtpCredentials.password, "Password")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <Link to="/dashboard" className="mt-6 block">
          <Button className="w-full bg-primary text-primary-foreground">
            Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    )
  }

  const stepRenderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]
  const isLoading = addingDomain || addingAddress

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <button
        onClick={toggle}
        className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="w-full max-w-[640px]">
        {renderProgress()}

        <div className="rounded-xl border border-border bg-card p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
            >
              {stepRenderers[step]()}
            </motion.div>
          </AnimatePresence>
        </div>

        {step < 4 && (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={goBack} disabled={step === 0 || isLoading}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleContinue} disabled={!canContinue() || isLoading}>
              {isLoading ? (
                <><Loader className="mr-1.5 h-4 w-4 animate-spin" />Processing...</>
              ) : (
                <>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></>
              )}
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="mt-6 flex items-center justify-start">
            <Button variant="ghost" onClick={goBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
