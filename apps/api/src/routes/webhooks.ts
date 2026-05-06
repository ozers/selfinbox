import { Hono } from "hono";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "node:crypto";
import sql from "../db.js";
import { s3, ses, S3_INBOUND_BUCKET } from "../lib/aws.js";
import { parseRawEmail } from "../lib/email-parser.js";

const webhooks = new Hono();

// ── SES: Inbound email ────────────────────────────────────────────────────────

webhooks.post("/ses/inbound", async (c) => {
  const body = await c.req.json();

  if (body.Type === "SubscriptionConfirmation") {
    if (body.SubscribeURL) {
      await fetch(body.SubscribeURL);
      console.log("[webhook/inbound] SNS subscription confirmed");
    }
    return c.json({ message: "Subscription confirmed" });
  }

  if (body.Type === "Notification") {
    try {
      const message = JSON.parse(body.Message);
      await handleInboundEmail(message);
    } catch (err) {
      console.error("[webhook/inbound] Failed to process inbound email:", err);
    }
    return c.json({ message: "OK" });
  }

  return c.json({ message: "Unknown message type" }, 400);
});

async function handleInboundEmail(snsMessage: any) {
  const receipt = snsMessage.receipt;
  const mail = snsMessage.mail;

  if (!receipt || !mail) {
    console.error("[webhook/inbound] Missing receipt or mail");
    return;
  }

  const recipients: string[] = receipt.recipients || [];
  const messageId = mail.messageId;

  const s3Action = receipt.action;
  const s3Bucket = s3Action?.bucketName || S3_INBOUND_BUCKET;
  const s3Key = s3Action?.objectKey || `incoming/${messageId}`;

  const s3Res = await s3.send(new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key }));
  const rawEmail = await s3Res.Body?.transformToString();

  if (!rawEmail) {
    console.error("[webhook/inbound] Empty email body from S3");
    return;
  }

  const parsed = await parseRawEmail(rawEmail);

  for (const recipientAddr of recipients) {
    const recipientDomain = recipientAddr.split("@")[1]?.toLowerCase();
    if (!recipientDomain) continue;

    const [domain] = await sql`
      SELECT * FROM domains WHERE domain = ${recipientDomain} AND status = 'active'
    `;

    if (!domain) {
      console.log(`[webhook/inbound] Domain not found or not active: ${recipientDomain}`);
      continue;
    }

    let [address] = await sql`
      SELECT * FROM email_addresses WHERE address = ${recipientAddr.toLowerCase()} AND domain_id = ${domain.id}
    `;

    if (!address) {
      [address] = await sql`
        SELECT * FROM email_addresses WHERE domain_id = ${domain.id} AND is_catchall = true
      `;
    }

    if (!address) {
      console.log(`[webhook/inbound] No matching address for: ${recipientAddr}`);
      continue;
    }

    const emailId = crypto.randomUUID();
    await sql`
      INSERT INTO emails (id, user_id, domain_id, address, direction, from_addr, to_addrs, cc_addrs, subject, body_text, body_html, ses_message_id, s3_key)
      VALUES (${emailId}, ${domain.user_id}, ${domain.id}, ${address.address}, 'inbound', ${parsed.from}, ${JSON.stringify(parsed.to)}, ${JSON.stringify(parsed.cc)}, ${parsed.subject}, ${parsed.bodyText}, ${parsed.bodyHtml}, ${messageId}, ${s3Key})
    `;

    console.log(`[webhook/inbound] Stored email ${emailId} for ${address.address}`);

    if (address.forwarding_to) {
      try {
        await ses.send(
          new SendEmailCommand({
            Source: address.address,
            Destination: { ToAddresses: [address.forwarding_to] },
            Message: {
              Subject: { Data: `Fwd: ${parsed.subject}`, Charset: "UTF-8" },
              Body: {
                ...(parsed.bodyHtml ? { Html: { Data: parsed.bodyHtml, Charset: "UTF-8" } } : {}),
                Text: { Data: parsed.bodyText || parsed.subject, Charset: "UTF-8" },
              },
            },
          })
        );
        console.log(`[webhook/inbound] Forwarded to ${address.forwarding_to}`);
      } catch (err) {
        console.error("[webhook/inbound] Forward failed:", err);
      }
    }
  }
}

// ── SES: Bounce & Complaint ───────────────────────────────────────────────────

webhooks.post("/ses/bounce", async (c) => {
  const body = await c.req.json();

  if (body.Type === "SubscriptionConfirmation") {
    if (body.SubscribeURL) {
      await fetch(body.SubscribeURL);
      console.log("[webhook/bounce] SNS subscription confirmed");
    }
    return c.json({ message: "Subscription confirmed" });
  }

  if (body.Type === "Notification") {
    try {
      const message = JSON.parse(body.Message);
      await handleBounceOrComplaint(message);
    } catch (err) {
      console.error("[webhook/bounce] Failed to process notification:", err);
    }
    return c.json({ message: "OK" });
  }

  return c.json({ message: "Unknown message type" }, 400);
});

async function handleBounceOrComplaint(message: any) {
  const notifType = message.notificationType;

  if (notifType === "Bounce") {
    const bounce = message.bounce;
    const bouncedRecipients: string[] = (bounce.bouncedRecipients || []).map((r: any) => r.emailAddress);
    const bounceType: string = bounce.bounceType;

    for (const addr of bouncedRecipients) {
      const [emailAddr] = await sql`
        SELECT ea.*, d.user_id FROM email_addresses ea
        JOIN domains d ON ea.domain_id = d.id
        WHERE ea.address = ${addr}
      `;

      if (emailAddr) {
        await sql`
          INSERT INTO bounce_events (id, email_address_id, user_id, type, raw)
          VALUES (${crypto.randomUUID()}, ${emailAddr.id}, ${emailAddr.user_id}, ${bounceType === "Permanent" ? "hard" : "soft"}, ${JSON.stringify(bounce)})
        `;

        if (bounceType === "Permanent") {
          await sql`UPDATE email_addresses SET is_active = false WHERE id = ${emailAddr.id}`;
          console.log(`[webhook/bounce] Hard bounce — deactivated address ${addr}`);
        }
      }
    }
  } else if (notifType === "Complaint") {
    const complaint = message.complaint;
    const complainedRecipients: string[] = (complaint.complainedRecipients || []).map((r: any) => r.emailAddress);

    for (const addr of complainedRecipients) {
      const [recentSend] = await sql`
        SELECT e.user_id FROM emails e
        WHERE e.direction = 'outbound' AND e.to_addrs LIKE ${`%${addr}%`}
        ORDER BY e.created_at DESC LIMIT 1
      `;

      if (recentSend) {
        await sql`UPDATE users SET suspended_at = NOW() WHERE id = ${recentSend.user_id}`;
        console.log(`[webhook/bounce] Complaint from ${addr} — suspended user ${recentSend.user_id}`);

        await sql`
          INSERT INTO bounce_events (id, email_address_id, user_id, type, raw)
          VALUES (${crypto.randomUUID()}, null, ${recentSend.user_id}, 'complaint', ${JSON.stringify(complaint)})
        `;
      }
    }
  }
}

export default webhooks;
