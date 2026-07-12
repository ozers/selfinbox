import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth"
import { ArrowRight } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const { login } = useAuth()
  const navigate = useNavigate()

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!email.trim()) {
      newErrors.email = "Email is required"
    } else if (!email.includes("@")) {
      newErrors.email = "Please enter a valid email address"
    }
    if (!password) {
      newErrors.password = "Password is required"
    }
    return newErrors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors = validate()
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setLoading(true)
    try {
      await login(email, password)
      toast({ type: "success", title: "Welcome back!" })
      navigate("/dashboard")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed"
      setErrors({ email: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to manage your email infrastructure
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="bg-card"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-status-error">{errors.email}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            placeholder="Enter your password"
            className="bg-card"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-status-error">{errors.password}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="hero"
          className="w-full"
          disabled={loading}
        >
          {loading ? "Processing..." : "Sign in"}
          {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
