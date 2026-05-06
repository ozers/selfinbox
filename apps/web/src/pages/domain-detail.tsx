import { useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import {
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  Trash2,
  KeyRound,
  Loader2,
  Copy,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useDomain, useDomainActions } from "@/lib/hooks"
import { motion } from "framer-motion"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

export default function DomainDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { domain, loading, refetch } = useDomain(id)
  const { verifyDomain, createAddress, deleteAddress, deleteDomain } = useDomainActions()

  const [showAddForm, setShowAddForm] = useState(false)
  const [addressPrefix, setAddressPrefix] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [forwardingEmail, setForwardingEmail] = useState("")
  const [prefixError, setPrefixError] = useState("")
  const [forwardingError, setForwardingError] = useState("")
  const [recheckLoading, setRecheckLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!domain) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-muted-foreground">Domain not found.</p>
        <Link
          to="/domains"
          className="mt-4 text-sm text-primary hover:underline"
        >
          Back to Domains
        </Link>
      </div>
    )
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

  const validateAndSaveAddress = async () => {
    let valid = true
    setPrefixError("")
    setForwardingError("")

    if (!addressPrefix.trim()) {
      setPrefixError("Address prefix is required.")
      valid = false
    }

    if (forwardingEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forwardingEmail.trim())) {
      setForwardingError("Enter a valid email address.")
      valid = false
    }

    if (!valid) return

    try {
      await createAddress(id!, addressPrefix.trim(), forwardingEmail.trim() || undefined, displayName.trim() || undefined)
      await refetch()
      setAddressPrefix("")
      setDisplayName("")
      setForwardingEmail("")
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
      navigate("/domains")
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
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Breadcrumb */}
      <motion.div variants={item}>
        <Breadcrumb
          items={[
            { label: "Domains", to: "/domains" },
            { label: domain.domain },
          ]}
        />
      </motion.div>

      {/* Header */}
      <motion.div
        variants={item}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-bold">{domain.domain}</h1>
          <Badge
            variant={domain.status === "active" ? "success" : "warning"}
          >
            {domain.status}
          </Badge>
        </div>
        <Link to={`/domains/${id}/smtp`}>
          <Button variant="outline">
            <KeyRound className="h-4 w-4" /> SMTP Credentials
          </Button>
        </Link>
      </motion.div>

      {/* DNS Records */}
      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">DNS Records</h2>
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
        </div>
        <div className="divide-y divide-border">
          {domain.dnsRecords.map((record, i) => {
            const isMx = record.type === "MX"
            const [mxPriority, mxHost] = isMx ? record.value.split(" ") : ["", ""]
            return (
              <div key={i} className="group flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-3.5">
                {/* Type + status (header on mobile, left/right on desktop) */}
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {record.type}
                  </span>
                  <span className="sm:hidden">
                    {record.verified ? (
                      <CheckCircle className="h-4 w-4 text-status-active" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </span>
                </div>
                {/* Name column */}
                <div className="flex min-w-0 items-center gap-1 sm:flex-1">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground sm:flex-none">{record.name}</span>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(record.name); toast({ type: "success", title: "Copied!" }) }}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                {/* Value column */}
                <div className="flex min-w-0 items-center gap-1 sm:flex-[2]">
                  {isMx ? (
                    <>
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {mxPriority}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary sm:flex-none">{mxHost}</span>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary sm:flex-none">{record.value}</span>
                  )}
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(isMx ? mxHost : record.value); toast({ type: "success", title: "Copied!" }) }}
                    className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                {/* Status (desktop only — mobile shown above) */}
                <span className="hidden sm:inline">
                  {record.verified ? (
                    <CheckCircle className="h-4 w-4 shrink-0 text-status-active" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Email Addresses */}
      <motion.div
        variants={item}
        className="rounded-xl border border-border bg-card"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Email Addresses</h2>
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
        </div>

        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="border-b border-border px-5 py-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="flex-1">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Address
                </Label>
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
                {prefixError && (
                  <p className="mt-1 text-xs text-status-error">{prefixError}</p>
                )}
              </div>
              <div className="flex-1">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Display name
                </Label>
                <Input
                  className="mt-1.5"
                  placeholder="HookSense (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Forward to
                </Label>
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
                {forwardingError && (
                  <p className="mt-1 text-xs text-status-error">{forwardingError}</p>
                )}
              </div>
              <div className="flex gap-2 lg:pt-5">
                <Button size="sm" onClick={validateAndSaveAddress}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false)
                    setAddressPrefix("")
                    setDisplayName("")
                    setForwardingEmail("")
                    setPrefixError("")
                    setForwardingError("")
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
                  <button
                    onClick={() => setDeleteAddressId(addr.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-status-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Catch-all */}
      <motion.div
        variants={item}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h3 className="text-sm font-semibold">Catch-all Address</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Receive emails sent to any address at this domain.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full bg-secondary"
          >
            <span className="inline-block h-5 w-5 translate-x-0.5 translate-y-0.5 transform rounded-full bg-muted-foreground/30 shadow transition-transform" />
          </button>
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        variants={item}
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
