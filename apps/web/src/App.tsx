import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthLayout } from "@/components/layouts/auth-layout"
import { DashboardLayout } from "@/components/layouts/dashboard-layout"
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

// Build mode: `app` (default — full self-host build with login + dashboard) or
// `marketing` (landing only, all other paths redirect to the GitHub repo).
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

function MarketingRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<RepoRedirect />} />
    </Routes>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* Root → login (or dashboard if already authenticated) */}
      <Route path="/" element={<Navigate to="/login" replace />} />

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

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {MODE === "marketing" ? <MarketingRoutes /> : <AppRoutes />}
    </BrowserRouter>
  )
}
