export function serializeUser(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at || null,
    suspendedAt: row.suspended_at || null,
    createdAt: row.created_at,
  }
}

function serializeDnsRecord(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    value: row.value,
    verified: !!row.verified,
  }
}

export function serializeAddress(row: any) {
  return {
    id: row.id,
    address: row.address,
    displayName: row.display_name || null,
    forwardingTo: row.forwarding_to || null,
    forwardingVerifiedAt: row.forwarding_verified_at || null,
    isCatchall: !!row.is_catchall,
    isActive: !!row.is_active,
  }
}

export function serializeDomain(row: any) {
  return {
    id: row.id,
    domain: row.domain,
    status: row.status,
    createdAt: row.created_at,
    addresses: (row.addresses || []).map(serializeAddress),
    dnsRecords: (row.dns_records || []).map(serializeDnsRecord),
  }
}

function serializeAttachment(att: any) {
  // Only public, safe fields. We deliberately do NOT expose s3Key or sha256
  // to the client — the API is the only path to the bytes.
  return {
    idx: att.idx,
    filename: att.filename,
    contentType: att.contentType,
    declaredType: att.declaredType,
    size: att.size,
    contentId: att.contentId ?? null,
    isInline: !!att.isInline,
    quarantined: !!att.quarantined,
    quarantineReason: att.quarantineReason ?? null,
  }
}

export function serializeEmail(row: any) {
  // attachments_meta may come back as a parsed array (postgres.js JSONB) or a
  // string depending on the driver path. Handle both.
  const rawAtts = row.attachments_meta
  const atts = Array.isArray(rawAtts)
    ? rawAtts
    : (typeof rawAtts === "string" && rawAtts ? JSON.parse(rawAtts) : [])

  return {
    id: row.id,
    direction: row.direction,
    from: row.from_addr,
    to: JSON.parse(row.to_addrs || "[]"),
    cc: JSON.parse(row.cc_addrs || "[]"),
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    isRead: !!row.is_read,
    createdAt: row.created_at,
    address: row.address,
    attachments: atts.map(serializeAttachment),
    hasQuarantined: !!row.has_quarantined,
  }
}

import { decrypt, isEncrypted } from "./lib/secret-box.js"

// SMTP row serializer. Two variants:
//
//   serializeSmtp(row)        → masked view; never returns the password.
//                                Used by GET /api/domains/:id/smtp.
//   serializeSmtpReveal(row)  → one-shot reveal; returns plaintext password
//                                exactly once (POST /smtp/regenerate).
//
// Legacy rows (created before envelope encryption) store the password as
// plaintext; we still return them on reveal but flag them so callers can
// nudge users to regenerate.

export function serializeSmtp(row: any) {
  return {
    host: row.host,
    port: row.port,
    username: row.username,
    hasPassword: !!row.password,
    encryption: row.encryption,
  }
}

export function serializeSmtpReveal(row: any) {
  const raw: string = row.password ?? ""
  const password = raw && isEncrypted(raw) ? decrypt(raw) : raw
  return {
    host: row.host,
    port: row.port,
    username: row.username,
    password,
    encryption: row.encryption,
    legacy: raw ? !isEncrypted(raw) : false,
  }
}
