import { cn } from "@/lib/utils"

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  "aria-label"?: string
}

export function Switch({ checked, onChange, className, ...rest }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-primary" : "bg-secondary",
        className
      )}
      {...rest}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 translate-y-0.5 transform rounded-full shadow transition-all",
          checked ? "translate-x-[22px] bg-white" : "translate-x-0.5 bg-muted-foreground/30"
        )}
      />
    </button>
  )
}
