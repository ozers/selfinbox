import { useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Mail, LayoutDashboard, Globe, Inbox, Settings, LogOut, Menu, X, Sun, Moon } from "lucide-react"

const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME as string) || "Selfinbox"
import { useTheme } from "@/lib/theme"
import { useAuth } from "@/lib/auth"
import { useUsage, useDomains } from "@/lib/hooks"

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()
  const { usage } = useUsage()
  const { domains } = useDomains()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-60 flex-col border-r border-border bg-card transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Mail className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">{BRAND_NAME}</span>
          </Link>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {[
            { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
            { to: "/domains", icon: Globe, label: "Domains" },
          ].map((item) => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/")
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}

          {/* Inbox with sub-navigation */}
          <div>
            <div className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              location.pathname.startsWith("/inbox") ? "text-primary" : "text-muted-foreground"
            }`}>
              <Inbox className="h-4 w-4" />
              Inbox
            </div>
            <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
              {/* All Mail */}
              {(() => {
                const isActive = location.pathname === "/inbox" && !new URLSearchParams(location.search).get("domain")
                return (
                  <NavLink
                    to="/inbox"
                    onClick={() => setSidebarOpen(false)}
                    className={`rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    All Mail
                  </NavLink>
                )
              })()}

              {domains.length > 0 && (
                <>
                  <p className="mt-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    Domains
                  </p>
                  {domains.map((d) => {
                    const params = new URLSearchParams(location.search)
                    const activeDomain = params.get("domain")
                    const activeAddress = params.get("address")
                    const isDomainActive = location.pathname === "/inbox" && activeDomain === d.domain && !activeAddress
                    return (
                      <div key={d.id}>
                        <NavLink
                          to={`/inbox?domain=${d.domain}`}
                          onClick={() => setSidebarOpen(false)}
                          className={`truncate rounded-md px-2 py-1.5 font-mono text-xs transition-colors block ${
                            isDomainActive
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          {d.domain}
                        </NavLink>
                        {d.addresses.filter((a) => a.isActive && !a.isCatchall).map((a) => {
                          const isAddrActive = location.pathname === "/inbox" && activeAddress === a.address
                          const prefix = a.address.split("@")[0]
                          return (
                            <NavLink
                              key={a.id}
                              to={`/inbox?address=${a.address}`}
                              onClick={() => setSidebarOpen(false)}
                              className={`ml-3 truncate rounded-md px-2 py-1 font-mono text-xs transition-colors block ${
                                isAddrActive
                                  ? "bg-primary/10 font-medium text-primary"
                                  : "text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                              }`}
                            >
                              {prefix}
                            </NavLink>
                          )
                        })}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {[
            { to: "/settings", icon: Settings, label: "Settings" },
          ].map((item) => {
            const isActive = location.pathname === item.to
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          {usage.emailsSent + usage.emailsReceived > 0 && (
            <div className="mb-3 rounded-lg bg-secondary px-3 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>This month</span>
                <span className="font-mono">{usage.emailsSent}↑ {usage.emailsReceived}↓</span>
              </div>
            </div>
          )}

          <button
            onClick={toggle}
            className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          {user && (
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                {user.name.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
              </div>
              <button onClick={handleLogout}>
                <LogOut className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-60">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Mail className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">{BRAND_NAME}</span>
          </Link>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto min-w-0 max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
