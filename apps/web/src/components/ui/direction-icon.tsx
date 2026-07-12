import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Round inbound/outbound indicator used in the inbox list, dashboard
// activity feed, and email detail. Green arrow-in, primary arrow-out.
export function DirectionIcon({
  direction,
  size = "md",
  className,
}: {
  direction: "inbound" | "outbound"
  size?: "sm" | "md"
  className?: string
}) {
  const isInbound = direction === "inbound"
  const Icon = isInbound ? ArrowDownLeft : ArrowUpRight
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "h-5 w-5" : "h-7 w-7",
        isInbound ? "bg-status-active/10" : "bg-primary/10",
        className
      )}
    >
      <Icon
        className={cn(
          size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
          isInbound ? "text-status-active" : "text-primary"
        )}
      />
    </span>
  )
}
