import { useState, useEffect, useCallback } from "react"
import { api } from "./api"
import { useMockEnabled, useMockData } from "./mock-data"
import type { Domain, Email, Usage, SmtpCredentials } from "./types"

// ── Generic fetch hook ─────────────────────────────────────────────

function useFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(path ? true : false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback((isRefetch = false) => {
    if (!path) return
    if (!isRefetch) setLoading(true)
    setError(null)
    api
      .get<T>(path)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => {
    fetch(false)
  }, [fetch])

  const refetch = useCallback(() => fetch(true), [fetch])

  return { data, loading, error, refetch }
}

// ── Domains ────────────────────────────────────────────────────────

export function useDomains() {
  const mockEnabled = useMockEnabled()
  const mock = useMockData()
  const { data, loading, error, refetch } = useFetch<Domain[]>(mockEnabled ? "" : "/domains")
  if (mockEnabled) {
    return { domains: mock.domains, loading: false, error: null, refetch: () => {} }
  }
  return { domains: data ?? [], loading, error, refetch }
}

export function useDomain(id: string | undefined) {
  const mockEnabled = useMockEnabled()
  const mock = useMockData()
  const { data, loading, error, refetch } = useFetch<Domain>(!mockEnabled && id ? `/domains/${id}` : "")
  if (mockEnabled) {
    return { domain: mock.domain(id), loading: false, error: null, refetch: () => {} }
  }
  return { domain: data, loading: id ? loading : false, error, refetch }
}

export function useDomainActions() {
  const createDomain = async (domain: string) => {
    return api.post<Domain>("/domains", { domain })
  }

  const deleteDomain = async (id: string) => {
    return api.delete(`/domains/${id}`)
  }

  const verifyDomain = async (id: string) => {
    return api.post<Domain>(`/domains/${id}/verify`)
  }

  const createAddress = async (domainId: string, prefix: string, forwardingTo?: string, displayName?: string) => {
    return api.post(`/domains/${domainId}/addresses`, { prefix, forwardingTo, displayName })
  }

  const createCatchall = async (domainId: string, forwardingTo?: string) => {
    return api.post(`/domains/${domainId}/addresses`, { isCatchall: true, forwardingTo })
  }

  const deleteAddress = async (domainId: string, addressId: string) => {
    return api.delete(`/domains/${domainId}/addresses/${addressId}`)
  }

  return { createDomain, deleteDomain, verifyDomain, createAddress, createCatchall, deleteAddress }
}

// ── Emails ─────────────────────────────────────────────────────────

export function useEmails(params?: { domain?: string; address?: string; status?: string; direction?: string; search?: string }) {
  const mockEnabled = useMockEnabled()
  const mock = useMockData()
  const query = new URLSearchParams()
  if (params?.domain && params.domain !== "all") query.set("domain", params.domain)
  if (params?.address) query.set("address", params.address)
  if (params?.status && params.status !== "all") query.set("status", params.status)
  if (params?.direction && params.direction !== "all") query.set("direction", params.direction)
  if (params?.search) query.set("search", params.search)
  const qs = query.toString()
  const path = mockEnabled ? "" : `/emails${qs ? `?${qs}` : ""}`

  const { data, loading, error, refetch } = useFetch<Email[]>(path)
  if (mockEnabled) {
    return { emails: mock.emails(params), loading: false, error: null, refetch: () => {} }
  }
  return { emails: data ?? [], loading, error, refetch }
}

export function useEmail(id: string | undefined) {
  const mockEnabled = useMockEnabled()
  const mock = useMockData()
  const { data, loading, error, refetch } = useFetch<Email>(!mockEnabled && id ? `/emails/${id}` : "")
  if (mockEnabled) {
    return { email: mock.email(id), loading: false, error: null, refetch: () => {} }
  }
  return { email: data, loading: id ? loading : false, error, refetch }
}

export function useEmailActions() {
  const deleteEmail = async (id: string) => {
    return api.delete(`/emails/${id}`)
  }

  return { deleteEmail }
}

// ── Usage ──────────────────────────────────────────────────────────

export function useUsage() {
  const mockEnabled = useMockEnabled()
  const mock = useMockData()
  const { data, loading, error, refetch } = useFetch<Usage>(mockEnabled ? "" : "/usage")
  if (mockEnabled) {
    return { usage: mock.usage, loading: false, error: null, refetch: () => {} }
  }
  return {
    usage: data ?? { emailsSent: 0, emailsReceived: 0, domains: 0, addresses: 0 },
    loading,
    error,
    refetch,
  }
}

// ── SMTP Credentials ──────────────────────────────────────────────

export function useSmtpCredentials(domainId: string | undefined) {
  const { data, loading, error, refetch } = useFetch<SmtpCredentials>(
    domainId ? `/domains/${domainId}/smtp` : ""
  )
  return { credentials: data, loading: domainId ? loading : false, error, refetch }
}

export function useSmtpActions() {
  const regenerate = async (domainId: string) => {
    return api.post<SmtpCredentials>(`/domains/${domainId}/smtp/regenerate`)
  }

  return { regenerate }
}

// ── Password ───────────────────────────────────────────────────────

export function usePasswordActions() {
  const updatePassword = async (currentPassword: string, newPassword: string) => {
    return api.put("/auth/password", { currentPassword, newPassword })
  }

  return { updatePassword }
}

// ── Account ────────────────────────────────────────────────────────

export function useAccountActions() {
  const deleteAccount = async () => {
    return api.delete("/auth/me")
  }

  return { deleteAccount }
}
