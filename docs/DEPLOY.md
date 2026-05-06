# Deploy

The repo is currently shipped on Railway (which the included `railway.toml` and `nixpacks.toml` target), but nothing in the code is Railway-specific. Anywhere that runs Node 23 + can reach Postgres + has outbound HTTPS to AWS will work.

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

Already set up — push to a Railway project linked to this repo. The root `railway.toml` runs the bundle build; provision a Postgres plugin and the `DATABASE_URL` is injected automatically.

## Docker (rough sketch)

No Dockerfile is included; here's a minimal one to crib from:

```dockerfile
FROM node:23-slim AS build
WORKDIR /app
COPY apps/web ./apps/web
COPY apps/api ./apps/api
RUN cd apps/web && npm install --legacy-peer-deps && VITE_API_URL='' npx vite build
RUN cd apps/api && cp -r ../web/dist ./public && npm install && npm run build

FROM node:23-slim
WORKDIR /app/apps/api
COPY --from=build /app/apps/api ./
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

## VPS

Same story — install Node 23, run the three build steps above, put it behind nginx/Caddy with a reverse proxy + TLS. Use `pm2` or systemd to keep the API running.

## Post-deploy checklist

- [ ] `APP_URL` matches your public URL (used for email links + OAuth + SNS subscriptions)
- [ ] DNS for the app domain resolves and TLS works
- [ ] AWS SES is out of sandbox (otherwise sending to non-verified addresses 4xxs)
- [ ] SNS subscriptions show `Confirmed` (not `PendingConfirmation`) in the AWS console
- [ ] First test send from the dashboard arrives at your inbox
- [ ] First test inbound arrives at a verified domain → shows up in `/inbox`
