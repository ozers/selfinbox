# AWS Setup

Selfinbox needs three AWS services: **SES** (send + receive), **S3** (raw inbound storage), **SNS** (delivery into the API).

The `scripts/setup-aws.sh` script provisions everything except domain verification and the SES sandbox-removal request — those are one-time manual steps per AWS account.

## Prerequisites

- An AWS account
- `aws` CLI v2 installed and configured (`aws sts get-caller-identity` should work)
- `jq` installed
- A domain you control (for SES sender identity)

> ⚠️ **Don't use the AWS account root user.** Root has unrestricted access and
> AWS best practice is to never use it for programmatic work. `setup-aws.sh`
> refuses to run as root (override only with `ALLOW_ROOT=true`). Create an IAM
> user to run it instead — see the next section.

## Two users, two privilege levels

There are two distinct IAM identities, and it's worth keeping them straight:

| User | Created by | Permissions | Used for |
|---|---|---|---|
| **operator** (e.g. `selfinbox-admin`) | you, in the console | **you grant, before running** | running `setup-aws.sh` |
| **`selfinbox-app`** | the script, automatically | least-privilege inline policy, set by the script | what the running app uses |

The **app user is already least-privilege** — the script attaches exactly
`ses:SendEmail/SendRawEmail/VerifyDomainIdentity/VerifyDomainDkim/GetIdentity*/DeleteIdentity`
(`Resource: *`) and `s3:GetObject/PutObject` on the inbound bucket. Nothing for
you to do there.

The **operator user is the one you grant permissions to** — and the script
*can't* do this for you (it would need those permissions to grant them, which
is circular). Pick one:

### Option A — simple

Attach the AWS-managed **`AdministratorAccess`** policy. Fine for a self-host:
it's a user you own, and you can deactivate/delete its access key once setup is
done (you only need it for occasional re-runs). Console → IAM → Users → Create
user → attach `AdministratorAccess` → create access key → `aws configure`.

### Option B — least-privilege operator (recommended)

Grant the operator **only** the actions `setup-aws.sh` actually calls — nothing
else in the account is reachable. The policy lives in
[`iam-provisioner-policy.json`](iam-provisioner-policy.json), scoped by resource
where possible (`iam:*` only touches `user/selfinbox-app`, S3 only
`selfinbox-inbound-*`, SNS only `selfinbox-ses-*`).

This bootstrap is the one part you do **as root or an existing admin** (in the
console or via CLI) — once, to mint the operator user. Everything afterward
runs as that user.

```bash
# 1. Create the operator user (no permissions yet)
aws iam create-user --user-name selfinbox-admin

# 2. Attach the scoped provisioner policy (run from the repo root)
aws iam put-user-policy --user-name selfinbox-admin \
  --policy-name selfinbox-provisioner \
  --policy-document file://docs/iam-provisioner-policy.json

# 3. Mint an access key (prints AccessKeyId + SecretAccessKey once)
aws iam create-access-key --user-name selfinbox-admin

# 4. Switch your CLI to that key, then confirm you're NOT root
aws configure                      # paste the key from step 3
aws sts get-caller-identity        # Arn must end with :user/selfinbox-admin
```

Now run `setup-aws.sh` as `selfinbox-admin`. The provisioner policy covers
every call the script makes **plus** the manual `ses verify-domain-identity` /
`verify-domain-dkim` / `verify-email-identity` steps below.

> If you pin a custom `S3_INBOUND_BUCKET` name (not `selfinbox-inbound-*`),
> edit the bucket ARN in `iam-provisioner-policy.json` to match before step 2.

> 🔒 **Hygiene:** the operator access key is only needed for provisioning and
> the occasional re-run (domain verification, SNS wiring). Deactivate it in IAM
> between runs, or delete it and mint a fresh one when you next need it.

## TL;DR

```bash
export AWS_REGION=eu-west-1
export APP_URL=https://your-app.example.com   # https only; localhost skips SNS
./scripts/setup-aws.sh
```

The inbound S3 bucket name defaults to `selfinbox-inbound-<account-id>` (S3
names are globally unique). Pin your own with `export S3_INBOUND_BUCKET=...`.
The script writes `AWS_REGION`, `S3_INBOUND_BUCKET`, and the IAM access key
into `apps/api/.env` for you (the secret key is printed to the terminal only if `.env` is missing — otherwise it goes straight into the file).

Then verify your sending domain:

```bash
aws ses verify-domain-identity --domain yourdomain.com --region $AWS_REGION
aws ses verify-domain-dkim --domain yourdomain.com --region $AWS_REGION
```

Add the printed TXT (verification) and CNAME (DKIM) records to your DNS, wait a few minutes, and SES will mark the identity verified.

## What the script creates

| Resource | Name (default) | Purpose |
|---|---|---|
| S3 bucket | `selfinbox-inbound-<account-id>` | SES drops every received email here as raw RFC822 (also stores processed attachments) |
| S3 public-access block | (all on) | Bucket is never public — only SES writes, only the app reads |
| S3 bucket policy | (inline) | Lets `ses.amazonaws.com` PutObject |
| SNS topic | `selfinbox-ses-inbound` | Notifies API of new inbound messages |
| SNS topic | `selfinbox-ses-bounce` | Bounce + complaint notifications |
| SNS subscriptions | (HTTPS) | Subscribed to `$APP_URL/api/webhooks/ses/{inbound,bounce}` |
| IAM user | `selfinbox-app` | The credentials your app uses |
| IAM inline policy | `selfinbox-app` | SES send/verify/delete-identity + S3 Get/PutObject (least privilege) |
| SES rule set | `selfinbox-default` | Container for receipt rules |
| SES receipt rule | `selfinbox-inbound` | Wildcard catch-all → S3 + SNS |

It is **idempotent** — re-running skips anything that already exists. Existing access keys are not rotated.

## Manual steps after the script

### 1. Verify a sender domain

```bash
aws ses verify-domain-identity --domain yourdomain.com
aws ses verify-domain-dkim     --domain yourdomain.com
```

The CLI prints DNS records you need to add. SES confirms verification within minutes once they're live.

This domain must match (or be a parent of) `FROM_EMAIL` in your `.env`.

### 2. Bind bounce/complaint notifications to that identity

```bash
BOUNCE_ARN=arn:aws:sns:eu-west-1:123456789012:selfinbox-ses-bounce
aws ses set-identity-notification-topic --identity yourdomain.com \
  --notification-type Bounce    --sns-topic $BOUNCE_ARN
aws ses set-identity-notification-topic --identity yourdomain.com \
  --notification-type Complaint --sns-topic $BOUNCE_ARN
```

### 3. Choose: stay in the SES sandbox, or leave it

New AWS accounts start in the **SES sandbox**. The restriction is *send-side only* — receiving mail works exactly the same in sandbox or production. The sandbox limits you to:

- Sending only to email addresses you've explicitly verified in SES
- 200 sends per 24 hours
- 1 send per second

Two valid setups depending on what you actually need:

#### Option A — stay in sandbox (no approval needed)

Right for: forwarding-only setups, personal use where you only ever send to a known list of recipients, hobby/dev deploys.

No app-side configuration changes. Just verify each recipient address once:

```bash
aws ses verify-email-identity --email you@gmail.com --region $AWS_REGION
aws ses verify-email-identity --email partner@example.com --region $AWS_REGION
# ...one per recipient
```

Each address gets a one-time AWS confirmation email. Click the link in it. From then on, your deploy can send to that address (subject to the 200/day cap).

If a user tries to send to an unverified address while in sandbox, SES returns `MessageRejected` with a clear error and the API surfaces it to the UI.

#### Option B — leave sandbox (production access)

Right for: transactional mail to customers, sending to arbitrary recipients, anything past 200/day.

> AWS Console → SES → Account dashboard → "Request production access"

Approval typically takes a few hours. AWS asks how you'll use SES, where your mailing list comes from, and how you handle bounces/complaints — Selfinbox handles bounces and complaints automatically (see `apps/api/src/routes/webhooks.ts`), so mention that in the form.

You can keep developing in sandbox while waiting for approval — verify your own address as a recipient and test the flow end-to-end. Once approved, no app changes are needed; the limits just lift.

### 4. Region note

SES inbound is **only available in some regions** (`us-east-1`, `us-west-2`, `eu-west-1` as of 2026). Pick a supported region for `AWS_REGION`. SES sending works in more regions, but matching them avoids cross-region complications.

## How inbound mail flows

```
sender → MX (inbound-smtp.{region}.amazonaws.com)
       → SES applies the active receipt rule set
       → S3Action: writes incoming/{messageId} to your bucket
       → SNSAction: publishes JSON notification to selfinbox-ses-inbound
       → SNS → HTTPS POST → /api/webhooks/ses/inbound
       → API fetches raw email from S3, parses, stores in Postgres
       → if forwarding configured, re-sends via SES SendEmail
```

The SNS HTTPS subscription requires confirmation. The webhook handler in `apps/api/src/routes/webhooks.ts` auto-confirms — just make sure your API is publicly reachable when the subscription is created (or click the confirmation link manually from the SNS console).

## Troubleshooting

**"Bucket policy fails to apply"** — your AWS_REGION in the shell doesn't match the bucket's region. Recreate, or set `AWS_REGION` correctly.

**"SES receipt rule has no effect"** — only one receipt rule set can be active at a time. Check with `aws ses describe-active-receipt-rule-set`. The script will not steal the active slot from a pre-existing rule set.

**"Inbound email never arrives"** — check (a) MX record points to `inbound-smtp.{region}.amazonaws.com`, (b) the receiving domain is verified in SES, (c) the rule set is active, (d) the SNS subscription status is `Confirmed` not `PendingConfirmation`.

**"Webhook 401/403 from SNS"** — the API needs to be publicly reachable for SNS to POST. Use ngrok in dev: `ngrok http 3001`, set `APP_URL=https://xxx.ngrok.app`, re-run `setup-aws.sh` to subscribe the new URL.
