import { Link } from "react-router-dom"
import { Plus, ArrowUpRight, Globe, Mail, Send, CheckCircle, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useDomains, useEmails, useUsage } from "@/lib/hooks"
import { motion } from "framer-motion"

function timeAgo(date: Date) {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

export default function DashboardPage() {
  const { domains, loading: domainsLoading } = useDomains()
  const { emails, loading: emailsLoading } = useEmails()
  const { usage, loading: usageLoading } = useUsage()

  const loading = domainsLoading || emailsLoading || usageLoading

  if (loading) {
    return (
      <div className="space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-muted" />
          ))}
        </div>
        <div className="h-20 animate-pulse rounded-xl border border-border bg-muted" />
        <div className="h-48 animate-pulse rounded-xl border border-border bg-muted" />
      </div>
    )
  }

  const recentEmails = emails.slice(0, 4)
  const activeDomains = domains.filter((d) => d.status === "active").length
  const pendingDomains = domains.filter((d) => d.status === "pending").length

  const hasDomains = domains.length > 0
  const hasActiveDomain = activeDomains > 0
  const hasSentEmails = usage ? usage.emailsSent > 0 : false

  const steps = [
    { label: "Create your account", done: true },
    { label: "Add your first domain", done: hasDomains },
    { label: "Verify DNS records", done: hasActiveDomain },
    { label: "Send your first email", done: hasSentEmails },
  ]
  const completedSteps = steps.filter((s) => s.done).length
  const showOnboarding = completedSteps < 4 || pendingDomains > 0

  return (
    <motion.div
      className="space-y-10"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div
        variants={item}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your email infrastructure at a glance.
          </p>
        </div>
        <Link to="/setup">
          <Button>
            <Plus className="h-4 w-4" /> Add Domain
          </Button>
        </Link>
      </motion.div>

      {/* Onboarding Checklist */}
      {showOnboarding && (
        <motion.div
          variants={item}
          className="rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-sm font-semibold">Getting Started</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {completedSteps} of {steps.length} completed
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${(completedSteps / steps.length) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            />
          </div>
          <ul className="mt-4 space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                {step.done ? (
                  <CheckCircle className="h-4.5 w-4.5 flex-shrink-0 text-status-active" />
                ) : (
                  <Circle className="h-4.5 w-4.5 flex-shrink-0 text-muted-foreground/30" />
                )}
                <span
                  className={
                    step.done ? "text-muted-foreground line-through" : "text-foreground"
                  }
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div
        variants={item}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Domains
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {usage?.domains ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeDomains} active, {pendingDomains} pending
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sent this month
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {(usage?.emailsSent ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            outbound via SES
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Received this month
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {(usage?.emailsReceived ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {usage?.addresses ?? 0} address{(usage?.addresses ?? 0) === 1 ? "" : "es"} listening
          </p>
        </div>
      </motion.div>

      {/* Your Domains */}
      <motion.div variants={item}>
        <h2 className="mb-4 text-lg font-semibold">Your Domains</h2>
        {hasDomains ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {domains.map((domain) => (
              <Link key={domain.id} to={`/domains/${domain.id}`} className="group block">
                <motion.div
                  whileHover={{ scale: 1.005 }}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={
                          domain.status === "active"
                            ? "mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-status-active"
                            : "mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-status-pending animate-status-pulse"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-medium" title={domain.domain}>
                          {domain.domain}
                        </p>
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          {domain.addresses.length} address
                          {domain.addresses.length !== 1 ? "es" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Badge
                        variant={domain.status === "active" ? "success" : "warning"}
                      >
                        {domain.status}
                      </Badge>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Globe}
            title="Add your first domain"
            description="Connect a custom domain to start sending and receiving emails."
            action={
              <Link to="/setup">
                <Button>
                  <Plus className="h-4 w-4" /> Add Domain
                </Button>
              </Link>
            }
          />
        )}
      </motion.div>

      {/* Recent Emails */}
      <motion.div variants={item}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Emails</h2>
          <Link
            to="/inbox"
            className="text-sm text-primary hover:underline"
          >
            View all &rarr;
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {recentEmails.map((email) => (
            <Link
              key={email.id}
              to={`/inbox/${email.id}`}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
            >
              {!email.isRead ? (
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
              ) : (
                <span className="h-2 w-2 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={
                      !email.isRead
                        ? "truncate text-sm font-semibold"
                        : "truncate text-sm text-muted-foreground"
                    }
                  >
                    {email.from}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {timeAgo(new Date(email.createdAt))}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {email.subject}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

    </motion.div>
  )
}
