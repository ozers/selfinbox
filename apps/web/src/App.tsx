import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthLayout } from "@/components/layouts/auth-layout"
import { DashboardLayout } from "@/components/layouts/dashboard-layout"
import { MockDataProvider } from "@/lib/mock-data"
import { useAuth } from "@/lib/auth"
import Landing from "@/pages/landing"
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

// Build mode. Set at build time via VITE_MODE. Three values:
//   app       — full self-host build. `/` redirects to `/login`. No public
//               landing. Default. (Strict private deploy.)
//   public    — full self-host build with a public landing at `/`. The
//               landing has no Sign In link, so visitors can't reach the
//               app — but the owner can bookmark `/login` and use the
//               dashboard normally. (selfinbox.ozersubasi.com's model.)
//   marketing — landing only. No login, no API. Every non-landing path
//               redirects to the GitHub repo. Pure static, deploys to
//               Cloudflare Pages / Netlify / etc. with no backend.
const MODE = (import.meta.env.VITE_MODE as string) || "app"
const REPO_URL = "https://github.com/ozers/selfinbox"

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

// Root route — branches based on auth + whether this build shows a public
// landing. Logged-in users always land on `/dashboard`; anonymous users
// see the landing in `public` mode or get bounced to `/login` otherwise.
function RootRoute({ showLanding }: { showLanding: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return showLanding ? <Landing /> : <Navigate to="/login" replace />
}

function MarketingRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* Demo runs entirely on mock data — no API required, safe in marketing mode */}
      <Route element={<MockDataProvider><DashboardLayout /></MockDataProvider>}>
        <Route path="/demo" element={<Dashboard />} />
        <Route path="/demo/inbox" element={<Inbox />} />
        <Route path="/demo/inbox/:emailId" element={<EmailDetail />} />
        <Route path="/demo/domains" element={<Domains />} />
        <Route path="/demo/domains/:id" element={<DomainDetail />} />
      </Route>
      <Route path="*" element={<RepoRedirect />} />
    </Routes>
  )
}

function AppRoutes({ landingAtRoot }: { landingAtRoot: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<RootRoute showLanding={landingAtRoot} />} />

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

      {/* Public demo — no auth, hooks read mock data from context */}
      <Route element={<MockDataProvider><DashboardLayout /></MockDataProvider>}>
        <Route path="/demo" element={<Dashboard />} />
        <Route path="/demo/inbox" element={<Inbox />} />
        <Route path="/demo/inbox/:emailId" element={<EmailDetail />} />
        <Route path="/demo/domains" element={<Domains />} />
        <Route path="/demo/domains/:id" element={<DomainDetail />} />
      </Route>

      {/* OAuth callbacks */}
      <Route path="/oauth/cloudflare/done" element={<OAuthCloudflareDone />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {MODE === "marketing" ? (
        <MarketingRoutes />
      ) : (
        <AppRoutes landingAtRoot={MODE === "public"} />
      )}
    </BrowserRouter>
  )
}
