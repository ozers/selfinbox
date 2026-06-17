# Architecture

How Selfinbox turns AWS SES into a real inbox. Selfinbox is a single Node (Hono) process + Postgres on top of SES, S3 and SNS — no queue, no Redis. SES does delivery, reputation and DKIM signing; everything in this doc is the thin layer that makes it usable.

```
                              ┌──────────────────────────────────────┐
   incoming mail              │  AWS account (one region)            │
   to you@domain ──MX──▶ SES ─┤                                      │
                         recv │   S3   raw MIME  (selfinbox-inbound)  │
                              │   SNS  notification ──┐               │
                              └───────────────────────┼──────────────┘
                                                      │ HTTPS POST (signed)
                                                      ▼
   ┌──────────┐   REST    ┌───────────────────────────────────────┐   SQL   ┌──────────┐
   │ React SPA│ ────────▶ │  Hono API (Node)                      │ ──────▶ │ Postgres │
   └──────────┘           │   /api/*        app + auth            │         └──────────┘
                          │   /api/webhooks/ses/{inbound,bounce}  │
                          │   AWS SDK: SES send · S3 get/put      │
                          └───────────────────────────────────────┘
                                       │ SES SendEmail / SMTP
   outbound mail ◀────────────────────┘  (DKIM-signed by SES)
```

The app serves the built SPA and the API from one process ([index.ts](../apps/api/src/index.ts)). The only always-on background work is a DNS-verification poller ([dns-poller.ts](../apps/api/src/lib/dns-poller.ts)).

---

## Inbound: receiving mail

The interesting half. A message to `you@yourdomain.com` becomes a row in `emails` (plus attachments in S3) like this:

```
1. Sender ──▶ MX(yourdomain.com) = inbound-smtp.<region>.amazonaws.com   → SES receives
2. SES receipt rule set "selfinbox-default", rule "selfinbox-inbound":
      • S3Action  → writes raw MIME to s3://selfinbox-inbound-<acct>/incoming/<messageId>
      • SNSAction → publishes a notification to topic "selfinbox-ses-inbound"
3. SNS ──HTTPS POST──▶ https://your-app/api/webhooks/ses/inbound
4. The webhook verifies, fetches from S3, parses, stores.
```

Step 4 in detail ([webhooks.ts](../apps/api/src/routes/webhooks.ts)):

1. **Verify the SNS signature** ([sns-verify.ts](../apps/api/src/lib/sns-verify.ts)) — the request is rejected unless it carries a valid AWS signature. See [Security](#security-model).
2. **Check the TopicArn allowlist** — optional pin so only *your* inbound topic can drive the endpoint, even within your own account.
3. **Subscription confirmation** — on first subscribe, SNS sends a `SubscriptionConfirmation`; the app auto-confirms it by GETting the `SubscribeURL`, but only after checking the URL host is a real `sns.<region>.amazonaws.com` (SSRF guard).
4. **Fetch the raw email from S3** — the bucket is **hard-pinned** to `S3_INBOUND_BUCKET`; a bucket name in the SNS payload is never honored. The object key is validated against traversal / leading-slash / unexpected chars.
5. **Parse MIME** ([email-parser.ts](../apps/api/src/lib/email-parser.ts) → mailparser) into from / to / cc / subject / text / html / attachments.
6. **Ingest attachments** ([attachments.ts](../apps/api/src/lib/attachments.ts)) — size/count caps, magic-byte sniffing, quarantine of active content / blocklisted extensions / MIME mismatches / ClamAV hits, then upload to S3 under `attachments/{userId}/{emailId}/{idx}` (the filename never touches the key).
7. **Route to a recipient** — match the recipient address, else the domain's catch-all; skip if the domain isn't `active`.
8. **Store idempotently** — `INSERT … ON CONFLICT (ses_message_id, address) DO NOTHING`. SNS is at-least-once; this makes a re-delivery a no-op.
9. **Forward (optional)** — only if the destination completed double-opt-in (`forwarding_verified_at`), so the app can't be turned into a one-hop spam relay.

If step 4–8 throws (a transient S3/DB error), the webhook returns **5xx** so SNS retries with backoff rather than dropping the mail. A malformed payload returns 200 (a retry can't fix it). The idempotent write makes those retries safe.

## Outbound: sending mail

Two paths, both straight to SES:

- **Web compose** — `POST /api/emails/send` → `SES SendEmail` ([emails.ts](../apps/api/src/routes/emails.ts)). Sender ownership is checked, the `From` display name is sanitized against header-injection, and SES errors map to clear 4xx (e.g. the sandbox "recipient not verified" → 422).
- **Per-domain SMTP** — each domain gets SES SMTP credentials (the secret stored AES-256-GCM encrypted, [secret-box.ts](../apps/api/src/lib/secret-box.ts)) to paste into Gmail "Send as", Apple Mail, etc.

SES signs everything with DKIM using the keys published during domain setup.

## Bounces & complaints

SES publishes bounce/complaint notifications to the `selfinbox-ses-bounce` topic → `/api/webhooks/ses/bounce` (same verification path):

- **Hard bounce** → the address is deactivated.
- **Complaint** → recorded; once a user crosses a rolling threshold (default 3 in 30 days) the account is **suspended** from sending. One complaint never suspends.

## DNS

When you add a domain, the app calls SES `VerifyDomainIdentity` + `VerifyDomainDkim` and generates the records to publish ([domains.ts](../apps/api/src/routes/domains.ts)):

| Record | Purpose |
|---|---|
| `MX` → `inbound-smtp.<region>.amazonaws.com` | route inbound mail to SES |
| `TXT _amazonses` | prove domain ownership to SES |
| `TXT` SPF (`v=spf1 include:amazonses.com ~all`) | authorize SES to send |
| 3× `CNAME` DKIM (`<token>.dkim.amazonses.com`) | DKIM signing keys |
| `TXT _dmarc` | DMARC policy |

The poller re-checks DNS + SES status and flips the domain to `active`.

---

## Security model

The webhook is a public, unauthenticated endpoint (it has to be — SNS posts to it). Everything below is what keeps that safe:

- **SNS signature verification** ([sns-verify.ts](../apps/api/src/lib/sns-verify.ts)) — dependency-free. Fetches the signing cert (host pinned to `sns.<region>.amazonaws.com`, cached with a TTL), rebuilds the canonical string-to-sign per the AWS spec, and verifies with the cert's public key. Supports SignatureVersion 1 (SHA1) and 2 (SHA256); rejects anything else. A **±1h timestamp window** blocks replay of an old captured notification.
- **TopicArn allowlist** — defense in depth: pin the exact inbound/bounce topics so a *different* topic in the same account can't drive the endpoint.
- **SubscribeURL host check** — the auto-confirm only follows `SubscribeURL`s on the AWS SNS domain (SSRF guard).
- **Bucket pinning** — the inbound handler reads from `S3_INBOUND_BUCKET` only, never a bucket named in the (even signed) payload. Limits blast radius.
- **S3 key validation** — traversal, leading slash, length and charset checks before any `GetObject`.
- **Idempotent writes** — `UNIQUE(ses_message_id, address)` so at-least-once delivery can't duplicate.
- **Attachment hostility** — sniff, quarantine, never put the filename in an object key, SSE-AES256 at rest, and a hardened download path (see [SELF_HOSTING.md → Attachment security](SELF_HOSTING.md#attachment-security)).
- **Auth** — JWTs carry a `token_version` checked on every request, so a password reset / change instantly invalidates older tokens. Auth routes are rate-limited.

---

## Why SNS → HTTPS (and when you'd want SQS)

SES receipt rules can notify via **SNS**, and SNS can fan out to **HTTPS endpoints** or **SQS queues**. Selfinbox uses **SNS → HTTPS** — SNS pushes each notification straight to the webhook.

**Why push-to-HTTPS here:**
- It matches the project's whole ethos — one process, no queue, no Redis. There's nothing else to run.
- Latency is low: mail lands in the inbox seconds after it arrives.
- Setup is one `aws sns subscribe`; the app auto-confirms.

**The tradeoff:** your endpoint must be public HTTPS and reasonably available. SNS retries a failed HTTP delivery a handful of times over ~an hour, then drops it (or sends it to a dead-letter queue if you configure one). There's no long-term buffer.

**When to move to SNS → SQS + a worker:**
- You need a **durable buffer** — the consumer can be down for a while and catch up later.
- You get **traffic spikes** you'd rather absorb in a queue than handle inline.
- You want **automatic retries + a dead-letter queue** without writing delivery-policy config.
- You're scaling the API horizontally and want at-most-one-worker-processes-a-message semantics.

The migration is intentionally cheap: point the SNS subscription at an SQS queue, add a small poller that pulls messages and calls the same `handleInboundEmail`. Because the inbound write is **already idempotent** (`UNIQUE(ses_message_id, address)`), SQS's at-least-once redelivery is safe with no further changes — the queue just adds durability in front of the same handler.

For a personal or small-team inbox, SNS → HTTPS is the right amount of machinery. SQS is the upgrade you reach for when "the API might be down and I can't lose mail" becomes a real requirement.

---

## What gets provisioned

[`scripts/setup-aws.sh`](../scripts/setup-aws.sh) creates, idempotently, in your account:

- **S3** bucket `selfinbox-inbound-<account-id>` (versioned, public access blocked, bucket policy allowing only SES `PutObject`).
- **SNS** topics `selfinbox-ses-inbound` and `selfinbox-ses-bounce` (+ HTTPS subscriptions when run from a public `APP_URL`).
- **IAM** user `selfinbox-app` with a least-privilege inline policy (SES send/verify, S3 get/put on the one bucket) — this is the key the app runs with.
- **SES** receipt rule set `selfinbox-default` + rule `selfinbox-inbound` (S3 + SNS actions), set active.

See [`AWS_SETUP.md`](AWS_SETUP.md) for the full walkthrough and the operator-vs-app privilege split.

## Data model

`initDb()` ([db.ts](../apps/api/src/db.ts)) creates the schema on boot (idempotent):

| Table | Holds |
|---|---|
| `users` | accounts, `token_version`, suspension state |
| `domains` | verified domains (`UNIQUE(domain)`), SES tokens |
| `dns_records` | generated MX/SPF/DKIM/DMARC + verified flag |
| `email_addresses` | per-domain addresses, catch-all, forwarding (double-opt-in) |
| `emails` | sent + received (`UNIQUE(ses_message_id, address)`), S3 key, attachment metadata (JSONB) |
| `smtp_credentials` | per-domain SMTP secret (encrypted) |
| `bounce_events` | bounce + complaint audit log |
| `email_tokens` / `forwarding_tokens` | hashed verification / confirmation tokens |
