// Build stub. In the `app` (install) build, vite.config.ts aliases
// `@/pages/landing` to this empty module so zero marketing code enters the
// bundle. The real landing only ships in `public` / `marketing` builds, where
// this stub is not used. Never rendered in `app` mode — its routes are gated.
export default function LandingStub() {
  return null
}
