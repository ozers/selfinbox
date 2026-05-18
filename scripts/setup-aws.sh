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

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/apps/api/.env"

# ─── Config (override via env) ────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-eu-west-1}"
S3_BUCKET="${S3_INBOUND_BUCKET:-selfinbox-inbound}"
APP_URL="${APP_URL:-}"
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

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
[ -z "$ACCOUNT_ID" ] && { red "AWS credentials not configured."; exit 1; }

green "Account: $ACCOUNT_ID  Region: $AWS_REGION"

if [ -z "$APP_URL" ]; then
  yellow "APP_URL not set — SNS subscriptions will be skipped. Re-run with APP_URL=https://your.app to subscribe webhooks."
fi

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

if [ -n "$APP_URL" ]; then
  APP_URL="${APP_URL%/}"
  subscribe "$INBOUND_ARN" "$APP_URL/api/webhooks/ses/inbound"
  subscribe "$BOUNCE_ARN"  "$APP_URL/api/webhooks/ses/bounce"
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
      "Action": ["ses:SendEmail", "ses:SendRawEmail", "ses:VerifyDomainIdentity", "ses:VerifyDomainDkim", "ses:GetIdentityVerificationAttributes", "ses:GetIdentityDkimAttributes"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
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
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$AKID|" "$ENV_FILE"
      sed -i '' "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$SECRET|" "$ENV_FILE"
    else
      sed -i "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$AKID|" "$ENV_FILE"
      sed -i "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$SECRET|" "$ENV_FILE"
    fi
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

  1. Set these in apps/api/.env (if not already):
       AWS_REGION=$AWS_REGION
       S3_INBOUND_BUCKET=$S3_BUCKET

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
