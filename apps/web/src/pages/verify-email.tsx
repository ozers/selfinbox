import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const { user, refreshUser } = useAuth()

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  )
  const [resendLoading, setResendLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!token) return

    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setStatus("success")
        refreshUser()
      })
      .catch(() => setStatus("error"))
  }, [token, refreshUser])

  async function handleResend() {
    setResendLoading(true)
    try {
      await api.post("/auth/resend-verification")
      toast({ type: "success", title: "Verification email sent!" })
    } catch (err: any) {
      toast({ type: "error", title: err.message || "Failed to send verification email" })
    } finally {
      setResendLoading(false)
    }
  }

  if (status === "loading") {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <p className="text-sm text-muted-foreground">Verifying your email...</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      {status === "success" ? (
        <>
          <CheckCircle className="mx-auto h-12 w-12 text-status-active" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">Email verified!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your email has been verified. You can now set up your first domain.
            </p>
          </div>
          <Button variant="hero" className="w-full" asChild>
            <Link to="/setup">Continue to Setup</Link>
          </Button>
        </>
      ) : (
        <>
          <XCircle className="mx-auto h-12 w-12 text-status-error" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">Verification failed</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {token ? "This link is invalid or expired." : "No verification token provided."}
            </p>
          </div>
          {user && !user.emailVerifiedAt && (
            <Button
              variant="hero"
              className="w-full"
              disabled={resendLoading}
              onClick={handleResend}
            >
              {resendLoading ? "Sending..." : "Resend verification email"}
            </Button>
          )}
          {!user && (
            <Link to="/login" className="block text-sm text-primary hover:underline">
              Back to login
            </Link>
          )}
        </>
      )}
    </div>
  )
}
