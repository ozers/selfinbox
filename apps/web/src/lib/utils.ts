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

// The address to reply or forward from. Mail caught by a catch-all is stored
// under `*@domain`, which can't send, so answer from the mailbox it was sent to.
export function replySender(email: { address: string; to: string[]; cc: string[] }): string {
  if (!email.address.startsWith("*@")) return email.address
  const suffix = email.address.slice(1).toLowerCase()
  const match = [...email.to, ...email.cc].find((a) => a.toLowerCase().endsWith(suffix))
  if (!match) throw new Error("Couldn't tell which address this email was sent to")
  return match
}

// Single source of truth for client-side email format checks.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value)
}

// Domain part of an address, for grouping and colouring. Falls back to the
// whole string so a malformed address still hashes to a stable bucket.
export function domainOf(address: string): string {
  return address.split("@")[1] ?? address
}

const SERIES_COUNT = 8

// Maps each domain to one of --series-1..8 (defined in index.css) by creation
// order, not by hashing the name: with a handful of domains a hash collides far
// more often than it feels like it should — six names into eight buckets share
// a colour ~92% of the time. Creation order is immutable, so a domain keeps its
// colour for good and a newly added one takes the next slot. Past eight domains
// colours repeat, which is the point at which the address text carries it.
export function domainColorMap(domains: Array<{ domain: string; createdAt: string }>): Map<string, string> {
  return new Map(
    [...domains]
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
      .map((d, i) => [d.domain, `var(--series-${(i % SERIES_COUNT) + 1})`])
  )
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
