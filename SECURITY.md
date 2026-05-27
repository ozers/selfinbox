# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security findings.

Email **security@ozersubasi.com** with:

- A description of the issue and the impact you believe it has
- Steps to reproduce (HTTP requests, screenshots, or a minimal PoC)
- The commit SHA you tested against (`git rev-parse HEAD`)
- Your suggested fix, if you have one
- Whether you're OK being credited in the fix commit / release notes

I'll acknowledge within **72 hours** and aim to ship a fix within **14 days**
for HIGH/CRITICAL findings, **30 days** for MEDIUM. Selfinbox is maintained
by one person — please be patient with response times on lower-severity items.

If you'd like to encrypt the report, mention it in a first email and I'll
send a current PGP key.

## Disclosure timeline

- **0 days** — you report the issue.
- **0–3 days** — I acknowledge receipt and confirm the issue is reproducible.
- **3–14 days** — fix developed, tested on a self-host instance, merged.
- **At release** — credit to the reporter (unless they opted out), brief
  description of the issue in the changelog, no PoC details until users
  have had time to update.
- **+30 days after release** — full write-up published if the finding is
  novel enough to be worth sharing.

If a fix is taking longer than the SLA above, I'll email you with a status
update — not silence.

## Scope

**In scope:**

- The published `main` branch and any tagged release.
- The hosted demo at `selfinbox.ozersubasi.com` and `selfinbox.ozersubasi.com/demo`
  (the demo runs the same code as the repo).
- The AWS provisioner script (`scripts/setup-aws.sh`) — IAM permissions,
  resource names, defaults.

**Out of scope:**

- Issues that require an attacker to already have shell access to the
  host running Selfinbox, or root on the database.
- DoS / resource exhaustion via legitimate API calls beyond the documented
  rate limits.
- Findings in third-party dependencies that aren't reachable from the
  Selfinbox code paths.
- Spam classification, deliverability reputation, or anything else that's
  inherent to running on top of AWS SES rather than to this codebase.
- Social engineering or physical attacks against the maintainer.

If you're unsure whether something is in scope, email anyway — I'd rather
read a borderline report than miss a real one.

## No bounty program

There's no money behind this project. I can offer credit, a thank-you in
the release notes, a recommendation, and the satisfaction of making
something better. If you need a bounty to justify the time, this isn't the
project for that — completely understood.

## What counts as a vulnerability

In rough priority order:

1. **Authentication bypass** — anything that lets one user act as another,
   or an unauthenticated request reach an authenticated route.
2. **Multi-tenant isolation gaps** — anything that lets one user read,
   modify, or delete another user's data (emails, domains, SMTP creds,
   attachments).
3. **Webhook / SNS signature bypass** — anything that lets a forged SNS
   message be processed as authentic.
4. **Remote code execution / SSRF / SQL injection / path traversal.**
5. **Sensitive data exposure** — credentials in logs, secrets in client-
   reachable responses, decryption oracles for the secret-box envelope.
6. **Outbound mail abuse** — anything that lets a registered user send mail
   purporting to be from a domain or address they don't own, or that bypasses
   the verified-email gate on `/api/emails/send`.
7. **Inbound mail XSS** — anything that lets a sender execute JavaScript in
   a recipient's authenticated session via the rendered email body.

Thank you for taking the time to make this project more secure.
