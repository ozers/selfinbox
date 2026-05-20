import crypto from "node:crypto";

// SNS HTTP/S webhook signature verification.
//
// AWS publishes the signing certificate at SigningCertURL (always under
// sns.<region>.amazonaws.com). We sign a canonical string built from the
// message fields in the order documented at
// https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
//
// The verifier is intentionally dependency-free: it pins the cert host to
// the AWS SNS domain, caches fetched certs by URL with a TTL, and supports
// both SignatureVersion 1 (sha1) and 2 (sha256). Reject unknown values.

const CERT_CACHE = new Map<string, { pem: string; fetchedAt: number }>();
const CERT_TTL_MS = 60 * 60 * 1000;

const SIGNED_KEYS_NOTIFICATION = [
  "Message",
  "MessageId",
  "Subject",
  "Timestamp",
  "TopicArn",
  "Type",
] as const;

const SIGNED_KEYS_SUBSCRIPTION = [
  "Message",
  "MessageId",
  "SubscribeURL",
  "Timestamp",
  "Token",
  "TopicArn",
  "Type",
] as const;

export interface SnsMessage {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  Token?: string;
  SubscribeURL?: string;
  [key: string]: unknown;
}

function isAwsCertUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    // Allow sns.<region>.amazonaws.com and sns.<region>.amazonaws.com.cn
    return /^sns(\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(u.hostname);
  } catch {
    return false;
  }
}

async function fetchCertificate(certUrl: string): Promise<string> {
  const cached = CERT_CACHE.get(certUrl);
  if (cached && Date.now() - cached.fetchedAt < CERT_TTL_MS) return cached.pem;

  const res = await fetch(certUrl);
  if (!res.ok) throw new Error(`SNS cert fetch failed: ${res.status}`);
  const pem = await res.text();
  if (!pem.includes("BEGIN CERTIFICATE")) {
    throw new Error("SNS cert payload is not a PEM certificate");
  }
  CERT_CACHE.set(certUrl, { pem, fetchedAt: Date.now() });
  return pem;
}

function buildStringToSign(msg: SnsMessage): string {
  const type = msg.Type;
  const keys =
    type === "Notification"
      ? SIGNED_KEYS_NOTIFICATION
      : type === "SubscriptionConfirmation" || type === "UnsubscribeConfirmation"
      ? SIGNED_KEYS_SUBSCRIPTION
      : null;
  if (!keys) throw new Error(`Unsupported SNS Type: ${String(type)}`);

  const parts: string[] = [];
  for (const k of keys) {
    const v = msg[k];
    if (v === undefined || v === null) {
      // Subject is optional on notifications; skip if absent.
      if (k === "Subject") continue;
      throw new Error(`Missing SNS field: ${k}`);
    }
    parts.push(k);
    parts.push(String(v));
  }
  return parts.join("\n") + "\n";
}

export async function verifySnsMessage(msg: SnsMessage): Promise<void> {
  if (!msg || typeof msg !== "object") throw new Error("Invalid SNS payload");
  if (!msg.SigningCertURL || !isAwsCertUrl(msg.SigningCertURL)) {
    throw new Error("Invalid SigningCertURL");
  }
  if (!msg.Signature) throw new Error("Missing Signature");

  const version = msg.SignatureVersion;
  const algo = version === "1" ? "RSA-SHA1" : version === "2" ? "RSA-SHA256" : null;
  if (!algo) throw new Error(`Unsupported SignatureVersion: ${String(version)}`);

  // Reject stale messages (>1 hour). Blocks replay of a previously-captured
  // valid notification long after AWS would have retried.
  if (msg.Timestamp) {
    const ts = Date.parse(msg.Timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 60 * 60 * 1000) {
      throw new Error("SNS Timestamp out of range");
    }
  }

  const pem = await fetchCertificate(msg.SigningCertURL);
  const stringToSign = buildStringToSign(msg);
  const signature = Buffer.from(msg.Signature, "base64");

  const ok = crypto.createVerify(algo).update(stringToSign, "utf8").verify(pem, signature);
  if (!ok) throw new Error("SNS signature verification failed");
}

export function isAllowedSubscribeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return /^sns(\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(u.hostname);
  } catch {
    return false;
  }
}
