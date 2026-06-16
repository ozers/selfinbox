// Build stub. In the `app` (install) build, vite.config.ts aliases
// `@/lib/mock-data` to this module so the demo fixture dataset never enters the
// install bundle. `app` mode never mounts the demo, so the mock context is
// always disabled — the hooks call useMockData() but discard its result behind
// an `if (mockEnabled)` guard, so these empty implementations are safe. The
// real fixtures ship only in `public` / `marketing` builds.

export function MockDataProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const useMockEnabled = () => false

export function useMockData() {
  return {
    user: null,
    domains: [],
    domain: (_id?: string) => undefined,
    emails: (_params?: unknown) => [],
    email: (_id?: string) => undefined,
    usage: { emailsSent: 0, emailsReceived: 0, domains: 0, addresses: 0 },
  }
}
