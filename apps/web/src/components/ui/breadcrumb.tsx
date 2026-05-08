import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

interface BreadcrumbItem {
  label: string
  to?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            {item.to ? (
              <Link to={item.to} className="truncate text-muted-foreground transition-colors hover:text-foreground" title={item.label}>
                {item.label}
              </Link>
            ) : (
              <span className={`font-medium text-foreground ${isLast ? "truncate" : ""}`} title={item.label}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
