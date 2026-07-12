import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Extracts a human-readable message from an unknown catch value —
// API errors arrive as Error instances with a server-provided message.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

// Single source of truth for client-side email format checks.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value)
}

// `compact` drops the " ago" suffix for tight layouts (dashboard activity feed).
export function formatRelativeTime(date: Date, opts?: { compact?: boolean }): string {
  const suffix = opts?.compact ? "" : " ago"
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m${suffix}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${suffix}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d${suffix}`
  return opts?.compact
    ? date.toLocaleDateString()
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
