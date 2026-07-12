import { Link } from "react-router-dom"
import { Loader2 } from "lucide-react"

// Full-width centered spinner for a page's initial load.
export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

// "Domain not found." / "Email not found." with a link back to the list.
export function PageNotFound({
  message,
  backTo,
  backLabel,
}: {
  message: string
  backTo: string
  backLabel: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-lg text-muted-foreground">{message}</p>
      <Link to={backTo} className="mt-4 text-sm text-primary hover:underline">
        {backLabel}
      </Link>
    </div>
  )
}
