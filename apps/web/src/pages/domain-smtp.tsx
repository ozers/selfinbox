import { useState } from "react"
import { useParams } from "react-router-dom"
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { Dialog } from "@/components/ui/dialog"
import { PageLoader } from "@/components/ui/page-state"
import { useToast } from "@/components/ui/toast"
import { useCopy } from "@/lib/use-copy"
import { useDomain, useSmtpCredentials, useSmtpActions } from "@/lib/hooks"
import { staggerContainer as container, fadeUpItem as item } from "@/lib/motion"
import { motion } from "framer-motion"

export default function DomainSmtpPage() {
  const { id } = useParams()
  const { toast } = useToast()
  const { domain } = useDomain(id)
  const { credentials: smtpCredentials, loading, refetch } = useSmtpCredentials(id)
  const { regenerate } = useSmtpActions()
  const { copy, copiedField } = useCopy()

  const [showPassword, setShowPassword] = useState(false)
  const [openGuide, setOpenGuide] = useState<string | null>(null)
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  // Plaintext password is returned only by the regenerate endpoint and only
  // once. We keep it in component state so the user has a chance to copy it
  // before navigating away — never persisted to storage.
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)

  const handleCopy = (value: string, field: string) => copy(value, { field })

  const toggleGuide = (guide: string) => {
    setOpenGuide(openGuide === guide ? null : guide)
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const reveal = await regenerate(id!)
      setRevealedPassword(reveal.password)
      setShowPassword(true)
      await refetch()
      setRegenerateDialogOpen(false)
      toast({
        type: "success",
        title: "Credentials regenerated",
        description: "Copy the password now — it will not be shown again.",
      })
    } catch {
      toast({ type: "error", title: "Failed to regenerate credentials." })
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) return <PageLoader />

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

        {/* Password field \u2014 value is only present immediately after a
            regenerate. The server no longer returns it on GET, so showing
            "Regenerate to reveal" is the steady-state. */}
        {smtpCredentials && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Password
              </p>
              <p className="mt-1 font-mono text-sm break-all">
                {revealedPassword
                  ? (showPassword
                      ? revealedPassword
                      : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")
                  : smtpCredentials.hasPassword
                    ? "Regenerate to reveal a new password"
                    : "No password set \u2014 regenerate to create one"}
              </p>
            </div>
            {revealedPassword && (
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
                  onClick={() => handleCopy(revealedPassword, "password")}
                >
                  {copiedField === "password" ? (
                    <Check className="h-4 w-4 text-status-active" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
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
