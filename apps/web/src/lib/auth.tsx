import { createContext, useContext, useEffect, useState, useCallback } from "react"
import type { User } from "./types"
import { api, setToken } from "./api"
import { useMockEnabled, useMockData } from "@/lib/mock-data"

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (data: Partial<Pick<User, "name" | "email">>) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  updateUser: async () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.get<User>("/auth/me")
      setUser(u)
    } catch {
      setUser(null)
      setToken(null)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("selfinbox-token")
    if (token) {
      refreshUser().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password })
    setToken(res.token)
    setUser(res.user)
  }

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", { name, email, password })
    setToken(res.token)
    setUser(res.user)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  const updateUser = async (data: Partial<Pick<User, "name" | "email">>) => {
    const updated = await api.put<User>("/auth/me", data)
    setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const real = useContext(AuthContext)
  const mockEnabled = useMockEnabled()
  const mock = useMockData()
  if (!mockEnabled) return real
  // In demo mode the user is signed in as the mock account; mutations are
  // no-ops since there's no real backend session to update.
  return {
    user: mock.user,
    loading: false,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    updateUser: async () => {},
    refreshUser: async () => {},
  }
}
