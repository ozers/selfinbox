import { cn } from "@/lib/utils"

interface SegmentedTab<T extends string> {
  value: T
  label: string
  count?: number
}

interface SegmentedTabsProps<T extends string> {
  tabs: SegmentedTab<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  // Per-button sizing/layout overrides, e.g. "px-4 py-2" or "flex-1".
  itemClassName?: string
}

// Pill-style tab group on a secondary background — the app's standard filter
// control (inbox direction/status, domain status, setup providers).
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  itemClassName = "px-3 py-1",
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn("flex w-fit gap-1 rounded-lg bg-secondary p-1", className)}>
      {tabs.map((tab) => {
        const isActive = value === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors",
              itemClassName,
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
