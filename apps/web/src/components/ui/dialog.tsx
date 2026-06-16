import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { Button } from "./button"

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  confirmLabel?: string
  confirmVariant?: "default" | "destructive" | "hero"
  onConfirm?: () => void
  loading?: boolean
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  confirmVariant = "default",
  onConfirm,
  loading,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape, and move focus into the panel when it opens so keyboard
  // users land inside the dialog instead of behind it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                  {description && (
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  )}
                </div>
                <button onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {children && <div className="mt-4">{children}</div>}
              {(confirmLabel || onConfirm) && (
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="ghost" onClick={onClose}>Cancel</Button>
                  <Button
                    variant={confirmVariant}
                    onClick={onConfirm}
                    disabled={loading}
                  >
                    {loading ? "Processing..." : confirmLabel || "Confirm"}
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
