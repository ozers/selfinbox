#!/usr/bin/env bash
# Provisions the AWS resources Selfinbox needs:
#   - S3 bucket for inbound raw emails
#   - Bucket policy that lets SES PutObject
#   - SNS topics: inbound, bounce, complaint
#   - SNS subscriptions to the API webhook URLs
#   - IAM user + access key with least-privilege policy
#   - SES receipt rule set + receipt rule (S3 + SNS action)
#
# Idempotent: re-running skips anything that already exists.
# Does NOT touch your existing AWS resources unless they collide on name.
#
# Required tools: aws cli (v2), jq.
# Required env: AWS credentials in your shell (aws sts get-caller-identity must work).
#
# Use an IAM admin user, NOT the account root user. The script refuses to run
# as root unless ALLOW_ROOT=true. (Root = unrestricted access; never use it for
# programmatic work — create an IAM user with AdministratorAccess instead.)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/apps/api/.env"

# Read KEY's value from apps/api/.env (empty if file/key absent). Keys are
# unique in .env, so no head/tail (a SIGPIPE under pipefail would abort us).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s|^$1=||p" "$ENV_FILE"
}

# ─── Config ───────────────────────────────────────────────────────────────────
# Precedence: shell env  >  apps/api/.env  >  built-in default. Reading .env
# matters so a region/bucket the user set there is honored — not ignored and
# then silently overwritten with the default by set_env() below.
AWS_REGION="${AWS_REGION:-$(env_get AWS_REGION)}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
APP_URL="${APP_URL:-$(env_get APP_URL)}"
# Bucket name is resolved AFTER we know the account ID — S3 names are globally
# unique across all AWS accounts, so a bare "selfinbox-inbound" almost always
# collides. We suffix it with the account ID unless the user pinned one.
S3_BUCKET="${S3_INBOUND_BUCKET:-$(env_get S3_INBOUND_BUCKET)}"
# Treat the legacy collide-prone default from old .env.example as "unset" so we
# fall through to the account-suffixed name instead of recreating the clash.
if [ "$S3_BUCKET" = "selfinbox-inbound" ]; then S3_BUCKET=""; fi
IAM_USER="${IAM_USER:-selfinbox-app}"
SNS_INBOUND="${SNS_INBOUND:-selfinbox-ses-inbound}"
SNS_BOUNCE="${SNS_BOUNCE:-selfinbox-ses-bounce}"
RULE_SET="${SES_RULE_SET:-selfinbox-default}"
RULE_NAME="${SES_RULE_NAME:-selfinbox-inbound}"

# ─── Helpers ──────────────────────────────────────────────────────────────────
green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
red() { printf "\033[0;31m%s\033[0m\n" "$1" >&2; }

require() { command -v "$1" >/dev/null 2>&1 || { red "Missing: $1"; exit 1; }; }
require aws
require jq

# Write KEY=VALUE into apps/api/.env, replacing an existing line or appending.
# Values here are account IDs / region / bucket names (safe for the `|` sed
# delimiter — no `|` ever appears in them).
set_env() {
  local key="$1" val="$2"
  [ -f "$ENV_FILE" ] || return 0
  if grep -q "^${key}=" "$ENV_FILE"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    fi
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

CALLER=$(aws sts get-caller-identity --output json)
ACCOUNT_ID=$(echo "$CALLER" | jq -r '.Account')
CALLER_ARN=$(echo "$CALLER" | jq -r '.Arn')
[ -z "$ACCOUNT_ID" ] || [ "$ACCOUNT_ID" = "null" ] && { red "AWS credentials not configured."; exit 1; }

# Refuse to provision as the AWS account ROOT user. Root has unrestricted
# access; AWS best practice is to never use it for day-to-day work or
# programmatic access. Create an IAM admin user and `aws configure` with that.
# Override with ALLOW_ROOT=true if you truly have no other option.
if [[ "$CALLER_ARN" == *":root" ]]; then
  red "✗ You are authenticated as the AWS account ROOT user:"
  red "    $CALLER_ARN"
  red ""
  red "  Running provisioning as root is strongly discouraged. Instead:"
  red "    1. AWS Console → IAM → Users → Create user (e.g. 'selfinbox-admin')"
  red "    2. Attach 'AdministratorAccess' (or a scoped admin policy)"
  red "    3. Create an access key for it → run 'aws configure'"
  red "  Then re-run this script."
  red ""
  if [ "${ALLOW_ROOT:-}" = "true" ]; then
    yellow "  ALLOW_ROOT=true set — continuing as root against best practice."
  else
    red "  To override anyway (not recommended): ALLOW_ROOT=true $0"
    exit 1
  fi
fi

green "Account: $ACCOUNT_ID  Identity: $CALLER_ARN  Region: $AWS_REGION"

# Resolve the bucket name now that we have the account ID, then persist the
# region + bucket back to .env so the app talks to exactly what we provision.
if [ -z "$S3_BUCKET" ]; then
  S3_BUCKET="selfinbox-inbound-${ACCOUNT_ID}"
fi
green "Inbound bucket: $S3_BUCKET"
set_env AWS_REGION "$AWS_REGION"
set_env S3_INBOUND_BUCKET "$S3_BUCKET"

# SNS can only deliver to a public HTTPS endpoint, and `sns subscribe` rejects
# an http:// URL under `--protocol https`. So we only subscribe when APP_URL is
# a real https:// host — localhost/http deploys subscribe later, from prod.
PUBLIC_URL=""
case "$APP_URL" in
  https://*) PUBLIC_URL="${APP_URL%/}" ;;
  "")        yellow "APP_URL not set — SNS subscriptions skipped. Re-run with APP_URL=https://your.app once deployed." ;;
  *)         yellow "APP_URL is '$APP_URL' (not https://) — SNS subscriptions skipped. SNS needs a public HTTPS endpoint; re-run from your deployed URL." ;;
esac

# ─── 1. S3 bucket ─────────────────────────────────────────────────────────────
if aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
  yellow "[skip] S3 bucket $S3_BUCKET already exists"
else
  green "[create] S3 bucket $S3_BUCKET"
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null
  fi
  aws s3api put-bucket-versioning --bucket "$S3_BUCKET" --versioning-configuration Status=Enabled
fi

# Block all public access — the only writer is SES (via the bucket policy
# below) and the only reader is the app's IAM user. Nothing here is public.
green "[apply] S3 public-access block"
aws s3api put-public-access-block --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=true

# Bucket policy — lets SES write to it
green "[apply] S3 bucket policy (allow SES PutObject)"
BUCKET_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSESPutObject",
    "Effect": "Allow",
    "Principal": { "Service": "ses.amazonaws.com" },
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::${S3_BUCKET}/*",
    "Condition": {
      "StringEquals": { "aws:Referer": "${ACCOUNT_ID}" }
    }
  }]
}
EOF
)
echo "$BUCKET_POLICY" | aws s3api put-bucket-policy --bucket "$S3_BUCKET" --policy file:///dev/stdin

# ─── 2. SNS topics ────────────────────────────────────────────────────────────
create_topic() {
  local name="$1"
  local arn
  arn=$(aws sns create-topic --name "$name" --region "$AWS_REGION" --query TopicArn --output text)
  echo "$arn"
}

INBOUND_ARN=$(create_topic "$SNS_INBOUND")
BOUNCE_ARN=$(create_topic "$SNS_BOUNCE")
green "[ok] SNS inbound:  $INBOUND_ARN"
green "[ok] SNS bounce:   $BOUNCE_ARN"

# ─── 3. SNS subscriptions to webhook URLs ─────────────────────────────────────
subscribe() {
  local arn="$1" url="$2"
  local existing
  existing=$(aws sns list-subscriptions-by-topic --topic-arn "$arn" --region "$AWS_REGION" \
    --query "Subscriptions[?Endpoint=='$url'].SubscriptionArn" --output text || true)
  if [ -n "$existing" ] && [ "$existing" != "PendingConfirmation" ]; then
    yellow "[skip] $url already subscribed to $arn"
    return
  fi
  aws sns subscribe --topic-arn "$arn" --protocol https --notification-endpoint "$url" --region "$AWS_REGION" >/dev/null
  green "[subscribe] $url → $arn"
}

if [ -n "$PUBLIC_URL" ]; then
  subscribe "$INBOUND_ARN" "$PUBLIC_URL/api/webhooks/ses/inbound"
  subscribe "$BOUNCE_ARN"  "$PUBLIC_URL/api/webhooks/ses/bounce"
  yellow "Confirmation will happen automatically when your API is reachable (it auto-confirms in webhooks.ts)."
fi

# ─── 4. IAM user + policy + access key ────────────────────────────────────────
if aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1; then
  yellow "[skip] IAM user $IAM_USER already exists"
else
  green "[create] IAM user $IAM_USER"
  aws iam create-user --user-name "$IAM_USER" >/dev/null
fi

IAM_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail", "ses:VerifyDomainIdentity", "ses:VerifyDomainDkim", "ses:GetIdentityVerificationAttributes", "ses:GetIdentityDkimAttributes", "ses:DeleteIdentity"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
EOF
)
echo "$IAM_POLICY" | aws iam put-user-policy --user-name "$IAM_USER" --policy-name selfinbox-app --policy-document file:///dev/stdin
green "[apply] IAM inline policy selfinbox-app"

EXISTING_KEYS=$(aws iam list-access-keys --user-name "$IAM_USER" --query 'AccessKeyMetadata[].AccessKeyId' --output text)
if [ -z "$EXISTING_KEYS" ]; then
  green "[create] Access key for $IAM_USER"
  KEY_JSON=$(aws iam create-access-key --user-name "$IAM_USER")
  AKID=$(echo "$KEY_JSON" | jq -r '.AccessKey.AccessKeyId')
  SECRET=$(echo "$KEY_JSON" | jq -r '.AccessKey.SecretAccessKey')

  if [ -f "$ENV_FILE" ]; then
    # set_env replaces the line or appends if absent (AWS secret keys are
    # base64-ish — A-Za-z0-9+/ — so the '|' sed delimiter is always safe).
    set_env AWS_ACCESS_KEY_ID "$AKID"
    set_env AWS_SECRET_ACCESS_KEY "$SECRET"
    green "  ✓ AWS credentials written to $ENV_FILE"
  else
    echo
    green "════════════════════════════════════════════════════════════════════"
    green "  apps/api/.env not found — copy these manually (shown ONCE):"
    echo "    AWS_ACCESS_KEY_ID=$AKID"
    echo "    AWS_SECRET_ACCESS_KEY=$SECRET"
    green "════════════════════════════════════════════════════════════════════"
    echo
  fi
else
  yellow "[skip] Access key(s) already exist for $IAM_USER ($EXISTING_KEYS) — re-use existing or rotate manually."
fi

# ─── 5. SES receipt rule set ──────────────────────────────────────────────────
if aws ses describe-receipt-rule-set --rule-set-name "$RULE_SET" --region "$AWS_REGION" >/dev/null 2>&1; then
  yellow "[skip] SES rule set $RULE_SET already exists"
else
  green "[create] SES rule set $RULE_SET"
  aws ses create-receipt-rule-set --rule-set-name "$RULE_SET" --region "$AWS_REGION"
fi

# Make it the active rule set (only if nothing else is active)
ACTIVE_RULESET=$(aws ses describe-active-receipt-rule-set --region "$AWS_REGION" --query 'Metadata.Name' --output text 2>/dev/null || echo "None")
if [ "$ACTIVE_RULESET" = "None" ] || [ "$ACTIVE_RULESET" = "$RULE_SET" ]; then
  aws ses set-active-receipt-rule-set --rule-set-name "$RULE_SET" --region "$AWS_REGION"
  green "[ok] $RULE_SET is the active SES rule set"
else
  yellow "[warn] Active SES rule set is '$ACTIVE_RULESET', not '$RULE_SET'. Activate manually if you want Selfinbox to receive mail."
fi

# Receipt rule — wildcard recipients, S3 then SNS notification
RULE_JSON=$(cat <<EOF
{
  "Name": "${RULE_NAME}",
  "Enabled": true,
  "ScanEnabled": true,
  "TlsPolicy": "Optional",
  "Recipients": [],
  "Actions": [
    { "S3Action": { "BucketName": "${S3_BUCKET}", "ObjectKeyPrefix": "incoming/" } },
    { "SNSAction": { "TopicArn": "${INBOUND_ARN}", "Encoding": "UTF-8" } }
  ]
}
EOF
)
if aws ses describe-receipt-rule --rule-set-name "$RULE_SET" --rule-name "$RULE_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  green "[update] SES receipt rule $RULE_NAME"
  echo "$RULE_JSON" | aws ses update-receipt-rule --rule-set-name "$RULE_SET" --region "$AWS_REGION" --rule file:///dev/stdin
else
  green "[create] SES receipt rule $RULE_NAME"
  echo "$RULE_JSON" | aws ses create-receipt-rule --rule-set-name "$RULE_SET" --region "$AWS_REGION" --rule file:///dev/stdin
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo
green "✓ AWS provisioning complete."
echo
cat <<EOF
Next steps:

  1. AWS_REGION + S3_INBOUND_BUCKET were written to apps/api/.env for you:
       AWS_REGION=$AWS_REGION
       S3_INBOUND_BUCKET=$S3_BUCKET
     (If you skipped .env, set them manually before booting.)

  2. Verify your sending domain in SES (one-time, per region):
       Console → SES → Verified identities → Create identity → Domain
       (or: aws ses verify-domain-identity --domain yourdomain.com)
     Add the printed DKIM CNAMEs to your DNS.

  3. Decide what to do about the SES sandbox. New accounts start in the
     sandbox — receiving works fine either way, sandbox only limits sending:

     Option A — stay in sandbox (forwarding-only or fixed recipients):
       aws ses verify-email-identity --email you@example.com
       (one per recipient, then click the AWS confirmation email)

     Option B — leave sandbox (send to anyone, no per-recipient setup):
       Console → SES → Account dashboard → Request production access
       (approval takes a few hours)

  4. Bind your bounce/complaint topic to your verified identities:
       aws ses set-identity-notification-topic --identity yourdomain.com \\
         --notification-type Bounce --sns-topic $BOUNCE_ARN
       aws ses set-identity-notification-topic --identity yourdomain.com \\
         --notification-type Complaint --sns-topic $BOUNCE_ARN

  5. Start the API. SNS subscriptions auto-confirm on first webhook hit.
EOF
