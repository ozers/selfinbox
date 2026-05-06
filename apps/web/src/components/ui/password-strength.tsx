import { cn } from "@/lib/utils"

function getStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-status-error" }
  if (score <= 2) return { score: 2, label: "Fair", color: "bg-status-pending" }
  if (score <= 3) return { score: 3, label: "Good", color: "bg-primary" }
  return { score: 4, label: "Strong", color: "bg-status-active" }
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const { score, label, color } = getStrength(password)

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i <= score ? color : "bg-muted")}
          />
        ))}
      </div>
      <p className={cn("text-xs", score <= 1 ? "text-status-error" : score <= 2 ? "text-status-pending" : "text-muted-foreground")}>
        {label}
      </p>
    </div>
  )
}
