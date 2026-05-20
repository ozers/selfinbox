import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useDomain, useSmtpCredentials, useSmtpActions } from "@/lib/hooks"
import { motion } from "framer-motion"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

export default function DomainSmtpPage() {
  const { id } = useParams()
  const { toast } = useToast()
  const { domain } = useDomain(id)
  const { credentials: smtpCredentials, loading, refetch } = useSmtpCredentials(id)
  const { regenerate } = useSmtpActions()

  const [showPassword, setShowPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [openGuide, setOpenGuide] = useState<string | null>(null)
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const handleCopy = (value: string, field: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    toast({ type: "success", title: "Copied to clipboard!" })
    setTimeout(() => setCopiedField(null), 2000)
  }

  const toggleGuide = (guide: string) => {
    setOpenGuide(openGuide === guide ? null : guide)
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await regenerate(id!)
      await refetch()
      setRegenerateDialogOpen(false)
      toast({ type: "success", title: "Credentials regenerated!" })
    } catch {
      toast({ type: "error", title: "Failed to regenerate credentials." })
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const credentials = smtpCredentials
    ? [
        { label: "Server", value: smtpCredentials.host, field: "host" },
        { label: "Port", value: String(smtpCredentials.port), field: "port" },
        {
          label: "Username",
          value: smtpCredentials.username,
          field: "username",
        },
        {
          label: "Encryption",
          value: smtpCredentials.encryption,
          field: "encryption",
        },
      ]
    : []

  const guides = smtpCredentials
    ? [
        {
          id: "gmail",
          title: "Gmail",
          steps: [
            "Open Gmail and go to Settings > Accounts and Import.",
            'Under "Send mail as", click "Add another email address".',
            `Enter your name and the email address (e.g. ${smtpCredentials.username}).`,
            `For SMTP Server, enter: ${smtpCredentials.host}`,
            `Port: ${smtpCredentials.port}, Username: ${smtpCredentials.username}`,
            "Enter your SMTP password and select STARTTLS.",
            "Click Add Account and verify via the confirmation email.",
          ],
        },
        {
          id: "apple",
          title: "Apple Mail",
          steps: [
            "Open Mail and go to Mail > Settings > Accounts.",
            "Select your account or add a new one.",
            "Click Server Settings and find Outgoing Mail Server (SMTP).",
            `Set Host Name to: ${smtpCredentials.host}`,
            `Set User Name to: ${smtpCredentials.username}`,
            "Enter your SMTP password.",
            `Set Port to ${smtpCredentials.port} and enable STARTTLS.`,
            "Save and close Settings.",
          ],
        },
        {
          id: "thunderbird",
          title: "Thunderbird",
          steps: [
            "Open Thunderbird and go to Account Settings.",
            'Click "Outgoing Server (SMTP)" in the left sidebar.',
            'Click "Add" to create a new SMTP server.',
            `Server Name: ${smtpCredentials.host}`,
            `Port: ${smtpCredentials.port}`,
            "Connection Security: STARTTLS",
            "Authentication Method: Normal password",
            `User Name: ${smtpCredentials.username}`,
            "Click OK and set this as the default outgoing server for your account.",
          ],
        },
      ]
    : []

  return (
    <motion.div
      className="space-y-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Breadcrumb */}
      <motion.div variants={item}>
        <Breadcrumb
          items={[
            { label: "Domains", to: "/domains" },
            { label: domain?.domain ?? "Domain", to: `/domains/${id}` },
            { label: "SMTP Credentials" },
          ]}
        />
      </motion.div>

      {/* Credentials Cards */}
      <motion.div variants={item} className="space-y-3">
        {credentials.map((cred) => (
          <div
            key={cred.field}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {cred.label}
              </p>
              <p className="mt-1 font-mono text-sm break-all">{cred.value}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0"
              onClick={() => handleCopy(cred.value, cred.field)}
            >
              {copiedField === cred.field ? (
                <Check className="h-4 w-4 text-status-active" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        ))}

        {/* Password field */}
        {smtpCredentials && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Password
              </p>
              <p className="mt-1 font-mono text-sm break-all">
                {showPassword
                  ? smtpCredentials.password
                  : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  handleCopy(smtpCredentials.password, "password")
                }
              >
                {copiedField === "password" ? (
                  <Check className="h-4 w-4 text-status-active" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Regenerate */}
      <motion.div variants={item}>
        <Button variant="outline" onClick={() => setRegenerateDialogOpen(true)}>
          <RefreshCw className="h-4 w-4" /> Regenerate Credentials
        </Button>
      </motion.div>

      {/* Setup Guides */}
      <motion.div variants={item}>
        <h2 className="mb-4 text-lg font-semibold">Setup Guides</h2>
        <div className="space-y-2">
          {guides.map((guide) => (
            <div
              key={guide.id}
              className="rounded-xl border border-border bg-card"
            >
              <button
                onClick={() => toggleGuide(guide.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-medium">{guide.title}</span>
                {openGuide === guide.id ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {openGuide === guide.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-border px-5 py-4"
                >
                  <ol className="space-y-2.5">
                    {guide.steps.map((step, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm text-muted-foreground"
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
                          {i + 1}
                        </span>
                        <span className="leading-5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Regenerate Dialog */}
      <Dialog
        open={regenerateDialogOpen}
        onClose={() => {
          if (!regenerating) setRegenerateDialogOpen(false)
        }}
        title="Regenerate credentials"
        description="Regenerate credentials? Current credentials will stop working immediately."
        confirmLabel="Regenerate"
        confirmVariant="destructive"
        onConfirm={handleRegenerate}
        loading={regenerating}
      />
    </motion.div>
  )
}
