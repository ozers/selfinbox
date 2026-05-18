# Deploy

The repo ships a `Dockerfile` at the root that any Docker-aware host (Railway, Fly, Render, your own VPS) can build from. Anywhere that runs the resulting image + can reach Postgres + has outbound HTTPS to AWS will work. The alternative `apps/api/railway.toml` and `apps/web/railway.toml` files are kept for users who prefer the older split-service nixpacks pattern (API and SPA on separate Railway services).

## Single-process model

In production, the API serves the built React SPA itself — there is no separate web service. Build steps:

```bash
# 1. Build the SPA
cd apps/web
VITE_API_URL='' npm install --legacy-peer-deps
npx vite build           # → apps/web/dist

# 2. Copy SPA into API's public/
cd ../api
cp -r ../web/dist ./public

# 3. Build + run API
npm install
npm run build            # → apps/api/dist
npm start                # serves API + SPA on $PORT
```

Set `PORT` (default 3001) and all the env vars from `.env.example`.

## Railway

Push to a Railway project linked to this repo — Railway auto-detects the root `Dockerfile` and builds from it (no `railway.toml` needed). Provision a Postgres plugin and `DATABASE_URL` is injected automatically (no SSL config needed, the app auto-detects). Set the remaining env vars from `.env.example` in the Railway dashboard. The container's `CMD` runs the API which serves the SPA on the same port.

## Postgres provider notes

The app accepts any Postgres connection string. SSL is auto-enabled for non-localhost hosts and disabled for `localhost` / `127.0.0.1` / unix sockets. To force-disable SSL on a non-localhost host, append `?sslmode=disable` to the URL.

Tested with:

| Provider | Notes |
|---|---|
| **Neon** | Free tier is plenty for personal use. Use the connection string from the dashboard verbatim — it already includes `?sslmode=require`. |
| **Supabase** | Use the **direct connection** (not the pooler) since the app holds a small connection pool itself. Format: `postgres://postgres:pass@db.xxxxx.supabase.co:5432/postgres`. |
| **Railway Postgres plugin** | Auto-injected as `DATABASE_URL` on the same project. Zero config. |
| **AWS RDS / GCP Cloud SQL** | Standard `postgres://user:pass@<endpoint>:5432/dbname`. Make sure the security group allows your app's egress IP. |
| **Local** | `postgres://user:pass@localhost:5432/selfinbox`. Create the DB first; the app creates the tables. |

Schema bootstraps on first boot — you don't need to run any migration step.

## Docker

A `Dockerfile` (multi-stage) and `docker-compose.yml` (app + postgres) are included at the repo root.

### Local / self-hosted

```bash
# Fill in FROM_EMAIL, AWS_* in apps/api/.env first (see README)
docker compose up --build -d

# Create your account
docker compose run --rm app node scripts/create-user.mjs

# Rebuild after code changes
docker compose up --build -d
```

The compose file overrides `DATABASE_URL` to point at the bundled postgres service. Remove that override (or the whole `postgres` service) when using an external database.

### VPS with external database

```bash
docker build -t selfinbox .

docker run -d \
  --name selfinbox \
  --env-file apps/api/.env \
  -e DATABASE_URL="postgres://user:pass@your-db-host:5432/selfinbox" \
  -p 3001:3001 \
  --restart unless-stopped \
  selfinbox
```

### Branding at build time

`VITE_BRAND_NAME` and `VITE_SUPPORT_EMAIL` are baked into the SPA bundle:

```bash
docker build \
  --build-arg VITE_BRAND_NAME="My Inbox" \
  --build-arg VITE_SUPPORT_EMAIL="hello@mydomain.com" \
  -t selfinbox .
```

## VPS

Same story — install Node 23, run the three build steps above, put it behind nginx/Caddy with a reverse proxy + TLS. Use `pm2` or systemd to keep the API running.

## Build modes (`VITE_MODE`)

The SPA has three build modes, set at build time via `VITE_MODE`:

| Mode | `/` shows | Other paths | API needed? | Use case |
|---|---|---|---|---|
| `app` (default) | redirects to `/login` | normal | yes | Strict private self-host. No public landing — only the owner sees the login screen. |
| `public` | the landing page | normal | yes | Public landing + private app on one domain. The landing has no Sign In link; the owner bookmarks `/login` to reach the dashboard. (`selfinbox.ozersubasi.com`'s model.) |
| `marketing` | the landing page | redirect to the GitHub repo | no | Pure static landing. No app, no login, no backend — host on Cloudflare Pages / Netlify / S3. |

### `public` — landing + app on one deploy

Build with the `public` flag and deploy normally (Dockerfile, Railway, your VPS):

```bash
docker build --build-arg VITE_MODE=public -t selfinbox .
```

Visitors hitting `/` see the marketing landing. The owner navigates to `/login` directly (or bookmarks `/dashboard`, `/inbox`, etc.) — once authenticated, `/` redirects to `/dashboard`. Set a strong password and keep `REGISTRATION_ENABLED=false` so the login URL alone doesn't grant access.

### `marketing` — pure static landing

No API, no Postgres, no Docker — drop the build output on any static host:

```bash
cd apps/web
npm install --legacy-peer-deps
VITE_MODE=marketing VITE_API_URL='' npx vite build
# → apps/web/dist  (deploy this directory as-is)
```

For an SPA static host, make sure the catch-all rewrite points at `index.html` (Cloudflare Pages auto-detects; Netlify needs a `_redirects` line; Nginx needs `try_files $uri /index.html;`). The in-app catch-all then redirects unknown paths to the GitHub repo.

## Post-deploy checklist

- [ ] `APP_URL` matches your public URL (used for email links + OAuth + SNS subscriptions)
- [ ] DNS for the app domain resolves and TLS works
- [ ] SES sandbox decision made — either out of sandbox (production access granted), or each recipient address verified via `aws ses verify-email-identity` (sending to unverified addresses 4xxs in sandbox)
- [ ] SNS subscriptions show `Confirmed` (not `PendingConfirmation`) in the AWS console
- [ ] First test send from the dashboard arrives at your inbox
- [ ] First test inbound arrives at a verified domain → shows up in `/inbox`
