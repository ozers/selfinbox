import { SendEmailCommand } from "@aws-sdk/client-ses";
import { ses } from "./aws.js";

const FROM_EMAIL = process.env.FROM_EMAIL || "";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

export async function sendEmail(to: string, subject: string, body: string) {
  // In dev without AWS creds, just log
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.log(`[email] To: ${to}\nSubject: ${subject}\n${body}`);
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
