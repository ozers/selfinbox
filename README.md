# Selfinbox

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-23-339933.svg)](https://nodejs.org/)
[![AWS SES](https://img.shields.io/badge/AWS-SES%20%2B%20S3-FF9900.svg)](https://aws.amazon.com/ses/)

**Run your own email service on AWS in an afternoon.** Send and receive mail at any number of `you@yourdomain.com` addresses, with a web inbox, per-domain SMTP credentials, and automatic DKIM/SPF/DMARC.

It's a thin app on top of AWS SES. SES does the hard part (delivery, reputation, DKIM signing); Selfinbox gives you the UI, the multi-domain plumbing, the Postgres state, and a one-shot script to wire all of it together.

> Battle-tested in production. Single-process deploy (one Node server serves both the API and the SPA). ~7K lines of TypeScript across `apps/api` (1.6K) and `apps/web` (5.5K). MIT.

---

## Why this exists

Self-hosting email is famously painful — Postfix configs, IP reputation, blocklists, daily ops. **Selfinbox sidesteps all of that** by leaning on SES for the SMTP/MX layer. You get the privacy of self-hosting (your data, your DB, your domain) without running an MTA.

Use it for:
- Custom-domain inboxes for personal projects (`hello@mysidehustle.com`)
- App transactional email with per-app SMTP credentials
- Family / small-team shared infra — one deploy, many users, many domains
- Forwarding-only setups (`*@yourdomain.com` → your real inbox)

What it's **not**: a hosted SaaS, a Postfix replacement, an enterprise mail server. If you want to abandon AWS entirely, look at [Mailcow](https://mailcow.email) or [Stalwart](https://stalw.art).

## Features

- **Receive** — SES drops raw mail into S3 → SNS webhook → parsed and stored. Per-address forwarding to a personal inbox. Per-domain catch-all (`*@yourdomain.com`) with a one-click toggle.
- **Send** — from the web inbox (compose, reply, forward) or via per-domain SMTP credentials your apps embed (Gmail "Send as" + Apple Mail + Thunderbird setup guides included).
- **Auto DNS** — generates MX/SPF/DKIM/DMARC records per domain, polls until verified. Optional one-click Cloudflare provisioning via OAuth or API token.
- **Dashboard** — at-a-glance counts (domains, addresses, sent/received this month) with 14-day sparklines and trend deltas, recent activity feed (inbound/outbound color-coded), pending-verification banner.
- **Bounces & complaints** — SES notifications wired to webhooks; hard bounces auto-deactivate addresses, complaints suspend accounts.
- **Multi-tenant** — users, domains, addresses, catch-alls all isolated by `user_id`. Public registration off by default — `REGISTRATION_ENABLED` env flag is the entire user-management surface.
- **Single process** — one Node server, Postgres, AWS. No queue, no Redis, no separate web service.

## What you'll use

The web UI is a five-page SPA. Once you're set up:

- **Dashboard** — personalized overview: unread count, active vs pending domains, sent/received counts with sparklines, recent activity, and a pending-verification banner that surfaces domains stuck on DNS.
- **Inbox** — list of all messages (filterable by direction, read/unread, domain, address, search). Click a row to open the email; reply / forward / view raw headers / delete from the detail page. Floating compose panel for new outbound mail.
- **Domains** — list view + per-domain detail. Domain detail shows DNS records as a copy-friendly table with verification status, an addresses list (add, delete, set forwarding target, display name), a catch-all toggle, the SMTP credentials sub-page, and a Recheck-DNS button.
- **Setup wizard** — guided 5-step flow for adding a new domain end-to-end: enter domain → add DNS records (with Cloudflare auto-button if configured) → verify → first address → done.
- **SMTP credentials** — per-domain server / port / username / password, with copy buttons and step-by-step setup guides for Gmail "Send as", Apple Mail, and Thunderbird.

## Architecture

```
┌────────────┐    ┌──────────────────┐    ┌───────────────┐
│ React SPA  │───▶│ Hono API (Node)  │───▶│  Postgres     │
└────────────┘    └────────┬─────────┘    └───────────────┘
                           │
                           │ AWS SDK
                           ▼
              ┌────────────────────────────┐
              │ SES (send + receive)       │
              │ S3  (inbound raw email)    │
              │ SNS (inbound + bounces)    │
              └────────────┬───────────────┘
                           │ HTTPS POST
                           ▼
              /api/webhooks/ses/inbound
              /api/webhooks/ses/bounce
```

- `apps/api` — Hono server (Node 23), talks to Postgres + AWS, also serves the built frontend
- `apps/web` — React SPA (Vite, Tailwind v4, React Router)
- `scripts/setup-aws.sh` — idempotent provisioner: S3 + SNS topics + IAM user + SES rule set

## Getting started

> **End state** — a running web inbox at `http://localhost:5173`, your first custom-domain address (e.g. `hello@yourdomain.com`) sending and receiving real mail through your own AWS account.
>
> **Time** — ~45 min the first time (mostly DNS propagation), ~5 min per additional domain after that.

### Prerequisites

| What | Why | Check |
|---|---|---|
| **Node 23** | API + Vite build | `node -v` |
| **AWS CLI v2**, configured | provisioner script + domain verification | `aws sts get-caller-identity` |
| **`jq`** | provisioner parses AWS responses | `jq --version` |
| **Postgres database** | app state. [Neon](https://neon.tech) / [Supabase](https://supabase.com) / local — anything | `psql --version` if local |
| **A domain you own** | with DNS you can edit at any registrar | — |

> **About the SES sandbox.** New AWS accounts start in the SES sandbox, which only restricts *sending* — receiving works either way. **Stay in sandbox** is fine for forwarding-only setups or sending to a known list of recipients (verify each once with `aws ses verify-email-identity`, 200/day cap). **Leave sandbox** is needed for arbitrary outbound (request production access in the SES console, takes a few hours). Full breakdown: [`docs/AWS_SETUP.md`](docs/AWS_SETUP.md#3-choose-stay-in-the-ses-sandbox-or-leave-it).

### TL;DR — copy / paste

If your prereqs are in place, the whole local setup is this block:

```bash
git clone https://github.com/ozers/selfinbox && cd selfinbox

# 1. Install
(cd apps/api && npm install) && (cd apps/web && npm install)

# 2. Configure (edit DATABASE_URL, JWT_SECRET, FROM_EMAIL, AWS_REGION)
cp .env.example apps/api/.env && $EDITOR apps/api/.env

# 3. Provision AWS resources (idempotent — S3 + SNS + IAM + SES rule)
APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
#    paste the printed AWS_ACCESS_KEY_ID / SECRET into apps/api/.env

# 4. Verify your sender domain in SES, add the printed DNS records
aws ses verify-domain-identity --domain yourdomain.com
aws ses verify-domain-dkim     --domain yourdomain.com

# 5. Run (set REGISTRATION_ENABLED=true once to register, then back to false)
(cd apps/api && npm run dev) &
(cd apps/web && npm run dev)
```

Then open <http://localhost:5173> → register → add a domain in the dashboard → paste the four generated DNS records at your registrar → wait for verification.

Walkthrough below if you want what each step actually does.

---

### Step by step

#### 1. Clone and install

```bash
git clone https://github.com/ozers/selfinbox
cd selfinbox
(cd apps/api && npm install)
(cd apps/web && npm install)
```

#### 2. Configure your environment

```bash
cp .env.example apps/api/.env
$EDITOR apps/api/.env
```

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Postgres connection string. Schema auto-creates on first boot. SSL auto-enables for any non-localhost host — see provider examples in [`.env.example`](.env.example) (Neon / Supabase / Railway / RDS all work as-is). |
| `JWT_SECRET` | 32+ random chars. Generate: `openssl rand -base64 48` |
| `FROM_EMAIL` | The address system mail (verify, password reset) sends from. Must be on a domain you'll verify in SES. |
| `AWS_REGION` | `eu-west-1`, `us-east-1`, or `us-west-2` (SES inbound regions). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Leave blank — step 3 prints fresh ones. |

Full annotated list: [`.env.example`](.env.example).

#### 3. Provision AWS resources

```bash
APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
```

The script is idempotent — re-running skips anything that exists. It creates:

- S3 bucket for inbound raw mail (with bucket policy letting SES `PutObject`)
- Two SNS topics: inbound + bounce/complaint
- IAM user with a least-privilege inline policy
- SES receipt rule set with a wildcard recipient rule

**Last line of output** prints fresh `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` — paste them into `apps/api/.env`.

#### 4. Verify your sender domain in SES

```bash
aws ses verify-domain-identity --domain yourdomain.com
aws ses verify-domain-dkim     --domain yourdomain.com
```

Both commands print DNS records — one TXT (verification) and three CNAMEs (DKIM). Add them at your registrar. SES flips the identity to verified within a few minutes once DNS resolves.

#### 5. Boot the app

```bash
# Temporarily allow registration so you can sign yourself up
sed -i '' 's/REGISTRATION_ENABLED=.*/REGISTRATION_ENABLED=true/' apps/api/.env

(cd apps/api && npm run dev) &     # API on :3001
(cd apps/web && npm run dev)       # SPA on :5173
```

Open <http://localhost:5173>, click **Register**, create your account.

Then **set `REGISTRATION_ENABLED=false` and restart the API** — that's your auth wall. (See [Creating users](#creating-users) for inviting more people later.)

#### 6. Add a domain in the dashboard

Click **Add Domain**, enter the domain you verified in step 4. Selfinbox generates four DNS records (MX, SPF, three DKIM CNAMEs, DMARC) and shows them in a copy-friendly table. Paste them at your registrar — or click the **Cloudflare auto-button** if you use Cloudflare and set `CLOUDFLARE_API_TOKEN`.

DNS propagation takes a few minutes (sometimes more, depending on your TTL). The dashboard polls in the background and flips the badge to **Active** when all records resolve.

#### 7. Send your first email, receive your first email

- **Outbound** — open the inbox → **Compose** → send to a recipient. In sandbox: must be a verified address. Out of sandbox: anyone.
- **Inbound** — send a message from any external mailbox to `you@yourdomain.com`. It appears in the inbox within seconds.

Done. From here:

- Add more addresses on the domain detail page
- Enable catch-all (`*@yourdomain.com`) with the toggle on the domain detail page
- Grab per-domain SMTP credentials for plugging into your apps' transactional mail
- Forward each address to a personal inbox if you'd rather read mail in Gmail/Apple Mail

### Going to production

Local dev runs the same way as production, but you'll need a real public URL — AWS SNS posts inbound mail webhooks to `/api/webhooks/ses/inbound` and that endpoint has to be reachable over public HTTPS. See [`docs/DEPLOY.md`](docs/DEPLOY.md) for Railway / Docker / VPS recipes and [`docs/AWS_SETUP.md`](docs/AWS_SETUP.md) for the full AWS walkthrough (receipt rules, SNS subscription confirmation, region notes).

## Configuration

All config is environment variables. See [`.env.example`](.env.example) for the annotated list. Minimum to boot:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Any Postgres. Schema auto-creates on boot. |
| `JWT_SECRET` | yes | 32+ random chars. `openssl rand -base64 48` |
| `APP_URL` | yes | Public URL. Used for OAuth + email verification links. |
| `FROM_EMAIL` | yes | SES-verified sender for system mail (verify, password reset). |
| `AWS_REGION` | yes | Region where SES is configured. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes | IAM user from `setup-aws.sh`. |
| `S3_INBOUND_BUCKET` | yes | Default `selfinbox-inbound`. |
| `REGISTRATION_ENABLED` | no | Default `false`. Set `true` to allow signups. |
| `WEB_ORIGIN` | no | CORS allow-list for the SPA, comma-separated. Only needed if SPA and API are on different origins. |
| `CLOUDFLARE_API_TOKEN` *or* `CLOUDFLARE_CLIENT_ID/SECRET` | no | Enables one-click Cloudflare DNS setup. |
| `VITE_BRAND_NAME`, `VITE_SUPPORT_EMAIL` | no | Rebrand the UI without touching code. |

## Creating users

Selfinbox is multi-user — one deploy can serve many people, each with their own domains and addresses. By default `REGISTRATION_ENABLED=false`, so the public sign-up form 403s.

**Why is there auth on a self-hosted app?** Because the API has to be publicly reachable: AWS SNS posts inbound mail webhooks to `/api/webhooks/ses/inbound`, which only works over public HTTPS. You can't hide the deploy behind Tailscale or a LAN-only IP. Auth is what keeps the inbox yours.

To create the first account (or invite someone later):

```bash
# 1. Set REGISTRATION_ENABLED=true and restart the API
# 2. Visit /register, sign up
# 3. Set REGISTRATION_ENABLED=false and restart again
```

If you're the only user, leave `REGISTRATION_ENABLED=false` after step 3 and you're done. Want to add another person? Flip it briefly, have them register, flip it back. There's no admin UI — the env-var toggle is the auth wall.

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

- **SES sending**: $0.10 per 1,000 emails sent
- **SES receiving**: first 1,000/month free, then $0.10 per 1,000
- **S3 storage** for inbound raw email: a few cents per GB-month
- **SNS notifications**: free tier covers most personal use
- **Compute**: depends on host (Railway free tier or a $5 VPS handles thousands of users)

A single-user deploy with a few hundred emails/month typically runs **under $1/month** all-in.

## What's intentionally not included

- **Billing / quotas** — no plan tiers, no per-user limits. The dashboard just shows month-to-date sent and received counts. If you want to monetize, add your own paywall in front and set quotas at the route layer.
- **Background jobs / queues** — DNS verification runs on a simple poller; bounce/inbound webhooks are handled inline. Fine up to thousands of domains, then you'd want a proper queue.
- **Multi-region** — single SES region only.
- **Outbound IP warmup** — SES handles its own reputation pool. If you need dedicated IPs, configure them in SES directly.
- **Admin UI** — `REGISTRATION_ENABLED` env flag is the entire user-management surface. By design.
- **Rate limiting** — auth endpoints (`/login`, `/register`, `/forgot-password`) have no built-in throttle. If you expose the deploy publicly, put it behind a rate limiter — Cloudflare's free tier, [`hono-rate-limiter`](https://github.com/rhinobase/hono-rate-limiter), or an nginx/Caddy `limit_req` directive all work.

## Brand / fork notes

- The UI reads `VITE_BRAND_NAME` and `VITE_SUPPORT_EMAIL` at build time — set them to make it yours without touching code. The dashboard, auth pages, page title, and footer all pick them up.
- The landing page (`apps/web/src/pages/landing.tsx`) is generic — replace it or strip the `/` route in `App.tsx` if you don't want a public-facing front page on your deploy.
- Internal identifiers in the codebase (`@morelay/api` npm scope, `morelay-token` localStorage key, `morelay` package name) are leftovers from the project's previous name. Renaming them is cosmetic and would invalidate existing sessions on a running deploy — left as-is intentionally.

## Development

```bash
# API
cd apps/api
npm run dev      # tsx watch
npm run build    # tsc → dist/
npm start        # node dist/

# Web
cd apps/web
npm run dev      # vite
npm run build    # tsc -b && vite build
```

The production build serves `apps/web/dist` from the Hono API as static files (see `railway.toml`'s build command for the exact incantation).

## Contributing

PRs welcome. Keep it small, keep it focused. The project deliberately stays under ~3K LoC; if your feature needs a queue / background worker / new infra dependency, open an issue first to discuss.

## License

MIT — see [LICENSE](LICENSE).
