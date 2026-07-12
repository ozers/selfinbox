import { Label } from "./label"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  label?: React.ReactNode
  htmlFor?: string
  error?: string | null
  // Muted helper text shown when there is no error.
  hint?: React.ReactNode
  className?: string
  labelClassName?: string
  children: React.ReactNode
}

// Standard label + control + error/hint stack used across forms.
export function FormField({ label, htmlFor, error, hint, className, labelClassName, children }: FormFieldProps) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={htmlFor} className={cn("mb-1.5 block", labelClassName)}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-status-error">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
