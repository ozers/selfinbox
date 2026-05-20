import { Link } from "react-router-dom"
import { useMemo } from "react"
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Globe,
  Mail,
  Send,
  Inbox as InboxIcon,
  CheckCircle,
  Circle,
  AlertCircle,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useDomains, useEmails, useUsage } from "@/lib/hooks"
import { useAuth } from "@/lib/auth"
import { useMockEnabled } from "@/lib/mock-data"
import { motion } from "framer-motion"

function timeAgo(date: Date) {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString()
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
}

// Inline SVG sparkline — buckets values into N bars from a series of timestamps
function Sparkline({
  timestamps,
  windowDays = 14,
  className = "",
}: {
  timestamps: number[]
  windowDays?: number
  className?: string
}) {
  const buckets = useMemo(() => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const arr = new Array<number>(windowDays).fill(0)
    for (const t of timestamps) {
      const daysAgo = Math.floor((now - t) / dayMs)
      if (daysAgo >= 0 && daysAgo < windowDays) {
        arr[windowDays - 1 - daysAgo]++
      }
    }
    return arr
  }, [timestamps, windowDays])

  const max = Math.max(1, ...buckets)
  const w = 80
  const h = 28
  const barW = w / windowDays
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      {buckets.map((v, i) => {
        const barH = Math.max(1, (v / max) * h)
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - barH}
            width={barW - 1}
            height={barH}
            rx={0.5}
            className="fill-current"
            opacity={v === 0 ? 0.15 : 0.6}
          />
        )
      })}
    </svg>
  )
}

function trendPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

export default function DashboardPage() {
  const { user } = useAuth()
  const isDemo = useMockEnabled()
  const prefix = isDemo ? "/demo" : ""
  const inboxPath = `${prefix}/inbox`
  const domainsPath = `${prefix}/domains`
  const setupPath = isDemo ? `${prefix}/domains` : "/setup"
  const { domains, loading: domainsLoading } = useDomains()
  const { emails, loading: emailsLoading } = useEmails()
  const { usage, loading: usageLoading } = useUsage()

  const loading = domainsLoading || emailsLoading || usageLoading

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-xl bg-muted/40 lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-xl bg-muted/40" />
        </div>
      </div>
    )
  }

  const activeDomains = domains.filter((d) => d.status === "active").length
  const pendingDomains = domains.filter((d) => d.status === "pending")

  const hasDomains = domains.length > 0
  const hasActiveDomain = activeDomains > 0
  const hasSentEmails = usage ? usage.emailsSent > 0 : false

  // Activity timeline (recent N) — combined inbound + outbound
  const recentEmails = emails.slice(0, 6)
  const unreadCount = emails.filter((e) => e.direction === "inbound" && !e.isRead).length

  // Sparkline data + trends
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const sentTimestamps = emails.filter((e) => e.direction === "outbound").map((e) => new Date(e.createdAt).getTime())
  const recvTimestamps = emails.filter((e) => e.direction === "inbound").map((e) => new Date(e.createdAt).getTime())

  const sentLast14 = sentTimestamps.filter((t) => now - t < 14 * dayMs).length
  const sentPrev14 = sentTimestamps.filter((t) => {
    const age = now - t
    return age >= 14 * dayMs && age < 28 * dayMs
  }).length
  const recvLast14 = recvTimestamps.filter((t) => now - t < 14 * dayMs).length
  const recvPrev14 = recvTimestamps.filter((t) => {
    const age = now - t
    return age >= 14 * dayMs && age < 28 * dayMs
  }).length

  const sentTrend = trendPercent(sentLast14, sentPrev14)
  const recvTrend = trendPercent(recvLast14, recvPrev14)

  // Onboarding — actionable steps, each with a description + CTA target
  const firstPendingDomain = pendingDomains[0]
  const onboardingSteps: Array<{
    label: string
    description: string
    done: boolean
    cta?: { label: string; to: string }
  }> = [
    {
      label: "Create your account",
      description: "Welcome! You're signed in.",
      done: true,
    },
    {
      label: "Add your first domain",
      description: "Connect a domain you own. Selfinbox generates DNS records for SES.",
      done: hasDomains,
      cta: { label: "Add domain", to: "/setup" },
    },
    {
      label: "Verify DNS records",
      description: firstPendingDomain
        ? `Paste records at your registrar for ${firstPendingDomain.domain}, then we poll for verification.`
        : "Paste the generated MX/SPF/DKIM/DMARC records at your registrar.",
      done: hasActiveDomain,
      cta: firstPendingDomain
        ? { label: "Open domain", to: `/domains/${firstPendingDomain.id}` }
        : hasDomains
          ? { label: "View domains", to: "/domains" }
          : undefined,
    },
    {
      label: "Send your first email",
      description: "Open the inbox and compose a test message to confirm everything works.",
      done: hasSentEmails,
      cta: { label: "Open inbox", to: "/inbox" },
    },
  ]
  const completedSteps = onboardingSteps.filter((s) => s.done).length
  const showOnboarding = completedSteps < 4
  const nextPendingIndex = onboardingSteps.findIndex((s) => !s.done)

  // Smart subtitle
  const greeting = user?.name?.split(" ")[0] || "there"
  const subtitleBits: string[] = []
  if (unreadCount > 0) subtitleBits.push(`${unreadCount} unread`)
  if (activeDomains > 0) subtitleBits.push(`${activeDomains} active domain${activeDomains === 1 ? "" : "s"}`)
  if (pendingDomains.length > 0) subtitleBits.push(`${pendingDomains.length} pending verification`)
  const subtitle = subtitleBits.length > 0
    ? subtitleBits.join(" · ")
    : "Get started by adding your first domain."

  return (
    <motion.div
      className="space-y-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Hero */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {greeting}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Link to={inboxPath}>
              <Button variant="outline" size="sm">
                <InboxIcon className="h-4 w-4" />
                Inbox{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </Button>
            </Link>
            <Link to={setupPath}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add Domain
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Pending verification alert */}
      {pendingDomains.length > 0 && (
        <motion.div
          variants={item}
          className="flex items-start gap-3 rounded-xl border border-status-pending/40 bg-status-pending/5 p-4"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-pending" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {pendingDomains.length} domain{pendingDomains.length === 1 ? "" : "s"} awaiting DNS verification
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pendingDomains.slice(0, 4).map((d) => (
                <Link
                  key={d.id}
                  to={`${domainsPath}/${d.id}`}
                  className="rounded-md bg-card px-2 py-1 font-mono text-xs hover:bg-muted/60 transition-colors"
                >
                  {d.domain}
                </Link>
              ))}
              {pendingDomains.length > 4 && (
                <span className="rounded-md bg-card px-2 py-1 text-xs text-muted-foreground">
                  +{pendingDomains.length - 4} more
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats strip — 4 cards with sparklines */}
      <motion.div variants={item} className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Domains"
          value={usage?.domains ?? 0}
          sub={`${activeDomains} active`}
          icon={Globe}
        />
        <StatCard
          label="Addresses"
          value={usage?.addresses ?? 0}
          sub="listening"
          icon={Mail}
        />
        <StatCard
          label="Sent (30d)"
          value={(usage?.emailsSent ?? 0).toLocaleString()}
          sub={sentTrend !== null ? `${sentTrend >= 0 ? "+" : ""}${sentTrend}% vs prev 14d` : "no prior data"}
          subTone={sentTrend !== null ? (sentTrend >= 0 ? "positive" : "negative") : "neutral"}
          icon={Send}
          sparkline={<Sparkline timestamps={sentTimestamps} className="h-7 w-20 text-primary" />}
        />
        <StatCard
          label="Received (30d)"
          value={(usage?.emailsReceived ?? 0).toLocaleString()}
          sub={recvTrend !== null ? `${recvTrend >= 0 ? "+" : ""}${recvTrend}% vs prev 14d` : "no prior data"}
          subTone={recvTrend !== null ? (recvTrend >= 0 ? "positive" : "negative") : "neutral"}
          icon={ArrowDownLeft}
          sparkline={<Sparkline timestamps={recvTimestamps} className="h-7 w-20 text-emerald-500" />}
        />
      </motion.div>

      {/* Onboarding (only if incomplete) */}
      {showOnboarding && (
        <motion.div variants={item} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Getting started</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-secondary sm:block">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" as const, delay: 0.2 }}
                />
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {completedSteps}/{onboardingSteps.length}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {onboardingSteps.map((step, i) => {
              const isNext = i === nextPendingIndex
              const inner = (
                <div className={`flex items-start gap-3 px-5 py-4 transition-colors ${
                  step.done ? "opacity-60" : isNext ? "bg-primary/[0.04]" : ""
                } ${step.cta ? "hover:bg-muted/40" : ""}`}>
                  <span className="mt-0.5 flex-shrink-0">
                    {step.done ? (
                      <CheckCircle className="h-5 w-5 text-status-active" />
                    ) : isNext ? (
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                      </span>
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${
                      step.done ? "text-muted-foreground line-through" : isNext ? "text-foreground" : "text-foreground/80"
                    }`}>
                      {step.label}
                    </p>
                    {!step.done && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    )}
                  </div>
                  {!step.done && step.cta && (
                    <ArrowUpRight className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                      isNext ? "text-primary" : "text-muted-foreground"
                    }`} />
                  )}
                </div>
              )
              return !step.done && step.cta ? (
                <Link key={i} to={step.cta.to} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={i}>{inner}</div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Two-column: Domains + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Domains */}
        <motion.div variants={item} className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Domains</h2>
            {hasDomains && (
              <Link to={domainsPath} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Manage all &rarr;
              </Link>
            )}
          </div>
          {hasDomains ? (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {domains.slice(0, 5).map((d) => (
                <Link
                  key={d.id}
                  to={`${domainsPath}/${d.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
                >
                  <span
                    className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      d.status === "active"
                        ? "bg-status-active"
                        : "bg-status-pending animate-status-pulse"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm" title={d.domain}>
                      {d.domain}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.addresses.length} address{d.addresses.length === 1 ? "" : "es"}
                    </p>
                  </div>
                  <Badge
                    variant={d.status === "active" ? "success" : "warning"}
                    className="flex-shrink-0"
                  >
                    {d.status}
                  </Badge>
                  <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
              {domains.length > 5 && (
                <Link
                  to={domainsPath}
                  className="flex items-center justify-center gap-1 px-5 py-2.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  +{domains.length - 5} more
                </Link>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Globe}
              title="No domains yet"
              description="Connect a domain you own to start sending and receiving."
              action={
                <Link to={setupPath}>
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Add Domain
                  </Button>
                </Link>
              }
            />
          )}
        </motion.div>

        {/* Recent activity */}
        <motion.div variants={item}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent activity</h2>
            {recentEmails.length > 0 && (
              <Link to={inboxPath} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all &rarr;
              </Link>
            )}
          </div>
          {recentEmails.length > 0 ? (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {recentEmails.map((email) => {
                const isInbound = email.direction === "inbound"
                const partner = isInbound ? email.from : (email.to[0] ?? email.address)
                const displaySubject = email.subject
                const unread = isInbound && !email.isRead
                return (
                  <Link
                    key={email.id}
                    to={`${inboxPath}/${email.id}`}
                    className="flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                        isInbound ? "bg-emerald-500/10" : "bg-blue-500/10"
                      }`}
                    >
                      {isInbound ? (
                        <ArrowDownLeft className="h-2.5 w-2.5 text-emerald-500" />
                      ) : (
                        <ArrowUpRight className="h-2.5 w-2.5 text-blue-400" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-xs ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                          {partner}
                        </span>
                        <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">
                          {timeAgo(new Date(email.createdAt))}
                        </span>
                      </div>
                      <p className={`mt-0.5 truncate text-xs ${unread ? "text-foreground/80" : "text-muted-foreground/70"}`}>
                        {displaySubject || "(no subject)"}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Mail className="mx-auto h-6 w-6 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No emails yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {hasActiveDomain ? "Send your first one from the inbox." : "Verify a domain to start receiving."}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

function StatCard({
  label,
  value,
  sub,
  subTone = "neutral",
  icon: Icon,
  sparkline,
}: {
  label: string
  value: string | number
  sub?: string
  subTone?: "positive" | "negative" | "neutral"
  icon: typeof Globe
  sparkline?: React.ReactNode
}) {
  const subColor =
    subTone === "positive"
      ? "text-emerald-500"
      : subTone === "negative"
        ? "text-status-error"
        : "text-muted-foreground"
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        {sub && <p className={`truncate text-[11px] ${subColor}`}>{sub}</p>}
        {sparkline && <div className="flex-shrink-0">{sparkline}</div>}
      </div>
    </div>
  )
}
