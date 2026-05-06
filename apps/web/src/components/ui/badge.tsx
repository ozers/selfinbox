import { cn } from "@/lib/utils"

type Variant = "default" | "success" | "warning" | "destructive" | "outline"

const variantClasses: Record<Variant, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-status-active/10 text-status-active",
  warning: "bg-status-pending/10 text-status-pending",
  destructive: "bg-status-error/10 text-status-error",
  outline: "border border-border text-muted-foreground",
}

interface BadgeProps {
  variant?: Variant
  className?: string
  children: React.ReactNode
}

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
