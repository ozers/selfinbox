import { useEffect, lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthLayout } from "@/components/layouts/auth-layout"
import { DashboardLayout } from "@/components/layouts/dashboard-layout"
import { MockDataProvider } from "@/lib/mock-data"
import { useAuth } from "@/lib/auth"
import Login from "@/pages/login"
import Register from "@/pages/register"
import VerifyEmail from "@/pages/verify-email"
import ForgotPassword from "@/pages/forgot-password"
import ResetPassword from "@/pages/reset-password"
import Setup from "@/pages/setup"
import Dashboard from "@/pages/dashboard"
import Domains from "@/pages/domains"
import DomainDetail from "@/pages/domain-detail"
import DomainSmtp from "@/pages/domain-smtp"
import Inbox from "@/pages/inbox"
import EmailDetail from "@/pages/email-detail"
import Settings from "@/pages/settings"
import OAuthCloudflareDone from "@/pages/oauth-cloudflare-done"

// Build mode. Set at build time via VITE_MODE. Three values, each a distinct
// deployable. The flags below derive from MODE; because MODE is a build-time
// constant, Vite constant-folds these conditionals and tree-shakes the unused
// route groups out of each build.
//
//   app       — the install / self-host build. ONLY the real inbox: login +
//               dashboard. No public landing, NO demo. `/` → `/login`.
//   public    — landing at `/` + the real inbox + the demo. The landing has
//               no Sign In link; the owner bookmarks `/login`. This is
//               selfinbox.ozersubasi.com's model.
//   marketing — landing + demo only. No login, no API, fully static. Every
//               other path redirects to the GitHub repo.
const MODE = (import.meta.env.VITE_MODE as string) || "app"
const REPO_URL = "https://github.com/ozers/selfinbox"

// The real authenticated app (login + dashboard). Present in `app` + `public`.
const HAS_APP = MODE === "app" || MODE === "public"
// The mock-data demo. Travels WITH the landing, never with the install build.
const HAS_DEMO = MODE === "public" || MODE === "marketing"

// Landing is marketing-only and lazy-loaded. In the `app` (install) build the
// landing module is aliased to an empty stub at build time (see vite.config.ts),
// so none of the marketing code ships — and the routes that render it below are
// gated out anyway.
const Landing = lazy(() => import("@/pages/landing"))

function RepoRedirect() {
  useEffect(() => {
    window.location.replace(REPO_URL)
  }, [])
  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

// `app` mode root: no landing exists, so anonymous visitors go straight to
// login. Crucially this never references <Landing>, so the install build
// carries no landing code.
function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? "/dashboard" : "/login"} replace />
}

// `public` mode root: logged-in owner lands on the dashboard, everyone else
// sees the marketing landing.
function RootLanding() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <Landing />
}

// The real app's routes — auth pages, setup wizard, dashboard. Returned as a
// fragment so it can be conditionally spliced into <Routes>.
function appRoutes() {
  return (
    <>
      {/* Auth pages (guest only) */}
      <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      {/* Setup wizard (protected) */}
      <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />

      {/* Dashboard (protected) */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/domains" element={<Domains />} />
        <Route path="/domains/:id" element={<DomainDetail />} />
        <Route path="/domains/:id/smtp" element={<DomainSmtp />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/inbox/:emailId" element={<EmailDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* OAuth callbacks */}
      <Route path="/oauth/cloudflare/done" element={<OAuthCloudflareDone />} />
    </>
  )
}

// The demo's routes — same pages as the real app, but wrapped in
// MockDataProvider so the hooks read fixture data and never touch the API.
function demoRoutes() {
  return (
    <Route element={<MockDataProvider><DashboardLayout /></MockDataProvider>}>
      <Route path="/demo" element={<Dashboard />} />
      <Route path="/demo/inbox" element={<Inbox />} />
      <Route path="/demo/inbox/:emailId" element={<EmailDetail />} />
      <Route path="/demo/domains" element={<Domains />} />
      <Route path="/demo/domains/:id" element={<DomainDetail />} />
    </Route>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* Root — branches per build */}
          {MODE === "marketing" && <Route path="/" element={<Landing />} />}
          {MODE === "public" && <Route path="/" element={<RootLanding />} />}
          {MODE === "app" && <Route path="/" element={<RootRedirect />} />}

          {/* Real authenticated app */}
          {HAS_APP && appRoutes()}

          {/* Public mock-data demo */}
          {HAS_DEMO && demoRoutes()}

          {/* Catch-all: marketing bounces strays to GitHub; app/public send
              them home (which then resolves per auth state). */}
          {MODE === "marketing"
            ? <Route path="*" element={<RepoRedirect />} />
            : <Route path="*" element={<Navigate to="/" replace />} />}
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
