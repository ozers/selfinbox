# Self-hosting

End state — a running web inbox, your first custom-domain address (e.g. `hello@yourdomain.com`) sending and receiving real mail through your own AWS account.

Time — ~45 min the first time (mostly DNS propagation), ~5 min per additional domain after that.

## Prerequisites

| What | Why | Check |
|---|---|---|
| **Node 22+** | API + Vite build (not needed if you use Docker) | `node -v` |
| **AWS CLI v2**, configured | provisioner script + domain verification | `aws sts get-caller-identity` |
| **`jq`** | provisioner parses AWS responses | `jq --version` |
| **Postgres** | app state. [Neon](https://neon.tech), [Supabase](https://supabase.com), Railway plugin, RDS, or local — any Postgres works (SSL is auto-detected) | `psql --version` if local |
| **A domain you own** | with DNS you can edit at any registrar | — |

> ⚠️ **Use an IAM operator user, not the account root.** Root has unrestricted access and shouldn't be used for programmatic work — `setup-aws.sh` refuses to run as root. Create a dedicated user to run the provisioner with, and grant it either:
> - **`AdministratorAccess`** (simple), or
> - the **least-privilege provisioner policy** in [`docs/iam-provisioner-policy.json`](iam-provisioner-policy.json) — only the S3/SNS/IAM/SES/STS actions the script calls, scoped by resource (**recommended**).
>
> Full step-by-step (create user → attach policy → access key → `aws configure`) is in [`AWS_SETUP.md` → Two users, two privilege levels](AWS_SETUP.md#two-users-two-privilege-levels). This operator user is separate from the least-privilege `selfinbox-app` user the script creates for the app itself.

> **SES sandbox** — new AWS accounts start in the SES sandbox, which only restricts *sending* (receiving works either way). Stay in sandbox for forwarding-only or known-recipient setups (verify each with `aws ses verify-email-identity`, 200/day cap). Leave sandbox for arbitrary outbound. Full breakdown in [`AWS_SETUP.md`](AWS_SETUP.md#3-choose-stay-in-the-ses-sandbox-or-leave-it).

## TL;DR — Docker

If you have Docker and an AWS account, this is the shortest path:

```bash
git clone https://github.com/ozers/selfinbox && cd selfinbox

# 1. Bootstrap .env + JWT_SECRET (no Node/npm needed on the host — just aws + jq)
./scripts/init.sh --env-only
$EDITOR apps/api/.env   # set FROM_EMAIL. DATABASE_URL is the bundled compose Postgres;
                        # AWS_REGION + bucket are written by setup-aws.sh in step 2.

# 2. Provision AWS (needs aws cli + jq)
APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
#    ↑ writes AWS_ACCESS_KEY_ID / SECRET directly into apps/api/.env

# 3. Boot (builds the image, starts app + postgres)
docker compose up --build -d

# 4. Create your account
docker compose run --rm app node scripts/create-user.mjs
```

Open <http://localhost:3001>. Add a domain in the dashboard → paste the generated DNS records at your registrar → done. SES domain verification (step 4 of the Node walkthrough below) still needs the AWS CLI.

## TL;DR — Node (manual)

```bash
git clone https://github.com/ozers/selfinbox && cd selfinbox

# 1. Bootstrap: copies .env.example → .env, generates JWT_SECRET,
#    runs npm install in both apps. Idempotent.
npm run init

# 2. Fill in DATABASE_URL, FROM_EMAIL, AWS_REGION in apps/api/.env
$EDITOR apps/api/.env

# 3. Provision AWS resources (idempotent — S3 + SNS + IAM + SES rule)
APP_URL=http://localhost:3001 npm run aws:setup

# 4. Verify your sender domain in SES, add the printed DNS records
aws ses verify-domain-identity --domain yourdomain.com
aws ses verify-domain-dkim     --domain yourdomain.com

# 5. Create your account
npm run create-user

# 6. Boot
(cd apps/api && npm run dev) &
(cd apps/web && npm run dev)
```

Open <http://localhost:5173> → add a domain in the dashboard → paste the four generated DNS records at your registrar → wait for verification.

## Step by step

### 1. Clone and bootstrap

```bash
git clone https://github.com/ozers/selfinbox
cd selfinbox
npm run init
```

`npm run init` runs [`scripts/init.sh`](../scripts/init.sh), which:

- Checks the prereqs are on your `PATH` (warn-only, doesn't block)
- Copies `.env.example` → `apps/api/.env` (only if it doesn't already exist)
- Generates a fresh 48-byte `JWT_SECRET`
- Runs `npm install` in both `apps/api` and `apps/web`

It's idempotent — safe to re-run.

### 2. Fill in your config

Open `apps/api/.env`. The minimum to provide:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Postgres connection string. Schema auto-creates on first boot. SSL auto-enables for any non-localhost host — see provider examples in [`.env.example`](../.env.example). |
| `FROM_EMAIL` | The address system mail (verify, password reset) sends from. Must be on a domain you'll verify in SES. |
| `AWS_REGION` | `eu-west-1`, `us-east-1`, or `us-west-2` (SES inbound regions). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Leave blank — step 3 writes fresh ones into `.env` for you. |

`JWT_SECRET` was generated for you in step 1. Full annotated env list: [`.env.example`](../.env.example).

### 3. Provision AWS resources

```bash
APP_URL=http://localhost:3001 npm run aws:setup
```

The script is idempotent — re-running skips anything that exists. It creates:

- S3 bucket for inbound raw mail (with bucket policy letting SES `PutObject`)
- Two SNS topics: inbound + bounce/complaint
- IAM user with a least-privilege inline policy
- SES receipt rule set with a wildcard recipient rule

The script **writes `AWS_REGION`, `S3_INBOUND_BUCKET`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` straight into `apps/api/.env`** for you. (The key is printed to the terminal only if `.env` is missing.) Run it as an IAM user, not root — see [`AWS_SETUP.md`](AWS_SETUP.md#two-users-two-privilege-levels).

### 4. Verify your sender domain in SES

> **You can usually skip this step.** Adding a domain in the dashboard (step 7)
> already calls SES to create the identity + DKIM and shows you the exact DNS
> records to paste — that's the easy path. Only run the CLI commands below if you
> want to verify your `FROM_EMAIL` domain *before* booting (e.g. so system mail
> works on first run). Verifying the same domain twice is harmless — SES is
> idempotent.

```bash
# --region MUST match the AWS_REGION you provisioned (eu-west-1 by default),
# otherwise SES verifies the identity in the wrong region and inbound won't work.
aws ses verify-domain-identity --domain yourdomain.com --region eu-west-1
aws ses verify-domain-dkim     --domain yourdomain.com --region eu-west-1
```

Both commands print DNS records — one TXT (verification) and **three** CNAMEs (DKIM). Add **all of them** at your registrar. SES flips the identity to verified within a few minutes once DNS resolves.

### 5. Create your account

```bash
npm run create-user
```

Prompts for name, email, and password. Writes directly to the database — no `REGISTRATION_ENABLED` toggle needed. The created account is email-verified automatically.

To invite someone later: `npm run create-user -- --email they@example.com --name "Their Name" --password secret`.

### 6. Boot the app

```bash
(cd apps/api && npm run dev) &     # API on :3001
(cd apps/web && npm run dev)       # SPA on :5173
```

Open <http://localhost:5173> and log in.

### 7. Add a domain in the dashboard

Click **Add Domain**, enter the domain you verified in step 4. Selfinbox generates four DNS records (MX, SPF, three DKIM CNAMEs, DMARC). Paste them at your registrar — or click the **Cloudflare auto-button** if you use Cloudflare and set `CLOUDFLARE_API_TOKEN`.

DNS propagation takes a few minutes. The dashboard polls in the background and flips the badge to **Active** when all records resolve.

### 8. Send + receive

- **Outbound** — open the inbox → **Compose** → send. Works on `localhost`.
  While your AWS account is in the **SES sandbox** you can only send to
  *verified* recipient addresses. To verify one:
  ```bash
  aws ses verify-email-identity --email-address you@gmail.com --region eu-west-1
  ```
  AWS emails that address a confirmation link — click it, then sends to it go
  through. (If you send to an unverified address you'll get a clear *"Recipient
  address isn't verified…"* error.) To send to *anyone* without per-address
  verification, request production access (Console → SES → Account dashboard).
- **Inbound** — send a message from any external mailbox to `you@yourdomain.com`. It appears in the inbox within seconds — **once the API is reachable at a public HTTPS URL**. Inbound does *not* work against `localhost`: AWS SNS delivers received mail to `/api/webhooks/ses/inbound`, which it can only reach over public HTTPS. Outbound + the UI work locally; for inbound, deploy first (see [Going to production](#going-to-production)) and re-run `setup-aws.sh` from the public URL to wire SNS.

From here: add more addresses, enable catch-all (`*@yourdomain.com`), grab per-domain SMTP credentials for your apps, or forward to a personal inbox.

## Going to production

Local dev runs the same way as production, but you'll need a real public URL — AWS SNS posts inbound mail webhooks to `/api/webhooks/ses/inbound` and that endpoint has to be reachable over public HTTPS. See [`DEPLOY.md`](DEPLOY.md) for Railway / Docker / VPS recipes and [`AWS_SETUP.md`](AWS_SETUP.md) for the full AWS walkthrough.

## Troubleshooting

Real issues you're likely to hit, and the fix. (These are the exact snags from a clean end-to-end install.)

### Domain stuck on "Pending" / DKIM never verifies

The badge stays **Pending** until SES sees *all* the records. The usual cause is a missing or mistyped record:

- **You must add all three DKIM CNAMEs.** Missing even one keeps DKIM `Pending` forever. Re-check what's actually live:
  ```bash
  # domain ownership token (should return the SES value)
  dig +short TXT _amazonses.yourdomain.com
  # each DKIM CNAME (run for all three tokens shown in the dashboard)
  dig +short CNAME <token>._domainkey.yourdomain.com
  ```
- **CNAME values must not have a trailing dot added by you** — paste exactly what the dashboard shows (`<token>.dkim.amazonses.com`).
- SES re-checks on its own schedule; after the records resolve it can take a few minutes to flip to **Success**. It is not instant.

### "Two SPF records" / "two DMARC records" — duplicate-record conflicts

If your domain was **previously locked down for no email** (parked domains often ship with `v=spf1 -all` and `_dmarc` `p=reject`), pasting Selfinbox's records creates a **second** SPF/DMARC record. That's invalid — a domain may have only **one** TXT SPF record and **one** `_dmarc` record. Mail providers will hit a permerror.

```bash
dig +short TXT yourdomain.com           # should show ONE v=spf1 line
dig +short TXT _dmarc.yourdomain.com     # should show ONE v=DMARC1 line
```

Delete the old record and keep Selfinbox's (`v=spf1 include:amazonses.com ~all` and the generated `v=DMARC1 …`). If you genuinely need both your old SPF rules and SES, **merge** them into one line (e.g. `v=spf1 include:amazonses.com include:your-old-provider.com ~all`) rather than keeping two records.

### "Recipient address isn't verified" when sending

You're in the **SES sandbox** (every new AWS account is). Sandbox only allows sending to verified recipients. Either verify the recipient once:

```bash
aws ses verify-email-identity --email-address them@example.com --region eu-west-1
# → AWS emails them a confirmation link; after they click it, sends succeed
```

…or request production access (Console → SES → Account dashboard → *Request production access*) to send to anyone. Receiving is unaffected by the sandbox.

### Inbound mail never arrives (but outbound works)

Expected on `localhost`. AWS SNS can only deliver inbound webhooks to a **public HTTPS** URL, so received mail can't reach `http://localhost`. Outbound and the whole UI work locally; inbound only works once the app is deployed at a public HTTPS URL **and** you've re-run `setup-aws.sh` from that URL (it subscribes SNS to your webhooks then — on `localhost` it deliberately skips the subscription).

To test inbound *before* deploying, expose the local app with a tunnel (`cloudflared tunnel --url http://localhost:3001` or `ngrok http 3001`), then re-run `APP_URL=https://<your-tunnel> ./scripts/setup-aws.sh`. The app auto-confirms the SNS subscription; send a message to your address and it lands in the inbox. Note a tunnel exposes your running app publicly — only do this on a trusted network and tear it down afterward.

### `setup-aws.sh` fails

- **`Missing: aws` / `Missing: jq`** — install both; the script needs them.
- **Refuses to run as root** — by design. Run it as an IAM user with the provisioner policy (see the warning at the top of this doc).
- **`AccessDenied` on an IAM/S3/SES action** — your operator user is missing that permission. Attach `AdministratorAccess` or the [least-privilege provisioner policy](iam-provisioner-policy.json).

## Configuration

All config is environment variables. See [`.env.example`](../.env.example) for the annotated list. Minimum to boot:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Any Postgres. SSL auto-enables for non-localhost hosts. Schema auto-creates on boot. |
| `JWT_SECRET` | yes | 32+ random chars. `openssl rand -base64 48` |
| `APP_URL` | yes | Public URL. Used for OAuth + email verification links. |
| `FROM_EMAIL` | yes | SES-verified sender for system mail. |
| `AWS_REGION` | yes | Region where SES is configured. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes | IAM user from `setup-aws.sh`. |
| `S3_INBOUND_BUCKET` | yes | Default `selfinbox-inbound`. |
| `REGISTRATION_ENABLED` | no | Default `false`. Set `true` to allow public signups. |
| `WEB_ORIGIN` | no | CORS allow-list for the SPA. Only needed if SPA and API are on different origins. |
| `CLOUDFLARE_API_TOKEN` *or* `CLOUDFLARE_CLIENT_ID/SECRET` | no | Enables one-click Cloudflare DNS setup. |
| `VITE_BRAND_NAME`, `VITE_SUPPORT_EMAIL` | no | Rebrand the UI without touching code. |
| `ATTACHMENT_MAX_COUNT` | no | Max attachments per inbound email. Default `20`. |
| `ATTACHMENT_MAX_SIZE_MB` | no | Per-attachment cap. Default `25`. |
| `ATTACHMENT_MAX_TOTAL_MB` | no | Total-per-email cap. Default `40`. |
| `ATTACHMENT_EXT_BLOCKLIST` | no | Comma-separated extension blocklist (dot optional). Defaults to a built-in list of executable / script extensions. Blocked attachments are stored but quarantined — the recipient sees a warning and must explicitly confirm before downloading. |
| `CLAMAV_HOST` / `CLAMAV_PORT` | no | If set, every attachment is streamed to clamd via INSTREAM. Hits are quarantined. Default port `3310`. Leave unset to disable. |
| `CLAMAV_TIMEOUT_MS` | no | clamd connection / scan timeout. Default `10000`. |

## Attachment security

Selfinbox treats inbound attachments as hostile by default. Every inbound attachment is:

1. **Size + count capped** — see env vars above. Oversize items are dropped before they touch S3.
2. **Filename sanitized** — path separators, control characters, RTL bidi overrides (the `cod.exe → coexe.doc` trick), and leading dots are stripped. Filenames are stored in DB metadata only — never in S3 object keys.
3. **Magic-byte sniffed** — the actual MIME type is detected from the file contents (via [`file-type`](https://www.npmjs.com/package/file-type)). If the sender's declared type disagrees with the sniffed type at the family level (e.g. claims `image/png` but is actually `text/html`), the attachment is **quarantined**.
4. **Active-content blocked** — anything detected as `text/html`, `image/svg+xml`, JavaScript, or XHTML is quarantined regardless of declared type.
5. **Extension-blocklisted** — executables and script formats (`.exe`, `.bat`, `.vbs`, `.ps1`, `.lnk`, `.iso`, `.jar`, …) are quarantined. Override the list with `ATTACHMENT_EXT_BLOCKLIST`.
6. **Optionally virus-scanned** — if you run a clamd daemon and set `CLAMAV_HOST`, every attachment is scanned before storage. Positive hits are quarantined and the email gets a red banner. clamd connection errors are logged and treated as fail-open (delivery continues); monitor your API logs if you rely on this layer.

Quarantined attachments are **not deleted** — they are still downloadable, but the UI shows a red `ShieldAlert` badge, an inline warning, and a confirm dialog before the bytes leave the server. This lets the recipient retrieve a legitimate file the heuristics flagged in error while making accidental clicks on real malware much harder.

On the **download path** (`GET /api/emails/:id/attachments/:idx`) the API sends:

- `Content-Disposition: attachment` by default (inline only allowed for verified image MIMEs, and never for quarantined items)
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'none'; sandbox; frame-ancestors 'none'`
- `Referrer-Policy: no-referrer`
- `Cache-Control: private, no-store`
- HTML / SVG / JS payloads are force-served as `text/plain` regardless of headers, so even a determined user can't render them in-browser
- RFC 6266 `filename*=UTF-8''…` encoding with an ASCII fallback for legacy clients

The email body itself is sanitized client-side with [DOMPurify](https://github.com/cure53/DOMPurify) before any HTML is rendered (scripts, iframes, inline event handlers, dangerous URL schemes stripped; all links rewritten to `target="_blank" rel="noopener noreferrer nofollow"`).

### Recommended: serve attachments from a separate origin

For maximum isolation, serve attachment downloads from a **different subdomain** (e.g. `attachments.yourdomain.com`) than your main app (`mail.yourdomain.com`). This way, even if some clever HTML payload escapes sanitization and gets rendered by the browser, it runs in a different origin and cannot read your session cookie or interact with the main app. The same-site default in modern browsers helps, but a separate eTLD+1 is the only true isolation. This is optional — the headers above already make exploitation hard — but recommended if you're storing sensitive mail.

To do this: deploy the API once, then put your CDN / load balancer in front of it with two hostnames, sending `attachments.*` to the same upstream. No code changes needed.

## Creating users

Selfinbox is multi-user — one deploy can serve many people, each with their own domains and addresses. By default `REGISTRATION_ENABLED=false`, so the public sign-up form 403s.

**Why is there auth on a self-hosted app?** Because the API has to be publicly reachable: AWS SNS posts inbound mail webhooks to `/api/webhooks/ses/inbound`, which only works over public HTTPS. You can't hide the deploy behind Tailscale or a LAN-only IP. Auth is what keeps the inbox yours.

To create accounts:

```bash
npm run create-user
# or with flags: npm run create-user -- --email they@example.com --name "Their Name" --password secret
```

Connects directly to your database — no server running, no `REGISTRATION_ENABLED` flip needed. The account is created email-verified.

If you want anyone to self-register via the web UI, set `REGISTRATION_ENABLED=true`. Otherwise leave it `false` — the env-var toggle is the entire auth wall.

## Database schema

`initDb()` creates these tables on boot (idempotent — safe to re-run):

| Table | Purpose |
|---|---|
| `users` | Account credentials + suspension state |
| `domains` | Verified sender/recipient domains, SES identity tokens |
| `dns_records` | Generated MX/SPF/DKIM/DMARC records, with verification state |
| `email_addresses` | Per-domain addresses (incl. catch-all), forwarding targets |
| `emails` | All sent + received messages (body, S3 key, message id) |
| `smtp_credentials` | Per-domain SMTP user/pass for outbound apps |
| `bounce_events` | Audit log of SES bounce + complaint notifications |
| `email_tokens` | Verification + password-reset tokens (hashed) |

## Cost

You pay AWS directly. Rough numbers (eu-west-1, mid-2026):

- **SES sending** — $0.10 per 1,000 emails sent
- **SES receiving** — first 1,000/month free, then $0.10 per 1,000
- **S3 storage** for inbound raw email — a few cents per GB-month
- **SNS notifications** — free tier covers most personal use
- **Compute** — depends on host (Railway free tier or a $5 VPS handles thousands of users)

A single-user deploy with a few hundred emails/month typically runs **under $1/month** all-in.

## What's intentionally not included

- **Billing / quotas** — no plan tiers, no per-user limits. The dashboard just shows month-to-date sent and received counts. If you want to monetize, add your own paywall in front.
- **Background jobs / queues** — DNS verification runs on a simple poller; bounce/inbound webhooks are handled inline. Fine up to thousands of domains.
- **Multi-region** — single SES region only.
- **Outbound IP warmup** — SES handles its own reputation pool. If you need dedicated IPs, configure them in SES directly.
- **Admin UI** — `REGISTRATION_ENABLED` env flag is the entire user-management surface. By design.

## Security

- **Auth rate limiting** — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` are throttled per-IP via an in-memory sliding window (8 login attempts / 15 min, 5 password resets / hour, 3 resend-verifications / hour). Single-process only — if you scale to multiple API replicas, front them with Cloudflare or swap the limiter for Redis.
- **Recommended: Cloudflare in front** — DNS through Cloudflare with Bot Fight Mode enabled blocks automated scanners before they reach the API. Zero code change, free tier covers most personal use.

## Brand / fork notes

- The UI reads `VITE_BRAND_NAME` and `VITE_SUPPORT_EMAIL` at build time — set them to make it yours without touching code.
- Build modes via `VITE_MODE`: **`app`** (default, strict private), **`public`** (landing + app on one deploy), **`marketing`** (landing-only static). See [`DEPLOY.md`](DEPLOY.md#build-modes-vite_mode).
