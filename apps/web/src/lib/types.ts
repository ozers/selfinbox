export interface User {
  id: string
  name: string
  email: string
  suspendedAt: string | null
  emailVerifiedAt: string | null
  createdAt: string
}

export interface Domain {
  id: string
  domain: string
  status: "active" | "pending" | "error"
  createdAt: string
  addresses: EmailAddress[]
  dnsRecords: DnsRecord[]
}

export interface DnsRecord {
  id: string
  type: string
  name: string
  value: string
  verified: boolean
}

export interface EmailAddress {
  id: string
  address: string
  displayName: string | null
  forwardingTo: string | null
  isCatchall: boolean
  isActive: boolean
}

export interface EmailAttachment {
  idx: number
  filename: string
  contentType: string
  declaredType: string
  size: number
  contentId: string | null
  isInline: boolean
  quarantined: boolean
  quarantineReason: string | null
}

export interface Email {
  id: string
  direction: "inbound" | "outbound"
  from: string
  to: string[]
  cc: string[]
  subject: string
  bodyText: string
  bodyHtml: string
  isRead: boolean
  createdAt: string
  address: string
  attachments: EmailAttachment[]
  hasQuarantined: boolean
}

export interface SmtpCredentials {
  host: string
  port: number
  username: string
  password: string
  encryption: string
}

export interface Usage {
  emailsSent: number
  emailsReceived: number
  domains: number
  addresses: number
}
