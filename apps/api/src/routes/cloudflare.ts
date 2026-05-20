import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import sql from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { createCloudflareDnsRecords } from "../lib/cloudflare-dns.js";

const cloudflare = new Hono<{ Variables: AppVariables }>();
cloudflare.use("*", authMiddleware);

// POST /api/domains/:id/cloudflare/setup
cloudflare.post("/:id/cloudflare/setup", async (c) => {
  const userId = c.get("userId");
  const domainId = c.req.param("id");

  // Token comes from env var (set once in Railway), not from the client
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return c.json({ error: "Cloudflare integration is not configured on this server" }, 503);
  }

  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) return c.json({ error: "Domain not found" }, 404);

  try {
    const result = await createCloudflareDnsRecords(token, domain.domain, domainId);
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

export default cloudflare;
