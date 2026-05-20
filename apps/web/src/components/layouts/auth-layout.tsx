import { Link, Outlet } from "react-router-dom"
import { Mail } from "lucide-react"

const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME as string) || "Selfinbox"

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link to="/" className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Mail className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">{BRAND_NAME}</span>
          </Link>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
