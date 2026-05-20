#!/usr/bin/env node
/**
 * Seed realistic-looking demo data so the dashboard + inbox + sidebar have
 * something to render. Paired with the in-app "Demo mode" toggle, which
 * masks the underlying values with deterministic fakes for screenshots.
 *
 * Usage (from repo root):
 *   node apps/api/scripts/seed-demo.mjs                      # uses first user
 *   node apps/api/scripts/seed-demo.mjs --email you@x.com    # target a specific user
 *   node apps/api/scripts/seed-demo.mjs --reset              # wipe + re-seed
 *
 * Idempotent by default — refuses to re-seed if the demo domain already
 * exists for the target user (use --reset to force).
 *
 * Touches no AWS resources. Postgres only.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_DOMAIN = "ozersubasi.com";

function loadEnv() {
  if (process.env.DATABASE_URL) return process.env;
  const envPath = join(__dirname, "../.env");
  try {
    const content = readFileSync(envPath, "utf8");
    const vars = {};
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)/);
      if (m) vars[m[1].trim()] = m[2].trim();
    }
    return vars;
  } catch {
    console.error("apps/api/.env not found.");
    process.exit(1);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { reset: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email") out.email = args[++i];
    else if (args[i] === "--reset") out.reset = true;
  }
  return out;
}

function detectSsl(url) {
  if (/[?&]sslmode=disable\b/.test(url)) return false;
  if (/[?&]sslmode=(require|verify-ca|verify-full|prefer)\b/.test(url)) return { rejectUnauthorized: false };
  const isLocal =
    /(@|\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/.test(url) ||
    url.startsWith("postgres://localhost");
  if (isLocal) return false;
  try {
    const host = new URL(url).hostname;
    if (host && !host.includes(".")) return false;
  } catch { /* ignore */ }
  return { rejectUnauthorized: false };
}

// Realistic-looking source data. Demo mode in the UI substitutes these
// with deterministic fakes at render time — but we still keep the seed
// values plausible so screenshots taken with demo mode OFF look natural too.
const ADDRESSES = [
  { local: "hi",      displayName: "Ozer Subasi", catchall: false },
  { local: "hello",   displayName: "Hello",       catchall: false },
  { local: "support", displayName: "Support",     catchall: false },
  { local: "press",   displayName: "Press",       catchall: false },
  { local: "noreply", displayName: null,          catchall: false },
];

const INBOUND_SENDERS = [
  { from: "Sarah Chen <sarah@northwind.co>",          subject: "Hey Ozer — quick question about Selfinbox" },
  { from: "billing@stripe.com",                        subject: "Your receipt from Stripe — $19.00" },
  { from: "Alex Park <alex@partner.dev>",              subject: "Re: integration timeline" },
  { from: "notifications@github.com",                  subject: "[ozers/selfinbox] PR #42 ready for review" },
  { from: "Maya R. <maya.r@studio.design>",            subject: "Brand assets for ozersubasi.com — final round" },
  { from: "no-reply@calendar.app",                     subject: "Reminder: Sync with Ozer at 3pm" },
  { from: "Daniel L. <dlam@northcrest.dev>",           subject: "Following up on our chat last week" },
  { from: "team@figma.com",                            subject: "Maya commented on your file" },
  { from: "security@cloudguard.io",                    subject: "New sign-in to your account" },
  { from: "Newsletter <hello@indiehacker.news>",       subject: "Issue #128 — building in public" },
  { from: "Recruiter <talent@nimbushq.com>",           subject: "Hi Ozer, opportunity at Nimbus" },
  { from: "Customer <questions@acmehq.com>",           subject: "Cannot reset my password — help?" },
];

const OUTBOUND_RECIPIENTS = [
  { fromLocal: "hi",      to: "sarah@northwind.co",   subject: "Re: Hey Ozer — quick question about Selfinbox" },
  { fromLocal: "hi",      to: "alex@partner.dev",     subject: "Integration timeline + scope" },
  { fromLocal: "support", to: "questions@acmehq.com", subject: "Re: Cannot reset my password — help?" },
  { fromLocal: "hi",      to: "dlam@northcrest.dev",  subject: "Re: Following up on our chat last week" },
  { fromLocal: "press",   to: "editor@launchweek.io", subject: "Selfinbox launch — press kit attached" },
];

function randomBody(subject) {
  return `Hi,\n\nQuick note about "${subject}".\n\nLet me know if you have any questions.\n\nThanks`;
}

async function main() {
  const env = loadEnv();
  const DATABASE_URL = env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }

  const { email, reset } = parseArgs();
  const sql = postgres(DATABASE_URL, { ssl: detectSsl(DATABASE_URL), max: 1 });

  try {
    // Find target user
    const [user] = email
      ? await sql`SELECT id, email FROM users WHERE email = ${email} LIMIT 1`
      : await sql`SELECT id, email FROM users ORDER BY created_at ASC LIMIT 1`;

    if (!user) {
      console.error(email
        ? `No user with email "${email}". Run create-user first.`
        : "No users in the database. Run create-user first.");
      process.exit(1);
    }

    // Check for existing demo domain
    const [existing] = await sql`
      SELECT id FROM domains WHERE user_id = ${user.id} AND domain = ${DEMO_DOMAIN}
    `;

    if (existing) {
      if (!reset) {
        console.error(`Demo data already exists for ${user.email}. Run with --reset to re-seed.`);
        process.exit(1);
      }
      console.log("Wiping previous demo data…");
      await sql`DELETE FROM emails WHERE domain_id = ${existing.id}`;
      await sql`DELETE FROM domains WHERE id = ${existing.id}`;
    }

    // Insert demo domain (cascades to dns_records / email_addresses / smtp_credentials)
    const domainId = randomUUID();
    await sql`
      INSERT INTO domains (id, user_id, domain, status, ses_verification_token, ses_dkim_tokens, created_at)
      VALUES (
        ${domainId},
        ${user.id},
        ${DEMO_DOMAIN},
        'active',
        ${"demo-token-" + randomUUID().slice(0, 8)},
        ${JSON.stringify(["demo-dkim-1", "demo-dkim-2", "demo-dkim-3"])},
        NOW() - INTERVAL '21 days'
      )
    `;

    // DNS records (all verified)
    const dnsRows = [
      { type: "MX",  name: DEMO_DOMAIN,                  value: "10 inbound-smtp.eu-west-1.amazonaws.com" },
      { type: "TXT", name: DEMO_DOMAIN,                  value: "v=spf1 include:amazonses.com ~all" },
      { type: "CNAME", name: `demo-dkim-1._domainkey.${DEMO_DOMAIN}`, value: "demo-dkim-1.dkim.amazonses.com" },
      { type: "CNAME", name: `demo-dkim-2._domainkey.${DEMO_DOMAIN}`, value: "demo-dkim-2.dkim.amazonses.com" },
      { type: "CNAME", name: `demo-dkim-3._domainkey.${DEMO_DOMAIN}`, value: "demo-dkim-3.dkim.amazonses.com" },
      { type: "TXT", name: `_dmarc.${DEMO_DOMAIN}`,      value: "v=DMARC1; p=none; rua=mailto:dmarc@" + DEMO_DOMAIN },
    ];
    for (const r of dnsRows) {
      await sql`
        INSERT INTO dns_records (id, domain_id, type, name, value, verified)
        VALUES (${randomUUID()}, ${domainId}, ${r.type}, ${r.name}, ${r.value}, true)
      `;
    }

    // Email addresses
    const addressRows = [];
    for (const a of ADDRESSES) {
      const id = randomUUID();
      const addr = `${a.local}@${DEMO_DOMAIN}`;
      await sql`
        INSERT INTO email_addresses (id, domain_id, address, display_name, forwarding_to, is_catchall, is_active)
        VALUES (${id}, ${domainId}, ${addr}, ${a.displayName}, ${null}, ${a.catchall}, true)
      `;
      addressRows.push({ id, address: addr });
    }

    // SMTP creds for the domain
    await sql`
      INSERT INTO smtp_credentials (id, domain_id, host, port, username, password, encryption)
      VALUES (${randomUUID()}, ${domainId}, ${"email-smtp.eu-west-1.amazonaws.com"}, 587,
              ${"AKIA" + randomUUID().slice(0, 16).toUpperCase()}, ${randomUUID()}, 'STARTTLS')
    `;

    // Emails — spread across the last 14 days; mix of inbound + outbound;
    // about a third of inbound is unread.
    const now = Date.now();
    let unreadCount = 0;
    let totalEmails = 0;

    for (let i = 0; i < INBOUND_SENDERS.length; i++) {
      const s = INBOUND_SENDERS[i];
      const target = addressRows[i % addressRows.length];
      const ageHours = Math.floor((i * 18) + Math.random() * 6);
      const createdAt = new Date(now - ageHours * 60 * 60 * 1000);
      const isRead = i % 3 !== 0;
      if (!isRead) unreadCount++;
      totalEmails++;

      await sql`
        INSERT INTO emails (
          id, user_id, domain_id, address, direction, from_addr, to_addrs, cc_addrs,
          subject, body_text, body_html, is_read, ses_message_id, s3_key, created_at
        ) VALUES (
          ${randomUUID()}, ${user.id}, ${domainId}, ${target.address}, 'inbound',
          ${s.from}, ${JSON.stringify([target.address])}, '[]',
          ${s.subject}, ${randomBody(s.subject)}, ${""}, ${isRead},
          ${"<demo-" + randomUUID().slice(0, 8) + "@" + DEMO_DOMAIN + ">"},
          ${"incoming/demo-" + i + ".eml"}, ${createdAt.toISOString()}
        )
      `;
    }

    const addressByLocal = Object.fromEntries(
      addressRows.map((a) => [a.address.split("@")[0], a])
    );

    for (let i = 0; i < OUTBOUND_RECIPIENTS.length; i++) {
      const r = OUTBOUND_RECIPIENTS[i];
      const sender = addressByLocal[r.fromLocal] ?? addressRows[0];
      const ageHours = Math.floor((i * 24) + 2);
      const createdAt = new Date(now - ageHours * 60 * 60 * 1000);
      totalEmails++;

      await sql`
        INSERT INTO emails (
          id, user_id, domain_id, address, direction, from_addr, to_addrs, cc_addrs,
          subject, body_text, body_html, is_read, ses_message_id, s3_key, created_at
        ) VALUES (
          ${randomUUID()}, ${user.id}, ${domainId}, ${sender.address}, 'outbound',
          ${sender.address}, ${JSON.stringify([r.to])}, '[]',
          ${r.subject}, ${randomBody(r.subject)}, ${""}, true,
          ${"<demo-out-" + randomUUID().slice(0, 8) + "@" + DEMO_DOMAIN + ">"},
          ${null}, ${createdAt.toISOString()}
        )
      `;
    }

    console.log(`\n✓ Seeded demo data for ${user.email}`);
    console.log(`  Domain:    ${DEMO_DOMAIN} (active)`);
    console.log(`  Addresses: ${addressRows.length}`);
    console.log(`  Emails:    ${totalEmails} (${unreadCount} unread)`);
    console.log(`\nOpen the dashboard and toggle "Demo mode" in the sidebar.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
