import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import sql from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { serializeSmtp } from "../serializers.js";

const smtp = new Hono<{ Variables: AppVariables }>();

smtp.use("*", authMiddleware);

// GET /api/domains/:id/smtp
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
smtp.post("/:id/smtp/regenerate", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;

  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const newPassword = `mrl_sk_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  await sql`UPDATE smtp_credentials SET password = ${newPassword} WHERE domain_id = ${domainId}`;

  const [creds] = await sql`SELECT * FROM smtp_credentials WHERE domain_id = ${domainId}`;

  return c.json(serializeSmtp(creds));
});

export default smtp;
