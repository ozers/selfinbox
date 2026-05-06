import { useEffect } from "react"
import { Loader } from "lucide-react"

export default function OAuthCloudflareDone() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get("success") === "true"
    const created = Number(params.get("created") ?? 0)
    const skipped = Number(params.get("skipped") ?? 0)
    const error = params.get("error")

    if (window.opener) {
      window.opener.postMessage(
        { type: "cloudflare_oauth", success, created, skipped, error },
        window.location.origin
      )
      window.close()
    }
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader className="h-4 w-4 animate-spin" />
        <span className="text-sm">Completing authorization...</span>
      </div>
    </div>
  )
}
