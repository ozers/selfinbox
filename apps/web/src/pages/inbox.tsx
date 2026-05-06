import { useState, useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Plus, Search, Mail, Loader2, X, Minus, Send, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/components/ui/toast"
import { useEmails, useDomains } from "@/lib/hooks"
import { formatRelativeTime } from "@/lib/utils"
import { api } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function InboxPage() {
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [domainFilter, setDomainFilter] = useState(searchParams.get("domain") ?? "all")
  const [addressFilter, setAddressFilter] = useState(searchParams.get("address") ?? "")
  const [statusFilter, setStatusFilter] = useState("all")
  const [directionFilter, setDirectionFilter] = useState(searchParams.get("direction") ?? "all")

  useEffect(() => {
    setDirectionFilter(searchParams.get("direction") ?? "all")
    setDomainFilter(searchParams.get("domain") ?? "all")
    setAddressFilter(searchParams.get("address") ?? "")
  }, [searchParams])

  const { domains } = useDomains()
  const { emails, loading, error, refetch } = useEmails({
    domain: domainFilter !== "all" ? domainFilter : undefined,
    address: addressFilter || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    direction: directionFilter !== "all" ? directionFilter : undefined,
    search: searchQuery || undefined,
  })

  // Compose state
  const [showCompose, setShowCompose] = useState(false)
  const [composeMinimized, setComposeMinimized] = useState(false)
  const [composeFrom, setComposeFrom] = useState("")
  const [composeTo, setComposeTo] = useState("")
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBody, setComposeBody] = useState("")
  const [composeErrors, setComposeErrors] = useState<Record<string, string>>({})
  const [composeSending, setComposeSending] = useState(false)

  const fromOptions = domains.flatMap((d) =>
    d.addresses
      .filter((a) => a.isActive && !a.isCatchall)
      .map((a) => ({ value: a.address, label: a.displayName ? `${a.displayName} <${a.address}>` : a.address }))
  )

  function openCompose() {
    if (!composeFrom && fromOptions.length > 0) setComposeFrom(fromOptions[0].value)
    setShowCompose(true)
    setComposeMinimized(false)
  }

  function closeCompose() {
    setShowCompose(false)
    setComposeMinimized(false)
    setComposeFrom(fromOptions.length > 0 ? fromOptions[0].value : "")
    setComposeTo("")
    setComposeSubject("")
    setComposeBody("")
    setComposeErrors({})
    setComposeSending(false)
  }

  function validateCompose(): boolean {
    const errors: Record<string, string> = {}
    if (!composeFrom) errors.from = "Select a sender"
    if (!composeTo.trim()) errors.to = "Recipient is required"
    else if (!emailRegex.test(composeTo.trim())) errors.to = "Invalid email"
    if (!composeSubject.trim()) errors.subject = "Subject is required"
    if (!composeBody.trim()) errors.body = "Body is required"
    setComposeErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSend() {
    if (!validateCompose()) return
    setComposeSending(true)
    try {
      await api.post("/emails/send", {
        from: composeFrom,
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        bodyText: composeBody.trim(),
      })
      toast({ type: "success", title: "Email sent!" })
      closeCompose()
      refetch()
    } catch (err: any) {
      toast({ type: "error", title: err.message || "Failed to send email" })
    } finally {
      setComposeSending(false)
    }
  }

  const pageTitle = addressFilter ? addressFilter : domainFilter !== "all" ? domainFilter : "Inbox"
  const directionTabs = [
    { value: "all", label: "All" },
    { value: "inbound", label: "Incoming" },
    { value: "outbound", label: "Outgoing" },
  ]
  const statusTabs = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "read", label: "Read" },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Inbox" }]} />

      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground sm:text-2xl">{pageTitle}</h1>
        <Button onClick={openCompose} className="flex-shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Compose</span>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
          {directionTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setDirectionFilter(tab.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                directionFilter === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <EmptyState icon={Mail} title="Failed to load emails" description="An error occurred while fetching your emails." />
      ) : emails.length === 0 ? (
        <EmptyState icon={Mail} title="No emails found" description="Try adjusting your search or filters" />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {emails.map((email, index) => {
            const isInbound = email.direction === "inbound"
            const displayAddr = isInbound ? email.from : email.to[0] ?? email.address
            return (
              <motion.div
                key={email.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
              >
                <Link
                  to={`/inbox/${email.id}`}
                  className={`flex items-start gap-3 px-3 py-3 hover:bg-secondary/30 transition-colors sm:items-center sm:px-4 ${
                    index < emails.length - 1 ? "border-b border-border/50" : ""
                  }`}
                >
                  {/* Direction icon */}
                  <span className={`flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full ${
                    isInbound ? "bg-emerald-500/10" : "bg-blue-500/10"
                  }`}>
                    {isInbound
                      ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                      : <ArrowUpRight className="h-3.5 w-3.5 text-blue-400" />
                    }
                  </span>

                  {/* Unread dot */}
                  <span className={`mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full sm:mt-0 ${!email.isRead ? "bg-primary" : "bg-transparent"}`} />

                  {/* Mobile: stacked two-line layout */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:hidden">
                    <div className="flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-sm ${!email.isRead ? "font-semibold text-foreground" : "text-foreground/70"}`}>
                        {displayAddr}
                      </span>
                      <span className="flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                        {formatRelativeTime(new Date(email.createdAt))}
                      </span>
                    </div>
                    <span className={`truncate text-sm ${!email.isRead ? "text-foreground/90" : "text-foreground/60"}`}>
                      {email.subject}
                    </span>
                  </div>

                  {/* Desktop: single-line horizontal layout */}
                  <span className={`hidden w-40 truncate text-sm sm:inline-block ${!email.isRead ? "font-semibold text-foreground" : "text-foreground/70"}`}>
                    {displayAddr}
                  </span>
                  <span className={`hidden flex-1 truncate text-sm sm:inline-block ${!email.isRead ? "text-foreground/90" : "text-foreground/60"}`}>
                    {email.subject}
                  </span>
                  <span className={`hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono sm:inline-block ${
                    isInbound ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                  }`}>
                    {email.address}
                  </span>
                  <span className="hidden flex-shrink-0 font-mono text-xs text-muted-foreground w-16 text-right sm:inline-block">
                    {formatRelativeTime(new Date(email.createdAt))}
                  </span>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Floating Compose Panel */}
      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-2 left-2 right-2 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden sm:left-auto sm:bottom-6 sm:right-6 sm:w-[460px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between bg-foreground/5 px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">
                {composeSubject.trim() || "New Email"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setComposeMinimized(!composeMinimized)}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={closeCompose}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {!composeMinimized && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="divide-y divide-border/60">
                    {/* From */}
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="w-12 flex-shrink-0 text-xs font-medium text-muted-foreground">From</span>
                      <select
                        value={composeFrom}
                        onChange={(e) => { setComposeFrom(e.target.value); if (composeErrors.from) setComposeErrors((p) => ({ ...p, from: "" })) }}
                        className="flex-1 bg-transparent text-sm text-foreground outline-none py-1"
                      >
                        {fromOptions.length === 0
                          ? <option value="">No addresses — add one in Domains</option>
                          : fromOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                        }
                      </select>
                    </div>

                    {/* To */}
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="w-12 flex-shrink-0 text-xs font-medium text-muted-foreground">To</span>
                      <input
                        type="text"
                        placeholder="recipient@example.com"
                        value={composeTo}
                        onChange={(e) => { setComposeTo(e.target.value); if (composeErrors.to) setComposeErrors((p) => ({ ...p, to: "" })) }}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1"
                      />
                    </div>

                    {/* Subject */}
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="w-12 flex-shrink-0 text-xs font-medium text-muted-foreground">Subject</span>
                      <input
                        type="text"
                        placeholder="Email subject"
                        value={composeSubject}
                        onChange={(e) => { setComposeSubject(e.target.value); if (composeErrors.subject) setComposeErrors((p) => ({ ...p, subject: "" })) }}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1"
                      />
                    </div>

                    {/* Body */}
                    <div className="px-4 pt-3 pb-2">
                      <textarea
                        rows={5}
                        placeholder="Write your message..."
                        value={composeBody}
                        onChange={(e) => { setComposeBody(e.target.value); if (composeErrors.body) setComposeErrors((p) => ({ ...p, body: "" })) }}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed sm:min-h-[160px]"
                      />
                    </div>

                    {/* Errors */}
                    {Object.keys(composeErrors).length > 0 && (
                      <div className="px-4 py-2">
                        {Object.values(composeErrors).map((e) => (
                          <p key={e} className="text-xs text-status-error">{e}</p>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <Button
                        onClick={handleSend}
                        disabled={composeSending || fromOptions.length === 0}
                        size="sm"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {composeSending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
