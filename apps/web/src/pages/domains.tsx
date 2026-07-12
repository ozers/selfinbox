import { useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Globe, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { EmptyState } from "@/components/ui/empty-state"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import { useDomains, useDemoLinks } from "@/lib/hooks"
import { staggerContainer as container, fadeUpItem as item } from "@/lib/motion"
import { motion } from "framer-motion"

type Tab = "all" | "active" | "pending"

export default function DomainsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const { domains, loading } = useDomains()
  const { isDemo, prefix: linkPrefix, setupPath } = useDemoLinks()

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-5 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  const filteredDomains = domains.filter((d) => {
    if (activeTab === "all") return true
    return d.status === activeTab
  })

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: domains.length },
    { key: "active", label: "Active", count: domains.filter((d) => d.status === "active").length },
    { key: "pending", label: "Pending", count: domains.filter((d) => d.status === "pending").length },
  ]

  const hasDomains = domains.length > 0

  const emptyDescription =
    activeTab === "active"
      ? "No active domains yet. Verify your DNS records to activate a domain."
      : activeTab === "pending"
        ? "No pending domains. All your domains are verified."
        : "No domains found."

  return (
    <motion.div
      className="space-y-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Breadcrumb */}
      <motion.div variants={item}>
        <Breadcrumb items={[{ label: "Domains" }]} />
      </motion.div>

      {/* Header */}
      <motion.div
        variants={item}
        className="flex items-center justify-between"
      >
        <h1 className="text-2xl font-bold">Domains</h1>
        {!isDemo && (
          <Link to={setupPath}>
            <Button>
              <Plus className="h-4 w-4" /> Add Domain
            </Button>
          </Link>
        )}
      </motion.div>

      {!hasDomains ? (
        <motion.div variants={item}>
          <EmptyState
            icon={Globe}
            title="No domains yet"
            description="Add your first domain to start sending emails."
            action={
              <Link to={setupPath}>
                <Button>
                  <Plus className="h-4 w-4" /> Add Domain
                </Button>
              </Link>
            }
          />
        </motion.div>
      ) : (
        <>
          {/* Filter Tabs */}
          <motion.div variants={item}>
            <SegmentedTabs
              tabs={tabs.map((t) => ({ value: t.key, label: t.label, count: t.count }))}
              value={activeTab}
              onChange={setActiveTab}
              itemClassName="px-4 py-2"
              className="w-full"
            />
          </motion.div>

          {/* Domain List */}
          {filteredDomains.length === 0 ? (
            <motion.div variants={item}>
              <EmptyState
                icon={Globe}
                title="No domains found"
                description={emptyDescription}
              />
            </motion.div>
          ) : (
            <motion.div variants={item} className="grid gap-4 sm:grid-cols-2">
              {filteredDomains.map((domain) => (
                <motion.div
                  key={domain.id}
                  whileHover={{ scale: 1.005 }}
                  className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
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
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {domain.addresses.length} address
                            {domain.addresses.length !== 1 ? "es" : ""}
                          </span>
                          <span className="opacity-50">&middot;</span>
                          <span>
                            Created {new Date(domain.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={domain.status === "active" ? "success" : "warning"}
                      className="flex-shrink-0"
                    >
                      {domain.status}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-end">
                    <Link to={`${linkPrefix}/domains/${domain.id}`}>
                      <Button variant="outline" size="sm">
                        Manage
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}
