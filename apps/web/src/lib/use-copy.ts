import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "@/components/ui/toast"

// Copy-to-clipboard with a success toast and an optional per-field "copied"
// flag (for buttons that swap their icon to a checkmark for a moment).
export function useCopy(resetMs = 2000) {
  const { toast } = useToast()
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = useCallback(
    (value: string, opts?: { label?: string; field?: string }) => {
      navigator.clipboard.writeText(value)
      toast({
        type: "success",
        title: "Copied!",
        description: opts?.label ? `${opts.label} copied to clipboard` : undefined,
      })
      if (opts?.field) {
        setCopiedField(opts.field)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopiedField(null), resetMs)
      }
    },
    [toast, resetMs]
  )

  return { copy, copiedField }
}
