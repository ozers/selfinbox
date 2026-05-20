import { createContext, useContext, useMemo } from "react"
import type { Domain, Email, Usage, User } from "./types"

// Frontend-only mock data for the public /demo route. Lets visitors see the
// dashboard / inbox shell without needing to sign up or run the API. The
// existing hooks (useAuth, useDomains, useEmails, useUsage) check this
// context first and return mocks when enabled, otherwise hit the API.

const MockContext = createContext<{ enabled: boolean }>({ enabled: false })

export function MockDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <MockContext.Provider value={{ enabled: true }}>
      {children}
    </MockContext.Provider>
  )
}

export const useMockEnabled = () => useContext(MockContext).enabled

// ── Static demo dataset (matches seed-demo.mjs so /demo mirrors the real app) ──

const DOMAIN = "ozersubasi.com"
const USER_ID = "demo-user"
const DOMAIN_ID = "demo-domain"

const NOW = Date.now()
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

const ADDRESSES = [
  { id: "a-hi",      local: "hi",      displayName: "Ozer Subasi" },
  { id: "a-hello",   local: "hello",   displayName: "Hello" },
  { id: "a-support", local: "support", displayName: "Support" },
  { id: "a-press",   local: "press",   displayName: "Press" },
  { id: "a-noreply", local: "noreply", displayName: null },
]

const MOCK_USER: User = {
  id: USER_ID,
  name: "Ozer Subasi",
  email: "hi@ozersubasi.com",
  suspendedAt: null,
  emailVerifiedAt: hoursAgo(24 * 21),
  createdAt: hoursAgo(24 * 21),
}

const MOCK_DOMAIN: Domain = {
  id: DOMAIN_ID,
  domain: DOMAIN,
  status: "active",
  createdAt: hoursAgo(24 * 21),
  addresses: ADDRESSES.map((a) => ({
    id: a.id,
    address: `${a.local}@${DOMAIN}`,
    displayName: a.displayName,
    forwardingTo: null,
    forwardingVerifiedAt: null,
    isCatchall: false,
    isActive: true,
  })),
  dnsRecords: [
    { id: "d1", type: "MX",    name: DOMAIN,                  value: "10 inbound-smtp.eu-west-1.amazonaws.com",         verified: true },
    { id: "d2", type: "TXT",   name: DOMAIN,                  value: "v=spf1 include:amazonses.com ~all",                verified: true },
    { id: "d3", type: "CNAME", name: `dkim1._domainkey.${DOMAIN}`, value: "dkim1.dkim.amazonses.com",                verified: true },
    { id: "d4", type: "CNAME", name: `dkim2._domainkey.${DOMAIN}`, value: "dkim2.dkim.amazonses.com",                verified: true },
    { id: "d5", type: "CNAME", name: `dkim3._domainkey.${DOMAIN}`, value: "dkim3.dkim.amazonses.com",                verified: true },
    { id: "d6", type: "TXT",   name: `_dmarc.${DOMAIN}`,      value: "v=DMARC1; p=none; rua=mailto:dmarc@" + DOMAIN,     verified: true },
  ],
}

const MOCK_DOMAINS: Domain[] = [MOCK_DOMAIN]

// Inbound + outbound mix, spread across the last two weeks.
const INBOUND: Array<{ from: string; subject: string; to: string; ageHours: number; isRead: boolean }> = [
  { from: "Sarah Chen <sarah@northwind.co>",     subject: "Hey Ozer — quick question about Selfinbox",     to: "hi",      ageHours: 2,   isRead: false },
  { from: "billing@stripe.com",                   subject: "Your receipt from Stripe — $19.00",             to: "hi",      ageHours: 6,   isRead: true  },
  { from: "Alex Park <alex@partner.dev>",         subject: "Re: integration timeline",                       to: "hi",      ageHours: 8,   isRead: false },
  { from: "notifications@github.com",             subject: "[ozers/selfinbox] PR #42 ready for review",     to: "hi",      ageHours: 10,  isRead: true  },
  { from: "Maya R. <maya.r@studio.design>",       subject: "Brand assets for ozersubasi.com — final round", to: "hello",   ageHours: 24,  isRead: true  },
  { from: "no-reply@calendar.app",                subject: "Reminder: Sync with Ozer at 3pm",               to: "hi",      ageHours: 28,  isRead: true  },
  { from: "Daniel L. <dlam@northcrest.dev>",      subject: "Following up on our chat last week",            to: "hi",      ageHours: 36,  isRead: false },
  { from: "team@figma.com",                       subject: "Maya commented on your file",                    to: "hello",   ageHours: 48,  isRead: true  },
  { from: "security@cloudguard.io",               subject: "New sign-in to your account",                    to: "hi",      ageHours: 60,  isRead: true  },
  { from: "Newsletter <hello@indiehacker.news>",  subject: "Issue #128 — building in public",                to: "hi",      ageHours: 96,  isRead: true  },
  { from: "Recruiter <talent@nimbushq.com>",      subject: "Hi Ozer, opportunity at Nimbus",                 to: "hi",      ageHours: 120, isRead: false },
  { from: "Customer <questions@acmehq.com>",      subject: "Cannot reset my password — help?",               to: "support", ageHours: 168, isRead: true  },
]

const OUTBOUND: Array<{ fromLocal: string; to: string; subject: string; ageHours: number }> = [
  { fromLocal: "hi",      to: "sarah@northwind.co",   subject: "Re: Hey Ozer — quick question about Selfinbox", ageHours: 1   },
  { fromLocal: "hi",      to: "alex@partner.dev",     subject: "Integration timeline + scope",                   ageHours: 24  },
  { fromLocal: "support", to: "questions@acmehq.com", subject: "Re: Cannot reset my password — help?",           ageHours: 48  },
  { fromLocal: "hi",      to: "dlam@northcrest.dev",  subject: "Re: Following up on our chat last week",         ageHours: 72  },
  { fromLocal: "press",   to: "editor@launchweek.io", subject: "Selfinbox launch — press kit attached",          ageHours: 100 },
]

function bodyFor(subject: string) {
  return `Hi,\n\nQuick note about "${subject}".\n\nLet me know if you have any questions.\n\nThanks,\nOzer`
}

const MOCK_EMAILS: Email[] = [
  ...INBOUND.map((e, i): Email => ({
    id: `in-${i}`,
    direction: "inbound",
    from: e.from,
    to: [`${e.to}@${DOMAIN}`],
    cc: [],
    subject: e.subject,
    bodyText: bodyFor(e.subject),
    bodyHtml: "",
    isRead: e.isRead,
    createdAt: hoursAgo(e.ageHours),
    address: `${e.to}@${DOMAIN}`,
    attachments: [],
    hasQuarantined: false,
  })),
  ...OUTBOUND.map((e, i): Email => ({
    id: `out-${i}`,
    direction: "outbound",
    from: `${e.fromLocal}@${DOMAIN}`,
    to: [e.to],
    cc: [],
    subject: e.subject,
    bodyText: bodyFor(e.subject),
    bodyHtml: "",
    isRead: true,
    createdAt: hoursAgo(e.ageHours),
    address: `${e.fromLocal}@${DOMAIN}`,
    attachments: [],
    hasQuarantined: false,
  })),
].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

const MOCK_USAGE: Usage = {
  emailsSent: OUTBOUND.length,
  emailsReceived: INBOUND.length,
  domains: 1,
  addresses: ADDRESSES.length,
}

// Mirrors the filtering useEmails does server-side, applied locally on the
// static dataset so /demo/inbox respects the user's filter clicks.
export function filterMockEmails(params?: {
  domain?: string; address?: string; status?: string; direction?: string; search?: string
}): Email[] {
  let out = MOCK_EMAILS
  if (params?.domain && params.domain !== "all") {
    out = out.filter((e) => e.address.endsWith(`@${params.domain}`))
  }
  if (params?.address) {
    out = out.filter((e) => e.address === params.address)
  }
  if (params?.status === "unread") out = out.filter((e) => !e.isRead)
  if (params?.status === "read")   out = out.filter((e) =>  e.isRead)
  if (params?.direction && params.direction !== "all") {
    out = out.filter((e) => e.direction === params.direction)
  }
  if (params?.search) {
    const q = params.search.toLowerCase()
    out = out.filter((e) =>
      e.subject.toLowerCase().includes(q) ||
      e.from.toLowerCase().includes(q) ||
      e.to.some((t) => t.toLowerCase().includes(q))
    )
  }
  return out
}

export function useMockData() {
  return useMemo(() => ({
    user: MOCK_USER,
    domains: MOCK_DOMAINS,
    domain: (id?: string) => id === DOMAIN_ID ? MOCK_DOMAIN : undefined,
    emails: filterMockEmails,
    email: (id?: string) => MOCK_EMAILS.find((e) => e.id === id),
    usage: MOCK_USAGE,
  }), [])
}
