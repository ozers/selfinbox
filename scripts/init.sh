#!/usr/bin/env bash
# First-run bootstrap for Selfinbox.
#
# Handles the boring boilerplate so you can get to the interesting parts:
#   - copies .env.example → apps/api/.env (only if .env doesn't exist)
#   - auto-generates JWT_SECRET if you haven't filled one in
#   - npm install in apps/api and apps/web  (skipped with --env-only, for Docker)
#   - checks that the prereq tools are on your PATH and warns if missing
#
# Docker users: run `./scripts/init.sh --env-only` — it writes .env + JWT_SECRET
# and skips npm install, so you need no Node/npm on the host (just aws + jq).
#
# What it deliberately doesn't do (manual on purpose):
#   - configure AWS credentials (you decide which account)
#   - run setup-aws.sh (that's the next step, see README)
#   - verify domain in SES (you decide which domain)
#   - boot the app (you decide when)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
red() { printf "\033[0;31m%s\033[0m\n" "$1" >&2; }
dim() { printf "\033[2m%s\033[0m\n" "$1"; }

# ─── Mode ─────────────────────────────────────────────────────────────────────
# --env-only (alias --no-install): create .env + JWT_SECRET only, skip npm
# install. This is the Docker path — deps live in the image, so you don't need
# Node/npm on the host at all (just aws + jq for setup-aws.sh).
MODE="full"
for arg in "$@"; do
  case "$arg" in
    --env-only|--no-install) MODE="env-only" ;;
    -h|--help) echo "Usage: init.sh [--env-only]"; exit 0 ;;
    *) red "Unknown argument: $arg (try --env-only or --help)"; exit 1 ;;
  esac
done

# ─── 1. Prereq check (warn-only, doesn't block) ───────────────────────────────
green "[1/3] Checking prerequisites"
missing=()

check() {
  local cmd="$1" hint="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    dim "  ✓ $cmd ($(command -v "$cmd"))"
  else
    yellow "  ✗ $cmd missing — $hint"
    missing+=("$cmd")
  fi
}

if [ "$MODE" = "full" ]; then
  check node "install Node 22+: https://nodejs.org/  (or skip the host: ./scripts/init.sh --env-only + Docker)"
  check npm  "comes with Node"
fi
check aws  "install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
check jq   "install jq: https://stedolan.github.io/jq/ (brew install jq | apt install jq)"

if [ "$MODE" = "full" ] && [ -x "$(command -v node)" ]; then
  node_major=$(node -v | sed -E 's/v([0-9]+).*/\1/')
  if [ "$node_major" -lt 22 ]; then
    yellow "  ⚠ node $(node -v) is too old — Selfinbox needs Node 22+ (the app won't boot otherwise)."
    yellow "    With nvm:  nvm install 22 && nvm use 22   (an .nvmrc pins it — 'nvm use' is enough)"
    yellow "    Or skip Node on the host entirely: ./scripts/init.sh --env-only and run via Docker."
  fi
fi

if [ ${#missing[@]} -gt 0 ]; then
  yellow ""
  yellow "Some prereqs are missing. The script will continue but later steps may fail."
  yellow "(setup-aws.sh needs aws + jq; npm install needs node + npm.)"
fi

# ─── 2. Environment file ──────────────────────────────────────────────────────
green ""
green "[2/3] Bootstrapping apps/api/.env"

ENV_FILE="apps/api/.env"

if [ -f "$ENV_FILE" ]; then
  yellow "  ⏭  $ENV_FILE already exists, leaving it alone"
else
  cp .env.example "$ENV_FILE"
  green "  ✓ copied .env.example → $ENV_FILE"

  # Generate JWT_SECRET in-place
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -base64 48 | tr -d '\n')
    # Use a sentinel-aware sed that works on both BSD (mac) and GNU
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" "$ENV_FILE"
    else
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" "$ENV_FILE"
    fi
    green "  ✓ generated a fresh JWT_SECRET (48 random bytes)"
  else
    yellow "  ⚠ openssl not found — leaving JWT_SECRET as the placeholder. Edit $ENV_FILE before booting."
  fi
fi

# ─── 3. Install dependencies ──────────────────────────────────────────────────
green ""
if [ "$MODE" = "full" ]; then
  green "[3/3] Installing dependencies"
  ( cd apps/api && npm install --silent ) && green "  ✓ apps/api"
  ( cd apps/web && npm install --silent ) && green "  ✓ apps/web"
else
  green "[3/3] Skipping dependency install (--env-only / Docker mode)"
  dim "  deps come from the Docker image — nothing to install on the host"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo
green "✓ Selfinbox is ready to configure."
echo

if [ "$MODE" = "env-only" ]; then
cat <<EOF
Next steps (Docker):

  1. Open $ENV_FILE and set FROM_EMAIL (a sender on a domain you own).
     DATABASE_URL is provided by the bundled Postgres in docker-compose —
     leave it as-is unless you want an external DB.

  2. Provision AWS (idempotent). Run as an IAM user, NOT root. With a profile:
       AWS_PROFILE=your-profile APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
     It writes AWS_REGION, S3_INBOUND_BUCKET and the IAM key into $ENV_FILE.

  3. Build + start:
       docker compose up --build -d

  4. Create your account:
       docker compose run --rm app node scripts/create-user.mjs

  Open http://localhost:3001 . Full walkthrough: docs/SELF_HOSTING.md
EOF
else
cat <<EOF
Next steps:

  1. Open $ENV_FILE and fill in the two things only you can provide:
       - DATABASE_URL    (your Postgres — Neon, Supabase, Railway, local, ...)
       - FROM_EMAIL      (a sender address on a domain you own)
     (AWS_REGION, S3_INBOUND_BUCKET and the AWS keys are written for you in step 2.)

  2. Provision your AWS account (S3 + SNS + IAM + SES rule, idempotent).
     Run as an IAM user, NOT root (the script refuses root):
       AWS_PROFILE=your-profile APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
     It writes AWS_REGION, S3_INBOUND_BUCKET and the IAM access key straight
     into $ENV_FILE (the key is printed to the terminal only if $ENV_FILE is missing).

  3. Verify your sender domain in SES (one-time — use the SAME region you
     provisioned, eu-west-1 by default):
       aws ses verify-domain-identity --domain yourdomain.com --region eu-west-1
       aws ses verify-domain-dkim     --domain yourdomain.com --region eu-west-1
     Add the printed DNS records at your registrar.

  4. Boot:
       (cd apps/api && npm run dev) &
       (cd apps/web && npm run dev)
     Open http://localhost:5173.

See README.md for the full walkthrough.
EOF
fi
