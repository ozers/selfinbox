import { SendEmailCommand } from "@aws-sdk/client-ses";
import { ses } from "./aws.js";

const FROM_EMAIL = process.env.FROM_EMAIL || "";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

// Mask a recipient address for log output. Keeps enough signal to debug
// (domain + first char) without leaking PII into ops logs.
function maskAddress(addr: string): string {
  const at = addr.indexOf("@");
  if (at <= 0) return "***";
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  const head = local.charAt(0);
  return `${head}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

export async function sendEmail(to: string, subject: string, body: string) {
  // In dev without AWS creds, log only metadata. The previous version
  // dumped the whole body (including reset tokens, verification links,
  // etc.) into stdout — anything piped to a log aggregator captured it.
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.log(`[email] would-send to=${maskAddress(to)} subjectLen=${subject.length} bodyLen=${body.length}`);
    return;
  }

  if (!FROM_EMAIL) {
    console.error("[email] FROM_EMAIL env var is not set — cannot send system mail");
    return;
  }

  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Text: { Data: body, Charset: "UTF-8" } },
    },
  }));
}

export function verifyEmailBody(token: string) {
  const url = `${APP_URL}/verify-email?token=${token}`;
  return `Welcome!\n\nVerify your email address:\n${url}\n\nThis link expires in 24 hours.`;
}

export function resetPasswordBody(token: string) {
  const url = `${APP_URL}/reset-password?token=${token}`;
  return `You requested a password reset.\n\nReset your password:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`;
}

export function addressVerifyBody(token: string, sourceAddress: string) {
  const url = `${APP_URL}/api/domains/forwarding/confirm?token=${token}`;
  return (
    `Forwarding confirmation\n\n` +
    `Someone (or you) added this address as a forwarding destination for ${sourceAddress}.\n` +
    `Confirm by visiting:\n${url}\n\n` +
    `If you did not request this, ignore this email — forwarding will not start without confirmation.\n\n` +
    `This link expires in 24 hours.`
  );
}
