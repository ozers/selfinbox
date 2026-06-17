import { Hono } from "hono";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "node:crypto";
import sql from "../db.js";
import { s3, ses, S3_INBOUND_BUCKET } from "../lib/aws.js";
import { parseRawEmail } from "../lib/email-parser.js";
import { ingestAttachments } from "../lib/attachments.js";
import { verifySnsMessage, isAllowedSubscribeUrl, type SnsMessage } from "../lib/sns-verify.js";

const webhooks = new Hono();

// Number of distinct complaint events within COMPLAINT_WINDOW_MS that will
// trigger an account suspension. One complaint can be malicious or a mis-
// click; a small rolling threshold is the AWS-recommended posture.
const COMPLAINT_THRESHOLD = Number(process.env.COMPLAINT_SUSPEND_THRESHOLD) || 3;
const COMPLAINT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Topic ARN allowlist. If unset, we don't restrict by topic — the SNS
// signature check above still proves the message came from AWS, but
// pinning the TopicArn defends against a different SNS topic in the same
// account being repurposed to drive this endpoint.
const ALLOWED_TOPIC_ARNS = (process.env.SNS_ALLOWED_TOPIC_ARNS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isTopicAllowed(arn: string | undefined): boolean {
  if (ALLOWED_TOPIC_ARNS.length === 0) return true;
  return !!arn && ALLOWED_TOPIC_ARNS.includes(arn);
}

function escapeLikePattern(s: string): string {
  // postgres.js parameterizes the value but LIKE treats %, _ as wildcards.
  // For email addresses neither should ever appear, but defense in depth.
  return s.replace(/([\\%_])/g, "\\$1");
}

async function readSnsPayload(c: any): Promise<SnsMessage | null> {
  // SNS sends application/json but also tolerates text/plain. We always
  // parse from the raw text to keep the canonical string-to-sign exact.
  const raw = await c.req.text();
  try {
    return JSON.parse(raw) as SnsMessage;
  } catch {
    return null;
  }
}

async function handleSnsRequest(
  c: any,
  tag: "inbound" | "bounce",
  onNotification: (msg: SnsMessage) => Promise<void>,
) {
  const body = await readSnsPayload(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  try {
    await verifySnsMessage(body);
  } catch (err) {
    console.warn(`[webhook/${tag}] Rejected unverified SNS message:`, (err as Error).message);
    return c.json({ error: "Invalid SNS signature" }, 403);
  }

  if (!isTopicAllowed(body.TopicArn)) {
    console.warn(`[webhook/${tag}] Rejected SNS message from disallowed TopicArn: ${body.TopicArn}`);
    return c.json({ error: "Untrusted topic" }, 403);
  }

  if (body.Type === "SubscriptionConfirmation" || body.Type === "UnsubscribeConfirmation") {
    if (body.SubscribeURL && isAllowedSubscribeUrl(body.SubscribeURL)) {
      await fetch(body.SubscribeURL);
      console.log(`[webhook/${tag}] SNS subscription confirmation handled`);
    } else {
      console.warn(`[webhook/${tag}] SubscribeURL rejected by host allowlist`);
    }
    return c.json({ message: "OK" });
  }

  if (body.Type === "Notification") {
    let message: any;
    try {
      message = JSON.parse(body.Message ?? "{}");
    } catch (err) {
      // Malformed payload — a retry can't fix it. Ack (200) so SNS stops.
      console.error(`[webhook/${tag}] Unparseable notification, dropping:`, err);
      return c.json({ message: "OK" });
    }
    try {
      await onNotification(message);
    } catch (err) {
      // Likely transient (S3 fetch, DB blip). Return 5xx so SNS retries with
      // backoff instead of silently dropping the mail — the inbound write is
      // idempotent ((ses_message_id, address)), so a retry can't duplicate.
      console.error(`[webhook/${tag}] Processing failed, letting SNS retry:`, err);
      return c.json({ error: "Processing failed" }, 500);
    }
    return c.json({ message: "OK" });
  }

  return c.json({ message: "Unknown message type" }, 400);
}

// ── SES: Inbound email ────────────────────────────────────────────────────────

webhooks.post("/ses/inbound", (c) => handleSnsRequest(c, "inbound", handleInboundEmail));

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
  // Hard-pin the bucket: never honor a bucket name supplied by the SNS
  // payload, even if signature-verified. Limits blast radius if the topic
  // is ever pointed at a different bucket by accident.
  const s3Bucket = S3_INBOUND_BUCKET;
  const claimedBucket = s3Action?.bucketName;
  if (claimedBucket && claimedBucket !== S3_INBOUND_BUCKET) {
    console.warn(`[webhook/inbound] Ignoring foreign bucket from SNS payload: ${claimedBucket}`);
  }

  // Restrict the S3 key to safe shapes. SES uses messageId-based keys; we
  // refuse anything with traversal, leading slash, or unexpected chars.
  const rawKey = s3Action?.objectKey || `incoming/${messageId}`;
  if (typeof rawKey !== "string" || rawKey.length > 512 || /\.\.|^\//.test(rawKey) || !/^[A-Za-z0-9._/\-]+$/.test(rawKey)) {
    console.warn(`[webhook/inbound] Rejected suspicious S3 key: ${rawKey}`);
    return;
  }
  const s3Key = rawKey;

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
      console.log(`[webhook/inbound] Domain not active: ${recipientDomain}`);
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
      console.log(`[webhook/inbound] No matching address for domain ${domain.id}`);
      continue;
    }

    const emailId = crypto.randomUUID();

    // SNS is at-least-once. Cheap pre-check skips the S3 + parse work on a
    // re-delivery of the same message to the same recipient; the
    // (ses_message_id, address) ON CONFLICT below is the race-safe backstop for
    // two deliveries landing concurrently.
    const [dup] = await sql`
      SELECT 1 FROM emails WHERE ses_message_id = ${messageId} AND address = ${address.address}
    `;
    if (dup) {
      console.log(`[webhook/inbound] Duplicate delivery ignored (${messageId} → ${address.address})`);
      continue;
    }

    const { attachments, hasQuarantined } = await ingestAttachments(
      parsed.attachments,
      domain.user_id,
      emailId,
    );

    const inserted = await sql`
      INSERT INTO emails (id, user_id, domain_id, address, direction, from_addr, to_addrs, cc_addrs, subject, body_text, body_html, ses_message_id, s3_key, attachments_meta, has_quarantined)
      VALUES (${emailId}, ${domain.user_id}, ${domain.id}, ${address.address}, 'inbound', ${parsed.from}, ${JSON.stringify(parsed.to)}, ${JSON.stringify(parsed.cc)}, ${parsed.subject}, ${parsed.bodyText}, ${parsed.bodyHtml}, ${messageId}, ${s3Key}, ${JSON.stringify(attachments)}::jsonb, ${hasQuarantined})
      ON CONFLICT (ses_message_id, address) DO NOTHING
    `;
    if (inserted.count === 0) {
      console.log(`[webhook/inbound] Concurrent duplicate ignored (${messageId} → ${address.address})`);
      continue;
    }

    console.log(`[webhook/inbound] Stored email ${emailId} (${attachments.length} attachments, quarantined=${hasQuarantined})`);

    // Forwarding requires opt-in verification (see PR4). Without an
    // explicit forwarding_verified_at timestamp we refuse to relay.
    const fwd = address.forwarding_to;
    if (fwd && address.forwarding_verified_at) {
      try {
        await ses.send(
          new SendEmailCommand({
            Source: address.address,
            Destination: { ToAddresses: [fwd] },
            Message: {
              Subject: { Data: `Fwd: ${parsed.subject}`, Charset: "UTF-8" },
              Body: {
                ...(parsed.bodyHtml ? { Html: { Data: parsed.bodyHtml, Charset: "UTF-8" } } : {}),
                Text: { Data: parsed.bodyText || parsed.subject, Charset: "UTF-8" },
              },
            },
          })
        );
        console.log(`[webhook/inbound] Forwarded email ${emailId}`);
      } catch (err) {
        console.error("[webhook/inbound] Forward failed:", err);
      }
    } else if (fwd) {
      console.log(`[webhook/inbound] Skipping forward — destination not verified for address ${address.id}`);
    }
  }
}

// ── SES: Bounce & Complaint ───────────────────────────────────────────────────

webhooks.post("/ses/bounce", (c) => handleSnsRequest(c, "bounce", handleBounceOrComplaint));

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
          console.log(`[webhook/bounce] Hard bounce — deactivated address ${emailAddr.id}`);
        }
      }
    }
  } else if (notifType === "Complaint") {
    const complaint = message.complaint;
    const complainedRecipients: string[] = (complaint.complainedRecipients || []).map((r: any) => r.emailAddress);

    for (const addr of complainedRecipients) {
      const likePattern = `%${escapeLikePattern(addr)}%`;
      const [recentSend] = await sql`
        SELECT e.user_id FROM emails e
        WHERE e.direction = 'outbound' AND e.to_addrs LIKE ${likePattern} ESCAPE '\\'
        ORDER BY e.created_at DESC LIMIT 1
      `;

      if (!recentSend) continue;

      // Record the complaint event first, then decide on suspension based
      // on the rolling count. A single complaint never suspends.
      await sql`
        INSERT INTO bounce_events (id, email_address_id, user_id, type, raw)
        VALUES (${crypto.randomUUID()}, null, ${recentSend.user_id}, 'complaint', ${JSON.stringify(complaint)})
      `;

      const windowStart = new Date(Date.now() - COMPLAINT_WINDOW_MS);
      const [countRow] = await sql`
        SELECT COUNT(*)::int AS c FROM bounce_events
        WHERE user_id = ${recentSend.user_id}
          AND type = 'complaint'
          AND created_at >= ${windowStart}
      ` as any[];
      const count = Number(countRow?.c ?? 0);

      if (count >= COMPLAINT_THRESHOLD) {
        await sql`UPDATE users SET suspended_at = NOW() WHERE id = ${recentSend.user_id} AND suspended_at IS NULL`;
        console.log(`[webhook/bounce] Complaint threshold reached for user ${recentSend.user_id} (${count}/${COMPLAINT_THRESHOLD}) — suspended`);
      } else {
        console.log(`[webhook/bounce] Complaint recorded for user ${recentSend.user_id} (${count}/${COMPLAINT_THRESHOLD})`);
      }
    }
  }
}

export default webhooks;
