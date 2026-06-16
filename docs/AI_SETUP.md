# Setting up Selfinbox with an AI agent

A runbook for an AI coding agent (Claude Code, Cursor, etc.) to install Selfinbox end-to-end on a user's behalf. It is written to be followed literally, top to bottom. Every phase has a **goal**, the **commands** to run, a **verify** check, and explicit **STOP** points where only the human can act.

If you are a human: you can read this to see exactly what the agent will do, or just hand it to your agent with *"Follow docs/AI_SETUP.md to set up Selfinbox for me."*

---

## Ground rules for the agent

1. **Never invent AWS credentials, a domain, or DNS records.** These come from the human. Ask, then wait.
2. **Treat the AWS secret as sensitive.** Write it only into `apps/api/.env` (gitignored) or a local AWS profile. Never echo it to the chat or commit it.
3. **Confirm before creating real cloud resources.** `setup-aws.sh` creates billable AWS resources in the human's account. Show what it will create and get a yes first.
4. **Never run the provisioner as the AWS root user.** The script refuses anyway; use an IAM operator user.
5. **Stop at every 🛑 STOP marker** — those steps require a human (pasting credentials, editing DNS, clicking a confirmation link). Do not fake them or skip ahead.
6. **Verify each phase before moving on.** If a verify check fails, fix it before continuing — don't cascade.
7. Prefer the **Docker path** unless the human asks otherwise — it's the most representative of a real install and needs no Node on the host.

---

## Phase 0 — Preflight

**Goal:** confirm the toolchain is present.

```bash
aws --version            # AWS CLI v2 required
jq --version             # required by setup-aws.sh
docker --version && docker compose version   # for the Docker path
node -v                  # only for the Node path (skip if using Docker)
```

**Verify:** `aws` and `jq` resolve, and either Docker or Node is available. If `aws`/`jq` are missing, install them (`brew install awscli jq` on macOS) before continuing.

---

## Phase 1 — Gather inputs from the human

🛑 **STOP. Ask the human for, and wait for:**

1. **AWS credentials** for an **IAM operator user** (not root) with permission to create S3/SNS/IAM/SES resources — either `AdministratorAccess` or the policy in [`iam-provisioner-policy.json`](iam-provisioner-policy.json). You need the **Access Key ID + Secret**.
2. **AWS region** — must be an SES inbound region: `eu-west-1`, `us-east-1`, or `us-west-2`.
3. **A domain they own** whose DNS they can edit.
4. **Database choice** — the bundled Docker Postgres (default, easiest) or an external Postgres URL (Neon/Supabase/RDS).

Store the credentials in a local profile so the secret never repeats in commands (it is not printed by `aws configure set`):

```bash
aws configure set aws_access_key_id     "<ACCESS_KEY_ID>"     --profile selfinbox-admin
aws configure set aws_secret_access_key "<SECRET>"            --profile selfinbox-admin
aws configure set region                "<REGION>"            --profile selfinbox-admin
```

**Verify the identity is valid and is NOT root:**

```bash
AWS_PROFILE=selfinbox-admin aws sts get-caller-identity
# Arn must be .../user/<name>, NOT .../root
```

---

## Phase 2 — Clone & configure

**Goal:** a populated `apps/api/.env`.

```bash
git clone https://github.com/ozers/selfinbox && cd selfinbox
./scripts/init.sh --env-only      # creates apps/api/.env + a JWT_SECRET (no npm needed)
```

Set these in `apps/api/.env` (leave `AWS_ACCESS_KEY_ID`/`SECRET` blank — Phase 3 fills them):

| Key | Value |
|---|---|
| `FROM_EMAIL` | `noreply@<their-domain>` |
| `AWS_REGION` | the region from Phase 1 |
| `APP_URL` | `http://localhost:3001` for the local test |
| `DATABASE_URL` | leave the compose default for Docker, or the external URL |

**Verify:** `FROM_EMAIL`, `AWS_REGION`, `APP_URL` are set; `JWT_SECRET` is non-empty.

---

## Phase 3 — Provision AWS

🛑 **STOP. Confirm with the human** that you're about to create real resources in their account (`aws sts get-caller-identity` shows which one): an S3 bucket, two SNS topics, an IAM user `selfinbox-app` + access key, and an SES receipt rule set.

```bash
AWS_PROFILE=selfinbox-admin APP_URL=http://localhost:3001 ./scripts/setup-aws.sh
```

The script is idempotent and writes `AWS_REGION`, `S3_INBOUND_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (the least-privilege `selfinbox-app` key) into `apps/api/.env`.

**Verify:** the script ends with `✓ AWS provisioning complete`, and `apps/api/.env` now has a non-empty `AWS_ACCESS_KEY_ID` and `S3_INBOUND_BUCKET`. (SNS subscriptions are intentionally skipped for an `http://localhost` `APP_URL` — that's correct; inbound is wired in Phase 8.)

---

## Phase 4 — Boot

**Docker path (recommended):**

```bash
docker compose up -d            # builds the image (VITE_MODE=app → no landing/demo), starts app + postgres
docker compose logs app | tail
```

**Verify:** logs show `PostgreSQL schema ready` and `Selfinbox API running`, and:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/health   # → 200
```

---

## Phase 5 — Create the first account

Registration is off by default, so create the user directly. On Docker, run it **inside** the container (its workdir is `/app/apps/api`):

```bash
docker compose exec -T app node scripts/create-user.mjs \
  --email you@example.com --name "Your Name" --password "<strong-password>"
```

(Node path: `npm run create-user -- --email … --name … --password …`.)

**Verify:** logging in returns a token:

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<strong-password>"}'
# → JSON containing "token"
```

Keep that token; later API calls use `Authorization: Bearer <token>`.

---

## Phase 6 — Add the domain

The dashboard/API call creates the SES identity + DKIM and returns the DNS records to publish.

```bash
TOKEN=<from Phase 5>
curl -s -X POST http://localhost:3001/api/domains \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"domain":"their-domain.com"}' | jq .
```

**Verify:** the response lists ~7 `dnsRecords` (1 TXT verification, 1 MX, 1 TXT SPF, 1 TXT DMARC, **3** CNAME DKIM). Collect them — the human publishes these next. (Or point the human at `http://localhost:3001` → log in → the **Add Domain** wizard shows the same records with copy buttons and a Cloudflare one-click.)

---

## Phase 7 — Publish DNS & verify

🛑 **STOP. The human must add the DNS records** from Phase 6 to their domain's DNS. You cannot do this for them. Tell them explicitly:

- Add **all three** DKIM CNAMEs (missing one keeps DKIM `Pending`).
- A domain may have only **one** SPF TXT and **one** `_dmarc` TXT. If the domain already has an SPF (`v=spf1 …`) or DMARC record, they must **replace/merge** it, not add a second.

Once they say they're done, verify what's actually live and poll SES:

```bash
NS=$(dig +short NS their-domain.com | head -1)   # query the authoritative NS directly
dig +short @"$NS" TXT  _amazonses.their-domain.com
dig +short @"$NS" MX   their-domain.com
dig +short @"$NS" TXT  their-domain.com            # exactly ONE v=spf1 line
dig +short @"$NS" TXT  _dmarc.their-domain.com     # exactly ONE v=DMARC1 line
for t in <dkim-token-1> <dkim-token-2> <dkim-token-3>; do
  dig +short @"$NS" CNAME "$t._domainkey.their-domain.com"
done

# SES status (use the app key you provisioned)
AWS_PROFILE=selfinbox-app aws ses get-identity-verification-attributes \
  --identities their-domain.com --region <REGION> \
  --query 'VerificationAttributes."their-domain.com".VerificationStatus' --output text
AWS_PROFILE=selfinbox-app aws ses get-identity-dkim-attributes \
  --identities their-domain.com --region <REGION> \
  --query 'DkimAttributes."their-domain.com".DkimVerificationStatus' --output text
```

(Set up the `selfinbox-app` profile once from the keys in `apps/api/.env`, the same way as `selfinbox-admin` in Phase 1.)

**Verify:** both statuses reach `Success`. DKIM can lag a few minutes after the CNAMEs resolve — poll, don't panic. The app's `GET /api/domains` will flip the domain to `"status":"active"` on its own once SES verifies.

---

## Phase 8 — Test send & receive

**Outbound** (works on localhost). In the SES sandbox you can only send to a verified recipient:

```bash
# verify the recipient once (needs the operator profile)
AWS_PROFILE=selfinbox-admin aws ses verify-email-identity \
  --email-address recipient@gmail.com --region <REGION>
```

🛑 **STOP. The human must click the confirmation link** AWS emails to that recipient. Then create an address and send:

```bash
DID=$(curl -s http://localhost:3001/api/domains -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
curl -s -X POST http://localhost:3001/api/domains/$DID/addresses \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"prefix":"hi"}'

curl -s -X POST http://localhost:3001/api/emails/send \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"from":"hi@their-domain.com","to":"recipient@gmail.com","subject":"Selfinbox test","bodyText":"It works."}' \
  -w "\nHTTP %{http_code}\n"
```

**Verify:** HTTP `201` and the mail arrives. A `422` *"Recipient address isn't verified"* means the recipient hasn't confirmed yet (sandbox) — that's a correct, expected error, not a failure of the install.

**Inbound** does **not** work against `localhost` (SNS needs public HTTPS). To test it locally:

🛑 **STOP. Get the human's OK to expose the local app via a tunnel** (it puts their running install on the public internet temporarily).

```bash
cloudflared tunnel --url http://localhost:3001      # prints https://<random>.trycloudflare.com
AWS_PROFILE=selfinbox-admin APP_URL=https://<tunnel> ./scripts/setup-aws.sh   # subscribes SNS; app auto-confirms
```

Then have the human send a normal email **to** `hi@their-domain.com` and confirm it appears via `GET /api/emails?direction=inbound`. **Tear the tunnel down afterward.**

---

## Phase 9 — Production rollout

For a permanent install there's no tunnel — the app lives at a stable public HTTPS URL:

1. Deploy the app to a public HTTPS host (Railway/Render/Fly one-click, or a VPS + Caddy/nginx for auto-TLS). Keep `VITE_MODE=app` so the install build ships only the real inbox (no landing/demo). Point `DATABASE_URL` at managed Postgres or the bundled service, and set `APP_URL=https://mail.their-domain.com`.
2. Re-run `setup-aws.sh` from that public URL — this time it **subscribes SNS** to the real webhooks, so inbound works permanently.
3. Leave the SES sandbox (Console → SES → *Request production access*) to send to anyone.

See [`DEPLOY.md`](DEPLOY.md) for host-specific recipes.

---

## Cleanup after a test

- **Tell the human to deactivate/delete the operator access key** if it was pasted into the chat (Console → IAM → that user → access keys).
- Remove the temporary local profiles you created: delete the `[selfinbox-admin]` / `[selfinbox-app]` blocks from `~/.aws/credentials` and `~/.aws/config`.
- If you used a tunnel, stop it. The SNS subscriptions pointing at the dead tunnel URL are harmless but can be removed from the SNS console.
- `docker compose down` stops the test app (the named volume keeps the DB; add `-v` to wipe it).
