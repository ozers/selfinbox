import { useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Reply, Forward, Code, Send, Trash2, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useEmail, useEmailActions } from "@/lib/hooks"
import { formatRelativeTime } from "@/lib/utils"
import { api } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmailDetailPage() {
  const { emailId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { email, loading } = useEmail(emailId)
  const { deleteEmail } = useEmailActions()

  const [showReply, setShowReply] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [showRawHeaders, setShowRawHeaders] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [replyError, setReplyError] = useState("")
  const [replySending, setReplySending] = useState(false)
  const [forwardTo, setForwardTo] = useState("")
  const [forwardText, setForwardText] = useState("")
  const [forwardToError, setForwardToError] = useState("")
  const [forwardSending, setForwardSending] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-muted-foreground">Email not found.</p>
        <Link to="/inbox" className="mt-4 text-sm text-primary hover:underline">Back to Inbox</Link>
      </div>
    )
  }

  const createdAtDate = new Date(email.createdAt)
  const truncatedSubject = email.subject.length > 30 ? email.subject.slice(0, 30) + "..." : email.subject

  const senderDomain = email.from.split("@")[1] || "localhost"
  const rawHeaders = {
    "Message-ID": `<${email.id}@${senderDomain}>`,
    From: email.from,
    To: email.to.join(", "),
    Cc: email.cc.length > 0 ? email.cc.join(", ") : undefined,
    Subject: email.subject,
    Date: createdAtDate.toUTCString(),
    "MIME-Version": "1.0",
    "Content-Type": "text/html; charset=UTF-8",
    "X-Mailer": "Selfinbox/1.0",
  }

  async function handleSendReply() {
    if (!replyText.trim()) {
      setReplyError("Reply message is required")
      return
    }
    setReplyError("")
    setReplySending(true)
    try {
      await api.post("/emails/send", {
        from: email!.address,
        to: email!.from,
        subject: `Re: ${email!.subject}`,
        bodyText: replyText.trim(),
      })
      toast({ type: "success", title: "Reply sent!" })
      setShowReply(false)
      setReplyText("")
    } catch (err: any) {
      toast({ type: "error", title: err.message || "Failed to send reply" })
    } finally {
      setReplySending(false)
    }
  }

  async function handleSendForward() {
    if (!forwardTo.trim()) {
      setForwardToError("Recipient is required")
      return
    }
    if (!emailRegex.test(forwardTo.trim())) {
      setForwardToError("Invalid email address")
      return
    }
    setForwardToError("")
    setForwardSending(true)
    try {
      const body = forwardText.trim()
        ? `${forwardText.trim()}\n\n---------- Forwarded message ----------\n${email!.bodyText}`
        : `---------- Forwarded message ----------\n${email!.bodyText}`

      await api.post("/emails/send", {
        from: email!.address,
        to: forwardTo.trim(),
        subject: `Fwd: ${email!.subject}`,
        bodyText: body,
      })
      toast({ type: "success", title: "Email forwarded!" })
      setShowForward(false)
      setForwardTo("")
      setForwardText("")
    } catch (err: any) {
      toast({ type: "error", title: err.message || "Failed to forward email" })
    } finally {
      setForwardSending(false)
    }
  }

  async function handleDeleteEmail() {
    setDeleteLoading(true)
    try {
      await deleteEmail(email!.id)
      setDeleteLoading(false)
      setShowDeleteDialog(false)
      toast({ type: "success", title: "Email deleted" })
      navigate("/inbox")
    } catch {
      setDeleteLoading(false)
      toast({ type: "error", title: "Failed to delete email" })
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Inbox", to: "/inbox" }, { label: truncatedSubject }]} />

      <Link to="/inbox" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Inbox
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-border bg-card overflow-hidden"
      >
        {/* Direction banner */}
        <div className={`flex items-center gap-2 px-5 py-2 text-xs font-medium ${
          email.direction === "inbound"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-blue-500/10 text-blue-400"
        }`}>
          {email.direction === "inbound"
            ? <><ArrowDownLeft className="h-3.5 w-3.5" /> Incoming — {email.address}</>
            : <><ArrowUpRight className="h-3.5 w-3.5" /> Outgoing — {email.address}</>
          }
        </div>

        <div className="flex items-start gap-4 p-6">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
            {email.from.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground break-words">{email.from}</p>
                <p className="mt-0.5 text-sm text-muted-foreground break-words">To: {email.to.join(", ")}</p>
                {email.cc.length > 0 && <p className="text-sm text-muted-foreground break-words">CC: {email.cc.join(", ")}</p>}
              </div>
              <span className="flex-shrink-0 font-mono text-xs text-muted-foreground whitespace-nowrap">
                {createdAtDate.toLocaleString()}
              </span>
            </div>
            <h1 className="mt-4 text-xl font-bold text-foreground break-words">{email.subject}</h1>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="rounded-xl border border-border bg-card p-6"
      >
        {email.bodyHtml ? (
          <div
            className="prose prose-sm prose-invert max-w-none text-foreground/85 [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
          />
        ) : (
          <div className="text-sm leading-relaxed text-foreground/85 space-y-1">
            {email.bodyText.split("\n").map((line, i) => {
              const isQuote = line.startsWith(">") || line.startsWith("On ") && line.includes("wrote:")
              return (
                <p
                  key={i}
                  className={isQuote ? "text-muted-foreground/60 text-xs pl-3 border-l border-border/50" : ""}
                >
                  {line || "\u00A0"}
                </p>
              )
            })}
          </div>
        )}
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => { setShowReply(!showReply); setShowForward(false) }}>
          <Reply className="h-4 w-4" /> Reply
        </Button>
        <Button variant="outline" onClick={() => { setShowForward(!showForward); setShowReply(false) }}>
          <Forward className="h-4 w-4" /> Forward
        </Button>
        <Button variant="ghost" onClick={() => setShowRawHeaders(!showRawHeaders)}>
          <Code className="h-4 w-4" /> {showRawHeaders ? "Hide raw headers" : "Show raw headers"}
        </Button>
        <div className="hidden flex-1 sm:block" />
        <Button variant="ghost" onClick={() => setShowDeleteDialog(true)}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <AnimatePresence>
        {showReply && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Replying to {email.from}</p>
              <div>
                <textarea
                  rows={4}
                  placeholder="Write your reply..."
                  value={replyText}
                  onChange={(e) => { setReplyText(e.target.value); if (replyError) setReplyError("") }}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
                {replyError && <p className="mt-1 text-xs text-status-error">{replyError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowReply(false)}>Cancel</Button>
                <Button onClick={handleSendReply} disabled={replySending}>
                  <Send className="h-4 w-4" /> {replySending ? "Sending..." : "Send Reply"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForward && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div>
                <Label className="mb-1.5 block">To</Label>
                <Input
                  placeholder="recipient@example.com"
                  value={forwardTo}
                  onChange={(e) => { setForwardTo(e.target.value); if (forwardToError) setForwardToError("") }}
                />
                {forwardToError && <p className="mt-1 text-xs text-status-error">{forwardToError}</p>}
              </div>
              <textarea
                rows={4}
                placeholder="Add a message (optional)..."
                value={forwardText}
                onChange={(e) => setForwardText(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowForward(false)}>Cancel</Button>
                <Button onClick={handleSendForward} disabled={forwardSending}>
                  <Send className="h-4 w-4" /> {forwardSending ? "Sending..." : "Forward"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRawHeaders && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <pre className="font-mono text-xs bg-secondary p-4 rounded-lg text-muted-foreground overflow-x-auto">
              {Object.entries(rawHeaders)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n")}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete this email?"
        description="This action cannot be undone. The email will be permanently removed."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteEmail}
        loading={deleteLoading}
      />
    </div>
  )
}
