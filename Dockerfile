# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# Build args for Vite (baked into the SPA bundle at build time)
# VITE_MODE: `app` (default — install build, only the real inbox: no landing,
#            no demo), `public` (landing at `/` + full app + demo, owner
#            bookmarks /login), `marketing` (landing + demo only, static).
ARG VITE_MODE=app
ARG VITE_BRAND_NAME=Selfinbox
ARG VITE_SUPPORT_EMAIL=
ARG VITE_API_URL=

# Web SPA — drop the lockfile before install: Vite 8 + Rolldown ships
# platform-specific native bindings as optional deps, and npm bug #4828
# causes the Linux binding to be skipped when installing against a
# lockfile generated on a different platform (e.g. macOS).
COPY apps/web/package.json apps/web/
RUN cd apps/web && npm install --legacy-peer-deps

COPY apps/web apps/web
RUN cd apps/web && \
    VITE_MODE="$VITE_MODE" \
    VITE_BRAND_NAME="$VITE_BRAND_NAME" \
    VITE_SUPPORT_EMAIL="$VITE_SUPPORT_EMAIL" \
    VITE_API_URL="$VITE_API_URL" \
    npx vite build

# API — install all deps (dev needed for tsc)
COPY apps/api/package*.json apps/api/
RUN cd apps/api && npm install

COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/
RUN cd apps/api && npm run build

# Swap to production-only deps
RUN cd apps/api && npm install --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app/apps/api

COPY --from=build /app/apps/api/dist        ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/web/dist        ./public
COPY apps/api/scripts                       ./scripts
COPY apps/api/package.json                  ./package.json

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/index.js"]
