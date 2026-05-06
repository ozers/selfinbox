# Selfinbox

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-23-339933.svg)](https://nodejs.org/)
[![AWS SES](https://img.shields.io/badge/AWS-SES%20%2B%20S3-FF9900.svg)](https://aws.amazon.com/ses/)

**Run your own email service on AWS in an afternoon.** Send and receive mail at any number of `you@yourdomain.com` addresses, with a web inbox, per-domain SMTP credentials, and automatic DKIM/SPF/DMARC.

It's a thin app on top of AWS SES. SES does the hard part (delivery, reputation, DKIM signing); Selfinbox gives you the UI, the multi-domain plumbing, the Postgres state, and a one-shot script to wire all of it together.

> Battle-tested in production. Single-binary deploy. ~3000 LoC. MIT.

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

- **Receive** — SES drops raw mail into S3 → SNS webhook → parsed and stored, optionally forwarded to a personal address
- **Send** — through SES from the web inbox, or via per-domain SMTP creds your apps embed
- **DNS** — generates MX/SPF/DKIM/DMARC records per domain, polls until verified, optional one-click Cloudflare auto-setup
- **Bounces & complaints** — SES notifications wired to webhooks; hard bounces deactivate addresses, complaints suspend accounts
- **Multi-tenant** — users, domains, addresses, catch-alls all isolated by user_id
- **Single process** — Hono API serves the React SPA from the same port. No separate web service, no queue, no Redis

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

## Quickstart

**Prerequisites:**
- Node 23
- A Postgres database (Neon / Supabase / Railway / RDS / local — anything)
- An AWS account with credentials in your shell (`aws sts get-caller-identity` works)
- `aws` CLI v2 and `jq` installed
- A domain whose DNS you control

```bash
git clone https://github.com/ozers/selfinbox
cd selfinbox

# 1. Install
(cd apps/api && npm install)
(cd apps/web && npm install)

# 2. Configure
cp .env.example apps/api/.env
$EDITOR apps/api/.env    # at minimum: DATABASE_URL, JWT_SECRET, FROM_EMAIL, AWS_*

# 3. Provision AWS (S3 + SNS + IAM, idempotent)
APP_URL=http://localhost:3001 ./scripts/setup-aws.sh

# 4. Verify a sender domain in SES (one-time per region)
aws ses verify-domain-identity --domain yourdomain.com
aws ses verify-domain-dkim     --domain yourdomain.com
# Add the printed records to your DNS, wait a few minutes.

# 5. Run
(cd apps/api && npm run dev) &     # API on :3001
(cd apps/web && npm run dev)       # SPA on :5173 (proxies API)
```

Open `http://localhost:5173`, register the first account (set `REGISTRATION_ENABLED=true` first), add a domain, paste the generated DNS records at your registrar, and you're live.

**One gotcha:** new AWS accounts start in the SES sandbox — you can only send to verified addresses, capped at 200/day. Request production access early: AWS Console → SES → Account dashboard → "Request production access". Approval takes a few hours.

For full AWS details (receipt rules, SNS subscriptions, sandbox notes) → [`docs/AWS_SETUP.md`](docs/AWS_SETUP.md).
For deploy options (Railway / Docker / VPS) → [`docs/DEPLOY.md`](docs/DEPLOY.md).

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

## Brand / fork notes

- The UI reads `VITE_BRAND_NAME` and `VITE_SUPPORT_EMAIL` at build time — set them to make it yours without touching code.
- The landing page (`apps/web/src/pages/landing.tsx`) is generic — replace it or strip the `/` route in `App.tsx` if you don't want a public-facing front page on your deploy.
- Internal identifiers (`@morelay/api` npm scope, `morelay-token` localStorage key) stayed as-is from the project's previous name. Renaming would invalidate existing sessions on running deploys; cosmetic only.

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
