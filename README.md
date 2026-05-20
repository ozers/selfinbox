<h1 align="center">
  <a href="https://github.com/ozers/selfinbox">
    Selfinbox
  </a>
</h1>

<p align="center">
  <strong>Run your own email service on AWS in an afternoon</strong><br>
  <sub>Send and receive mail at any number of <code>you@yourdomain.com</code> addresses — with a web inbox, per-domain SMTP credentials, and automatic DKIM/SPF/DMARC</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-23-339933.svg" alt="Node 23"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6.svg" alt="TypeScript"></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/Postgres-16-336791.svg" alt="Postgres"></a>
  <a href="https://aws.amazon.com/ses/"><img src="https://img.shields.io/badge/AWS-SES%20%2B%20S3-FF9900.svg" alt="AWS SES"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-ready-2496ED.svg" alt="Docker ready"></a>
</p>

<p align="center">
  <a href="https://selfinbox.ozersubasi.com">🌐 Landing Page</a> •
  <a href="#quick-start">🚀 Quick Start</a> •
  <a href="#features">✨ Features</a> •
  <a href="docs/SELF_HOSTING.md">📖 Self-Hosting</a> •
  <a href="docs/DEPLOY.md">📦 Deploy</a> •
  <a href="docs/AWS_SETUP.md">☁️ AWS Setup</a>
</p>

---

## What is this

A thin, open-source app on top of **AWS SES**. SES handles the hard parts (delivery, reputation, DKIM signing); Selfinbox gives you the UI, multi-domain plumbing, Postgres state, and a one-shot script that wires it all together.

The privacy of self-hosting — your data, your DB, your domain — without running an MTA.

Use it for:

- Custom-domain inboxes for personal projects (`hello@mysidehustle.com`)
- App transactional email with per-app SMTP credentials
- Family / small-team shared infra — one deploy, many users, many domains
- Forwarding-only setups (`*@yourdomain.com` → your real inbox)

> 🏭 Used in production · 🧩 Single-process deploy · 🪶 No queue, no Redis

## Features

- **Receive** — SES → S3 → SNS webhook, parsed and stored. Per-address forwarding and per-domain catch-all.
- **Send** — compose from the web inbox or via per-domain SMTP credentials (Gmail "Send as", Apple Mail, Thunderbird guides included).
- **Auto DNS** — generates MX / SPF / DKIM / DMARC per domain, polls until verified. Optional one-click Cloudflare provisioning.
- **Dashboard** — unread counts, 14-day sparklines, recent activity, pending-verification banners.
- **Bounces & complaints** — wired to SES notifications; hard bounces auto-deactivate addresses.
- **Multi-tenant** — users, domains, addresses, catch-alls isolated by `user_id`.
- **Single process** — one Node server, Postgres, AWS. No queue, no Redis.

## Quick start

Docker + AWS account:

```bash
git clone https://github.com/ozers/selfinbox && cd selfinbox
cp .env.example apps/api/.env
./scripts/setup-aws.sh
docker compose up --build -d
docker compose run --rm app node scripts/create-user.mjs
```

Open <http://localhost:3001> → add a domain in the dashboard → paste the generated DNS records at your registrar → done.

Manual / Node 23:

```bash
git clone https://github.com/ozers/selfinbox && cd selfinbox
npm run init        # bootstraps .env + installs both apps
npm run aws:setup   # provisions S3 + SNS + IAM + SES rule set
npm run create-user
```

Full walkthrough with prerequisites, sandbox notes, and DNS verification: **[`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md)**.

## Architecture

```
┌────────────┐    ┌──────────────────┐    ┌───────────────┐
│ React SPA  │───▶│ Hono API (Node)  │───▶│  Postgres     │
└────────────┘    └────────┬─────────┘    └───────────────┘
                           │ AWS SDK
                           ▼
              ┌────────────────────────────┐
              │ SES (send + receive)       │
              │ S3  (inbound raw email)    │
              │ SNS (inbound + bounces)    │
              └────────────────────────────┘
```

- `apps/api` — Hono server (Node 23), serves API + built frontend
- `apps/web` — React SPA (Vite, Tailwind v4, React Router)
- `scripts/setup-aws.sh` — idempotent AWS provisioner (S3 + SNS + IAM + SES rule set)

## Integrations

- **SMTP** — per-domain credentials for any app (Gmail "Send as", Apple Mail, Thunderbird).
- **Cloudflare** — one-click DNS record provisioning via OAuth or API token.
- **Webhooks** — incoming mail and bounce notifications via SNS.

## Contributors

<a href="https://github.com/ozers/selfinbox/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ozers/selfinbox" alt="Contributors" />
</a>

## Star History

<a href="https://star-history.com/#ozers/selfinbox&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ozers/selfinbox&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ozers/selfinbox&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ozers/selfinbox&type=Date" />
  </picture>
</a>

## Contributing

Issues and PRs welcome. Open an issue first for bigger changes so we can discuss the approach. The project deliberately stays small — if your feature needs a queue / background worker / new infra dependency, let's talk first.

## License

MIT — see [LICENSE](LICENSE).
