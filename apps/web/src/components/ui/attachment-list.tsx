import { useState } from "react"
import { Paperclip, AlertTriangle, ShieldAlert, Download, FileText, Image as ImageIcon, FileArchive, File } from "lucide-react"
import { Dialog } from "./dialog"
import type { EmailAttachment } from "@/lib/types"

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function iconFor(contentType: string) {
  if (contentType.startsWith("image/")) return ImageIcon
  if (contentType.startsWith("text/") || contentType === "application/pdf") return FileText
  if (/(zip|tar|gzip|rar|7z)/.test(contentType)) return FileArchive
  return File
}

function isDeclaredMismatch(att: EmailAttachment): boolean {
  if (!att.declaredType || att.declaredType === "application/octet-stream") return false
  if (att.declaredType === att.contentType) return false
  const a = att.declaredType.split("/")[0]
  const b = att.contentType.split("/")[0]
  return a !== b
}

export function AttachmentList({
  attachments,
  emailId,
  buildDownloadUrl,
}: {
  attachments: EmailAttachment[]
  emailId: string
  buildDownloadUrl: (emailId: string, idx: number) => string
}) {
  const [confirm, setConfirm] = useState<EmailAttachment | null>(null)

  if (attachments.length === 0) return null

  const startDownload = (att: EmailAttachment) => {
    // For dangerous or quarantined items, route through a confirm dialog first.
    if (att.quarantined || isDeclaredMismatch(att)) {
      setConfirm(att)
      return
    }
    triggerDownload(att, emailId, buildDownloadUrl)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {attachments.map((att) => {
          const Icon = iconFor(att.contentType)
          const mismatch = isDeclaredMismatch(att)
          const danger = att.quarantined
          return (
            <button
              key={att.idx}
              onClick={() => startDownload(att)}
              className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                danger
                  ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
                  : mismatch
                    ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                    : "border-border bg-secondary/30 hover:bg-secondary/60"
              }`}
            >
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${
                danger ? "bg-red-500/15 text-red-400"
                  : mismatch ? "bg-amber-500/15 text-amber-400"
                    : "bg-primary/10 text-primary"
              }`}>
                {danger ? <ShieldAlert className="h-4 w-4" />
                  : mismatch ? <AlertTriangle className="h-4 w-4" />
                    : <Icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={att.filename}>
                  {att.filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(att.size)} · <span className="font-mono">{att.contentType}</span>
                </p>
                {danger && (
                  <p className="mt-0.5 text-[11px] font-medium text-red-400">
                    Blocked: {att.quarantineReason || "unsafe content"}
                  </p>
                )}
                {!danger && mismatch && (
                  <p className="mt-0.5 text-[11px] font-medium text-amber-400">
                    Declared as <span className="font-mono">{att.declaredType}</span> but appears to be <span className="font-mono">{att.contentType}</span>
                  </p>
                )}
              </div>
              <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )
        })}
      </div>

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.quarantined ? "Download blocked attachment?" : "Download this attachment?"}
        description={
          confirm?.quarantined
            ? `This file was flagged as unsafe: ${confirm.quarantineReason}. Files like this are a common way attackers deliver malware. Only download it if you fully trust the sender and you are sure what this file is.`
            : confirm
              ? `The sender claims this file is "${confirm.declaredType}" but it actually appears to be "${confirm.contentType}". This mismatch is sometimes used to disguise malicious files. Continue only if you trust the sender.`
              : ""
        }
        confirmLabel="Download anyway"
        confirmVariant="destructive"
        onConfirm={() => {
          if (confirm) triggerDownload(confirm, emailId, buildDownloadUrl)
          setConfirm(null)
        }}
      />
    </div>
  )
}

function triggerDownload(att: EmailAttachment, emailId: string, buildDownloadUrl: (emailId: string, idx: number) => string) {
  // We open a hidden anchor with download attribute so the browser respects
  // the server's Content-Disposition. We can't add an Authorization header to
  // a plain link, so the API endpoint also accepts token via fetch — use fetch
  // + blob URL to keep auth working.
  const url = buildDownloadUrl(emailId, att.idx)
  const token = localStorage.getItem("selfinbox-token")
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => {
      if (!r.ok) throw new Error("Download failed")
      return r.blob()
    })
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objUrl
      a.download = att.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000)
    })
    .catch((err) => {
      console.error("[attachment] download failed", err)
      alert("Download failed. Please try again.")
    })
}
