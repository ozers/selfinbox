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

const domains = new Hono<{ Variables: AppVariables }>();

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

  const [existing] = await sql`SELECT id FROM domains WHERE domain = ${domainName} AND user_id = ${userId}`;
  if (existing) {
    return c.json({ error: "Domain already added" }, 409);
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
  await sql`
    INSERT INTO smtp_credentials (id, domain_id, host, port, username, password, encryption)
    VALUES (${crypto.randomUUID()}, ${domainId}, ${smtpHost}, ${smtpPort}, ${`postmaster@${domainName}`}, ${smtpPassword}, 'STARTTLS')
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

  const address = isCatchall ? `*@${domain.domain}` : `${prefix}@${domain.domain}`;
  const id = crypto.randomUUID();

  await sql`
    INSERT INTO email_addresses (id, domain_id, address, forwarding_to, is_catchall, display_name)
    VALUES (${id}, ${domainId}, ${address}, ${forwardingTo || null}, ${!!isCatchall}, ${displayName || null})
  `;

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
