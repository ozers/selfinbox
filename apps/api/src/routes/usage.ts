import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import sql from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

const usage = new Hono<{ Variables: AppVariables }>();

usage.use("*", authMiddleware);

// GET /api/usage — counts only, no quotas
usage.get("/", async (c) => {
  const userId = c.get("userId");
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [
    [emailsSentRow],
    [emailsReceivedRow],
    [domainsRow],
    [addressesRow],
  ] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM emails WHERE user_id = ${userId} AND direction = 'outbound' AND TO_CHAR(created_at, 'YYYY-MM') = ${currentMonth}`,
    sql`SELECT COUNT(*) as count FROM emails WHERE user_id = ${userId} AND direction = 'inbound'  AND TO_CHAR(created_at, 'YYYY-MM') = ${currentMonth}`,
    sql`SELECT COUNT(*) as count FROM domains WHERE user_id = ${userId}`,
    sql`
      SELECT COUNT(*) as count FROM email_addresses ea
      JOIN domains d ON ea.domain_id = d.id
      WHERE d.user_id = ${userId}
    `,
  ]);

  return c.json({
    emailsSent: Number(emailsSentRow.count),
    emailsReceived: Number(emailsReceivedRow.count),
    domains: Number(domainsRow.count),
    addresses: Number(addressesRow.count),
  });
});

export default usage;
