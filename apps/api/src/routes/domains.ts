import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import {
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  DeleteIdentityCommand,
  GetIdentityVerificationAttributesCommand,
} from "@aws-sdk/client-ses";
import sql from "../db.js";
import { ses, SES_REGION } from "../lib/aws.js";
import { verifyDomainDns } from "../lib/dns-verify.js";
import { authMiddleware } from "../middleware/auth.js";
import { serializeDomain, serializeAddress } from "../serializers.js";
import { encrypt } from "../lib/secret-box.js";
import { sendEmail, addressVerifyBody } from "../lib/send-email.js";
import { createHash, randomBytes } from "node:crypto";

const domains = new Hono<{ Variables: AppVariables }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip RFC 5322 mailbox-syntax specials and bidi controls from a display
// name before it gets interpolated into an outbound `From` Source. Without
// this, a sender can register `display_name = "Bank <security@bank.com>"`
// and have lenient MUAs render the spoofed angle-addr as the From line.
function sanitizeDisplayName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  let s = raw.normalize("NFKC");
  // Drop control chars + bidi overrides (U+202A..U+202E, U+2066..U+2069).
  s = s.replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/g, "");
  // Strip RFC 5322 specials that would let the value smuggle a second
  // address or break out of the phrase context.
  s = s.replace(/[<>"\\;,()\[\]:@]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.slice(0, 100);
}

function generateForwardingToken() {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

async function startForwardingVerification(
  addressId: string,
  forwardingTarget: string,
  sourceAddress: string,
) {
  // Invalidate any prior pending tokens for this address before issuing a
  // new one. Prevents a previously-leaked link from confirming a freshly
  // re-targeted forwarder.
  await sql`DELETE FROM forwarding_tokens WHERE address_id = ${addressId} AND used_at IS NULL`;
  const { raw, hash } = generateForwardingToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO forwarding_tokens (id, address_id, target_email, token_hash, expires_at)
    VALUES (${crypto.randomUUID()}, ${addressId}, ${forwardingTarget}, ${hash}, ${expiresAt})
  `;
  sendEmail(forwardingTarget, "Confirm email forwarding", addressVerifyBody(raw, sourceAddress)).catch((err) =>
    console.error("[domains/forwarding] confirmation send failed:", err?.message ?? err),
  );
}

// Public confirmation endpoint — clicked from the email. Marks the
// forwarding destination as verified and lets inbound emails relay.
//
// Mounted before the authMiddleware so it does not require a session.
domains.get("/forwarding/confirm", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token is required" }, 400);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [record] = await sql`
    SELECT * FROM forwarding_tokens WHERE token_hash = ${tokenHash} AND used_at IS NULL
  `;
  if (!record) return c.json({ error: "Invalid or expired token" }, 400);
  if (new Date(record.expires_at) < new Date()) {
    return c.json({ error: "Token has expired" }, 400);
  }

  await sql.begin(async (tx) => {
    // Re-check inside the transaction in case the target was changed
    // between when the link was issued and clicked — only confirm if the
    // address still forwards to the same target.
    const [addr] = await tx`SELECT forwarding_to FROM email_addresses WHERE id = ${record.address_id}`;
    if (!addr || addr.forwarding_to !== record.target_email) {
      throw new Error("Forwarding target changed before confirmation");
    }
    await tx`UPDATE email_addresses SET forwarding_verified_at = NOW() WHERE id = ${record.address_id}`;
    await tx`UPDATE forwarding_tokens SET used_at = NOW() WHERE id = ${record.id}`;
  }).catch((err) => {
    console.warn("[domains/forwarding] confirm aborted:", err?.message ?? err);
  });

  return c.json({ message: "Forwarding confirmed" });
});

domains.use("*", authMiddleware);

async function getDomainWithRelations(domainId: string) {
  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId}` as any[];
  if (!domain) return null;
  const [addresses, dnsRecords] = await Promise.all([
    sql`SELECT * FROM email_addresses WHERE domain_id = ${domainId}`,
    sql`SELECT * FROM dns_records WHERE domain_id = ${domainId}`,
  ]);
  return { ...domain, addresses, dns_records: dnsRecords };
}

// GET /api/domains
domains.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await sql`SELECT * FROM domains WHERE user_id = ${userId}`;
  const result = await Promise.all(
    rows.map(async (d) => {
      const [addresses, dnsRecords] = await Promise.all([
        sql`SELECT * FROM email_addresses WHERE domain_id = ${d.id}`,
        sql`SELECT * FROM dns_records WHERE domain_id = ${d.id}`,
      ]);
      return serializeDomain({ ...d, addresses, dns_records: dnsRecords });
    })
  );
  return c.json(result);
});

// GET /api/domains/:id
domains.get("/:id", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");
  const domain = await getDomainWithRelations(domainId);
  if (!domain || domain.user_id !== userId) {
    return c.json({ error: "Domain not found" }, 404);
  }
  return c.json(serializeDomain(domain));
});

// POST /api/domains
domains.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const domainName = body.domain?.trim()?.toLowerCase();

  if (!domainName) {
    return c.json({ error: "Domain is required" }, 400);
  }

  // One domain per deploy — its SES identity, MX and DNS are account-global, so
  // it can belong to exactly one user. Check across ALL users (not just this
  // one) before touching SES, so a second account can't claim — and then
  // receive inbound mail for — a domain another user already added.
  const [existing] = await sql`SELECT user_id FROM domains WHERE domain = ${domainName}`;
  if (existing) {
    return existing.user_id === userId
      ? c.json({ error: "Domain already added" }, 409)
      : c.json({ error: "This domain is already registered on this instance." }, 409);
  }

  const domainId = crypto.randomUUID();

  const verifyRes = await ses.send(new VerifyDomainIdentityCommand({ Domain: domainName }));
  const verificationToken = verifyRes.VerificationToken!;

  const dkimRes = await ses.send(new VerifyDomainDkimCommand({ Domain: domainName }));
  const dkimTokens = dkimRes.DkimTokens || [];

  await sql`
    INSERT INTO domains (id, user_id, domain, ses_verification_token, ses_dkim_tokens)
    VALUES (${domainId}, ${userId}, ${domainName}, ${verificationToken}, ${JSON.stringify(dkimTokens)})
  `;

  await Promise.all([
    sql`INSERT INTO dns_records (id, domain_id, type, name, value) VALUES (${crypto.randomUUID()}, ${domainId}, 'TXT', ${`_amazonses.${domainName}`}, ${verificationToken})`,
    sql`INSERT INTO dns_records (id, domain_id, type, name, value) VALUES (${crypto.randomUUID()}, ${domainId}, 'MX', ${domainName}, ${`10 inbound-smtp.${SES_REGION}.amazonaws.com`})`,
    sql`INSERT INTO dns_records (id, domain_id, type, name, value) VALUES (${crypto.randomUUID()}, ${domainId}, 'TXT', ${domainName}, 'v=spf1 include:amazonses.com ~all')`,
    sql`INSERT INTO dns_records (id, domain_id, type, name, value) VALUES (${crypto.randomUUID()}, ${domainId}, 'TXT', ${`_dmarc.${domainName}`}, ${`v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainName}`})`,
    ...dkimTokens.map((token) =>
      sql`INSERT INTO dns_records (id, domain_id, type, name, value) VALUES (${crypto.randomUUID()}, ${domainId}, 'CNAME', ${`${token}._domainkey.${domainName}`}, ${`${token}.dkim.amazonses.com`})`
    ),
  ]);

  const smtpHost = process.env.SMTP_HOST || `email-smtp.${SES_REGION}.amazonaws.com`;
  const smtpPort = Number(process.env.SMTP_PORT_EXTERNAL) || 587;
  const smtpPassword = `mrl_sk_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const smtpPasswordStored = encrypt(smtpPassword);
  await sql`
    INSERT INTO smtp_credentials (id, domain_id, host, port, username, password, encryption)
    VALUES (${crypto.randomUUID()}, ${domainId}, ${smtpHost}, ${smtpPort}, ${`postmaster@${domainName}`}, ${smtpPasswordStored}, 'STARTTLS')
  `;

  const result = await getDomainWithRelations(domainId);
  return c.json(serializeDomain(result), 201);
});

// POST /api/domains/:id/verify
domains.post("/:id/verify", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const records = await sql`SELECT * FROM dns_records WHERE domain_id = ${domainId}`;
  const dnsResults = await verifyDomainDns(domain.domain, records as any[]);

  await Promise.all(
    dnsResults.map((result) =>
      sql`UPDATE dns_records SET verified = ${result.verified} WHERE id = ${result.id}`
    )
  );

  const sesStatus = await ses.send(
    new GetIdentityVerificationAttributesCommand({ Identities: [domain.domain] })
  );
  const attrs = sesStatus.VerificationAttributes?.[domain.domain];
  const sesVerified = attrs?.VerificationStatus === "Success";

  const allDnsVerified = dnsResults.every((r) => r.verified);
  if (allDnsVerified && sesVerified) {
    await sql`UPDATE domains SET status = 'active' WHERE id = ${domainId}`;
  }

  const result = await getDomainWithRelations(domainId);
  return c.json(serializeDomain(result));
});

// DELETE /api/domains/:id
domains.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  try {
    await ses.send(new DeleteIdentityCommand({ Identity: domain.domain }));
  } catch {
    // SES cleanup is best-effort
  }

  await sql`DELETE FROM emails WHERE domain_id = ${domainId}`;
  await sql`DELETE FROM domains WHERE id = ${domainId}`;

  return c.json({ message: "Domain deleted" });
});

// POST /api/domains/:id/addresses
domains.post("/:id/addresses", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const body = await c.req.json();
  const { prefix, forwardingTo, isCatchall, displayName } = body;

  if (!prefix && !isCatchall) {
    return c.json({ error: "Prefix is required" }, 400);
  }

  // Validate forwarding target shape before storing — prevents obviously
  // malformed values from ever reaching SES, and matches the public
  // confirmation flow's expectations.
  const normalizedForward = forwardingTo ? String(forwardingTo).toLowerCase().trim() : null;
  if (normalizedForward && (!EMAIL_RE.test(normalizedForward) || normalizedForward.length > 254)) {
    return c.json({ error: "Invalid forwarding email" }, 400);
  }

  const address = isCatchall ? `*@${domain.domain}` : `${prefix}@${domain.domain}`;
  const id = crypto.randomUUID();
  const cleanDisplayName = sanitizeDisplayName(displayName);

  await sql`
    INSERT INTO email_addresses (id, domain_id, address, forwarding_to, is_catchall, display_name)
    VALUES (${id}, ${domainId}, ${address}, ${normalizedForward}, ${!!isCatchall}, ${cleanDisplayName})
  `;

  if (normalizedForward) {
    await startForwardingVerification(id, normalizedForward, address);
  }

  const [created] = await sql`SELECT * FROM email_addresses WHERE id = ${id}`;
  return c.json(serializeAddress(created), 201);
});

// DELETE /api/domains/:id/addresses/:addressId
domains.delete("/:id/addresses/:addressId", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");
  const addressId = c.req.param("addressId");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const [address] = await sql`SELECT * FROM email_addresses WHERE id = ${addressId} AND domain_id = ${domainId}`;
  if (!address) {
    return c.json({ error: "Address not found" }, 404);
  }

  await sql`DELETE FROM email_addresses WHERE id = ${addressId}`;

  return c.json({ message: "Address deleted" });
});

export default domains;
