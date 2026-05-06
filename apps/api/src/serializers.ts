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

export function serializeEmail(row: any) {
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
  }
}

export function serializeSmtp(row: any) {
  return {
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    encryption: row.encryption,
  }
}
