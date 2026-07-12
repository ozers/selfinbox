import { useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Plus, RefreshCw, Trash2, KeyRound, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/form-field"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { Dialog } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { PageLoader, PageNotFound } from "@/components/ui/page-state"
import { useToast } from "@/components/ui/toast"
import { DnsRecordList } from "@/components/dns-record-list"
import { useDomain, useDomainActions, useDemoLinks } from "@/lib/hooks"
import { isValidEmail, errorMessage } from "@/lib/utils"
import { staggerContainer, fadeUpItem } from "@/lib/motion"
import { motion } from "framer-motion"

const fieldLabelClass = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground"

export default function DomainDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { domain, loading, refetch } = useDomain(id)
  const { verifyDomain, createAddress, createCatchall, deleteAddress, deleteDomain } = useDomainActions()
  const { isDemo, domainsPath } = useDemoLinks()

  const [showAddForm, setShowAddForm] = useState(false)
  const [addressPrefix, setAddressPrefix] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [forwardingEmail, setForwardingEmail] = useState("")
  const [prefixError, setPrefixError] = useState("")
  const [forwardingError, setForwardingError] = useState("")
  const [recheckLoading, setRecheckLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null)

  if (loading) return <PageLoader />

  if (!domain) {
    return <PageNotFound message="Domain not found." backTo={domainsPath} backLabel="Back to Domains" />
  }

  const handleRecheck = async () => {
    setRecheckLoading(true)
    try {
      await verifyDomain(id!)
      await refetch()
      toast({ type: "success", title: "DNS records checked!" })
    } catch {
      toast({ type: "error", title: "Failed to check DNS records." })
    } finally {
      setRecheckLoading(false)
    }
  }

  const resetAddForm = () => {
    setAddressPrefix("")
    setDisplayName("")
    setForwardingEmail("")
    setPrefixError("")
    setForwardingError("")
  }

  const validateAndSaveAddress = async () => {
    let valid = true
    setPrefixError("")
    setForwardingError("")

    if (!addressPrefix.trim()) {
      setPrefixError("Address prefix is required.")
      valid = false
    }

    if (forwardingEmail.trim() && !isValidEmail(forwardingEmail.trim())) {
      setForwardingError("Enter a valid email address.")
      valid = false
    }

    if (!valid) return

    try {
      await createAddress(id!, addressPrefix.trim(), forwardingEmail.trim() || undefined, displayName.trim() || undefined)
      await refetch()
      resetAddForm()
      setShowAddForm(false)
      toast({ type: "success", title: "Email address created!" })
    } catch {
      toast({ type: "error", title: "Failed to create email address." })
    }
  }

  const handleDeleteDomain = async () => {
    setDeleteDialogOpen(false)
    try {
      await deleteDomain(id!)
      toast({ type: "success", title: "Domain deleted", description: `${domain.domain} has been removed.` })
      navigate(domainsPath)
    } catch {
      toast({ type: "error", title: "Failed to delete domain." })
    }
  }

  const handleDeleteAddress = async () => {
    const addressId = deleteAddressId
    setDeleteAddressId(null)
    try {
      await deleteAddress(id!, addressId!)
      await refetch()
      toast({ type: "success", title: "Email address deleted" })
    } catch {
      toast({ type: "error", title: "Failed to delete email address." })
    }
  }

  const addressToDelete = domain.addresses.find((a) => a.id === deleteAddressId)

  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* Breadcrumb */}
      <motion.div variants={fadeUpItem}>
        <Breadcrumb
          items={[
            { label: "Domains", to: domainsPath },
            { label: domain.domain },
          ]}
        />
      </motion.div>

      {/* Header */}
      <motion.div
        variants={fadeUpItem}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 truncate font-mono text-lg font-bold" title={domain.domain}>{domain.domain}</h1>
          <Badge
            variant={domain.status === "active" ? "success" : "warning"}
            className="flex-shrink-0"
          >
            {domain.status}
          </Badge>
        </div>
        {!isDemo && (
          <Link to={`/domains/${id}/smtp`}>
            <Button variant="outline">
              <KeyRound className="h-4 w-4" /> SMTP Credentials
            </Button>
          </Link>
        )}
      </motion.div>

      {/* DNS Records */}
      <motion.div
        variants={fadeUpItem}
        className="rounded-xl border border-border bg-card"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">DNS Records</h2>
          {!isDemo && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecheck}
              disabled={recheckLoading}
            >
              {recheckLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {recheckLoading ? "Checking..." : "Recheck DNS"}
            </Button>
          )}
        </div>
        <DnsRecordList records={domain.dnsRecords} />
      </motion.div>

      {/* Email Addresses */}
      <motion.div
        variants={fadeUpItem}
        className="rounded-xl border border-border bg-card"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Email Addresses</h2>
          {!isDemo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(!showAddForm)
                setPrefixError("")
                setForwardingError("")
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Address
            </Button>
          )}
        </div>

        {!isDemo && showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="border-b border-border px-5 py-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <FormField label="Address" labelClassName={fieldLabelClass} error={prefixError || null} className="flex-1">
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Input
                    placeholder="name"
                    value={addressPrefix}
                    onChange={(e) => {
                      setAddressPrefix(e.target.value)
                      if (prefixError) setPrefixError("")
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    @{domain.domain}
                  </span>
                </div>
              </FormField>
              <FormField label="Display name" labelClassName={fieldLabelClass} className="flex-1">
                <Input
                  className="mt-1.5"
                  placeholder="HookSense (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </FormField>
              <FormField label="Forward to" labelClassName={fieldLabelClass} error={forwardingError || null} className="flex-1">
                <Input
                  className="mt-1.5"
                  type="email"
                  placeholder="you@gmail.com (optional)"
                  value={forwardingEmail}
                  onChange={(e) => {
                    setForwardingEmail(e.target.value)
                    if (forwardingError) setForwardingError("")
                  }}
                />
              </FormField>
              <div className="flex gap-2 lg:pt-5">
                <Button size="sm" onClick={validateAndSaveAddress}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false)
                    resetAddForm()
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {domain.addresses.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No email addresses yet. Add one to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {domain.addresses.map((addr) => (
              <div
                key={addr.id}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm break-all">
                    {addr.displayName ? <span className="font-sans font-medium text-foreground">{addr.displayName} </span> : null}
                    {addr.address}
                  </p>
                  {addr.forwardingTo && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Forwards to {addr.forwardingTo}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge variant={addr.isActive ? "success" : "warning"}>
                    {addr.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {!isDemo && (
                    <button
                      onClick={() => setDeleteAddressId(addr.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-status-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Catch-all */}
      {!isDemo && (() => {
        const catchall = domain.addresses.find((a) => a.isCatchall)
        const enabled = !!catchall
        const handleToggle = async () => {
          try {
            if (enabled && catchall) {
              await deleteAddress(domain.id, catchall.id)
              toast({ type: "success", title: "Catch-all disabled" })
            } else {
              await createCatchall(domain.id)
              toast({ type: "success", title: "Catch-all enabled", description: `*@${domain.domain}` })
            }
            await refetch()
          } catch (err) {
            toast({ type: "error", title: errorMessage(err, "Failed to toggle catch-all") })
          }
        }
        return (
          <motion.div
            variants={fadeUpItem}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 className="text-sm font-semibold">Catch-all Address</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {enabled
                  ? `Active — any address @${domain.domain} routes to this inbox.`
                  : "Receive emails sent to any address at this domain."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={enabled} onChange={handleToggle} aria-label="Toggle catch-all address" />
            </div>
          </motion.div>
        )
      })()}

      {/* Danger Zone */}
      {!isDemo && (
        <motion.div
          variants={fadeUpItem}
          className="rounded-xl border border-status-error/30 bg-card"
        >
          <div className="border-b border-status-error/30 px-5 py-4">
            <h2 className="text-sm font-semibold text-status-error">
              Danger Zone
            </h2>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Delete this domain</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This will permanently remove the domain and all associated email
                addresses.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="w-full sm:w-auto">
              <Trash2 className="h-4 w-4" /> Delete Domain
            </Button>
          </div>
        </motion.div>
      )}

      {/* Delete Domain Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete domain"
        description={`Are you sure you want to delete ${domain.domain}? This will remove all email addresses and cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteDomain}
      />

      {/* Delete Address Dialog */}
      <Dialog
        open={deleteAddressId !== null}
        onClose={() => setDeleteAddressId(null)}
        title="Delete email address"
        description={
          addressToDelete
            ? `Are you sure you want to delete ${addressToDelete.address}? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteAddress}
      />
    </motion.div>
  )
}
