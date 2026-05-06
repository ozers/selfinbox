import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import sql from "../db.js";
import { ses } from "../lib/aws.js";
import { authMiddleware } from "../middleware/auth.js";
import { serializeEmail } from "../serializers.js";

const emails = new Hono<{ Variables: AppVariables }>();

emails.use("*", authMiddleware);

// GET /api/emails
emails.get("/", async (c) => {
  const userId = c.get("userId");
  const domainFilter = c.req.query("domain");
  const addressFilter = c.req.query("address");
  const statusFilter = c.req.query("status");
  const directionFilter = c.req.query("direction");
  const searchFilter = c.req.query("search");

  // Build dynamic query with numbered params ($1, $2, ...)
  const joins: string[] = [];
  const conditions: string[] = [];
  const params: any[] = [];

  conditions.push(`e.user_id = $${params.push(userId)}`);

  if (domainFilter) {
    joins.push("JOIN domains d ON e.domain_id = d.id");
    conditions.push(`d.domain = $${params.push(domainFilter)}`);
  }

  if (addressFilter) {
    conditions.push(`e.address = $${params.push(addressFilter)}`);
  }

  if (statusFilter === "read") {
    conditions.push("e.is_read = true");
  } else if (statusFilter === "unread") {
    conditions.push("e.is_read = false");
  }

  if (directionFilter === "inbound" || directionFilter === "outbound") {
    conditions.push(`e.direction = $${params.push(directionFilter)}`);
  }

  if (searchFilter) {
    const like = `%${searchFilter}%`;
    conditions.push(
      `(e.subject ILIKE $${params.push(like)} OR e.from_addr ILIKE $${params.push(like)} OR e.to_addrs ILIKE $${params.push(like)})`
    );
  }

  const queryStr = `SELECT e.* FROM emails e ${joins.join(" ")} WHERE ${conditions.join(" AND ")} ORDER BY e.created_at DESC`;
  const result = await sql.unsafe(queryStr, params);

  return c.json(result.map(serializeEmail));
});

// GET /api/emails/:id
emails.get("/:id", async (c) => {
  const userId = c.get("userId");
  const emailId = c.req.param("id");

  const [email] = await sql`SELECT * FROM emails WHERE id = ${emailId} AND user_id = ${userId}`;

  if (!email) {
    return c.json({ error: "Email not found" }, 404);
  }

  if (!email.is_read) {
    await sql`UPDATE emails SET is_read = true WHERE id = ${emailId}`;
    email.is_read = true;
  }

  return c.json(serializeEmail(email));
});

// POST /api/emails/send
emails.post("/send", async (c) => {
  const userId = c.get("userId");
  const user = c.get("user") as any;
  const body = await c.req.json();
  const { from, to, cc, subject, bodyText, bodyHtml } = body;

  if (!from || !to || !subject) {
    return c.json({ error: "from, to, and subject are required" }, 400);
  }

  // Check suspended
  if (user.suspended_at) {
    return c.json({ error: "Account suspended. Contact support." }, 403);
  }

  // Validate sender belongs to user
  const fromDomain = from.split("@")[1];
  const [domain] = await sql`
    SELECT * FROM domains WHERE domain = ${fromDomain} AND user_id = ${userId} AND status = 'active'
  `;

  if (!domain) {
    return c.json({ error: "Sender domain not verified or not found" }, 403);
  }

  const [addr] = await sql`
    SELECT * FROM email_addresses WHERE address = ${from} AND domain_id = ${domain.id}
  `;

  if (!addr) {
    return c.json({ error: "Sender address not found" }, 403);
  }

  const toAddrs = Array.isArray(to) ? to : [to];
  const ccAddrs = cc ? (Array.isArray(cc) ? cc : [cc]) : [];

  const source = addr.display_name ? `${addr.display_name} <${from}>` : from;

  const sesRes = await ses.send(
    new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: toAddrs,
        CcAddresses: ccAddrs.length > 0 ? ccAddrs : undefined,
      },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          ...(bodyHtml ? { Html: { Data: bodyHtml, Charset: "UTF-8" } } : {}),
          ...(bodyText ? { Text: { Data: bodyText, Charset: "UTF-8" } } : {}),
        },
      },
    })
  );

  const emailId = crypto.randomUUID();
  await sql`
    INSERT INTO emails (id, user_id, domain_id, address, direction, from_addr, to_addrs, cc_addrs, subject, body_text, body_html, is_read, ses_message_id)
    VALUES (${emailId}, ${userId}, ${domain.id}, ${from}, 'outbound', ${from}, ${JSON.stringify(toAddrs)}, ${JSON.stringify(ccAddrs)}, ${subject}, ${bodyText || ""}, ${bodyHtml || ""}, true, ${sesRes.MessageId || null})
  `;

  const [created] = await sql`SELECT * FROM emails WHERE id = ${emailId}`;
  return c.json(serializeEmail(created), 201);
});

// DELETE /api/emails/:id
emails.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const emailId = c.req.param("id");

  const [email] = await sql`SELECT * FROM emails WHERE id = ${emailId} AND user_id = ${userId}`;

  if (!email) {
    return c.json({ error: "Email not found" }, 404);
  }

  await sql`DELETE FROM emails WHERE id = ${emailId}`;
  return c.json({ message: "Email deleted" });
});

export default emails;
