import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import sql from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { serializeSmtp, serializeSmtpReveal } from "../serializers.js";
import { encrypt } from "../lib/secret-box.js";

const smtp = new Hono<{ Variables: AppVariables }>();

smtp.use("*", authMiddleware);

// GET /api/domains/:id/smtp
//
// Returns metadata only — never the password. The password is shown to the
// user once at creation/regenerate time and is never retrievable again
// through the metadata endpoint. This is the standard "reveal once" pattern
// for API secrets and limits the blast radius of token theft / replay.
smtp.get("/:id/smtp", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;

  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const [creds] = await sql`SELECT * FROM smtp_credentials WHERE domain_id = ${domainId}`;

  if (!creds) {
    return c.json({ error: "SMTP credentials not found" }, 404);
  }

  return c.json(serializeSmtp(creds));
});

// POST /api/domains/:id/smtp/regenerate
//
// Generates a fresh password, stores it encrypted at rest, and returns the
// plaintext exactly once in the response body. Subsequent GETs will not
// expose it again.
smtp.post("/:id/smtp/regenerate", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;

  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const newPassword = `mrl_sk_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const stored = encrypt(newPassword);

  await sql`UPDATE smtp_credentials SET password = ${stored} WHERE domain_id = ${domainId}`;

  const [creds] = await sql`SELECT * FROM smtp_credentials WHERE domain_id = ${domainId}`;

  // Return a reveal payload with the freshly generated plaintext so the
  // user can paste it into their mail client.
  return c.json(serializeSmtpReveal({ ...creds, password: stored }));
});

export default smtp;
