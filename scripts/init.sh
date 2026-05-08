#!/usr/bin/env bash
# First-run bootstrap for Selfinbox.
#
# Handles the boring boilerplate so you can get to the interesting parts:
#   - copies .env.example → apps/api/.env (only if .env doesn't exist)
#   - auto-generates JWT_SECRET if you haven't filled one in
#   - npm install in apps/api and apps/web
#   - checks that the prereq tools are on your PATH and warns if missing
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

check node "install Node 23: https://nodejs.org/"
check npm  "comes with Node"
check aws  "install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
check jq   "install jq: https://stedolan.github.io/jq/ (brew install jq | apt install jq)"

if [ -x "$(command -v node)" ]; then
  node_major=$(node -v | sed -E 's/v([0-9]+).*/\1/')
  if [ "$node_major" -lt 22 ]; then
    yellow "  ⚠ node $(node -v) is too old, Selfinbox needs Node 22+ (23 recommended)"
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
green "[3/3] Installing dependencies"
( cd apps/api && npm install --silent ) && green "  ✓ apps/api"
( cd apps/web && npm install --silent ) && green "  ✓ apps/web"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo
green "✓ Selfinbox is ready to configure."
echo
cat <<EOF
Next steps:

  1. Open $ENV_FILE and fill in:
       - DATABASE_URL    (your Postgres — Neon, Supabase, Railway, local, ...)
       - FROM_EMAIL      (a sender address on a domain you own)
       - AWS_REGION      (eu-west-1, us-east-1, or us-west-2 for SES inbound)

  2. Provision your AWS account (S3 + SNS + IAM + SES rule, idempotent):
       APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
     The script prints AWS_ACCESS_KEY_ID / SECRET at the end — paste them
     into $ENV_FILE.

  3. Verify your sender domain in SES (one-time):
       aws ses verify-domain-identity --domain yourdomain.com
       aws ses verify-domain-dkim     --domain yourdomain.com
     Add the printed DNS records at your registrar.

  4. Boot:
       (cd apps/api && npm run dev) &
       (cd apps/web && npm run dev)
     Open http://localhost:5173.

See README.md for the full walkthrough.
EOF
