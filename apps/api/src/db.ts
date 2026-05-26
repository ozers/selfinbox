import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// SSL: required by every cloud Postgres (Neon, Supabase, RDS, Railway, etc.).
// Disabled for localhost, unix sockets, and single-label hostnames (Docker
// Compose service names like `postgres` — no TLD means no public CA chain).
function shouldUseSsl(url: string): boolean | { rejectUnauthorized: false } {
  if (/[?&]sslmode=disable\b/.test(url)) return false;
  if (/[?&]sslmode=(require|verify-ca|verify-full|prefer)\b/.test(url)) return { rejectUnauthorized: false };
  const isLocal = /(@|\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/.test(url) || url.startsWith("postgres://localhost") || url.includes("host=/");
  if (isLocal) return false;
  try {
    const host = new URL(url).hostname;
    if (host && !host.includes(".")) return false;
  } catch { /* fall through */ }
  return { rejectUnauthorized: false };
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: shouldUseSsl(process.env.DATABASE_URL),
  max: 10,
  idle_timeout: 20,
  onnotice: () => {},
});

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified_at TIMESTAMPTZ,
      suspended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ses_verification_token TEXT,
      ses_dkim_tokens TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS dns_records (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_addresses (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      forwarding_to TEXT,
      is_catchall BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      domain_id TEXT NOT NULL REFERENCES domains(id),
      address TEXT NOT NULL,
      direction TEXT NOT NULL,
      from_addr TEXT NOT NULL,
      to_addrs TEXT NOT NULL,
      cc_addrs TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL DEFAULT '',
      body_html TEXT NOT NULL DEFAULT '',
      is_read BOOLEAN NOT NULL DEFAULT false,
      ses_message_id TEXT,
      s3_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS smtp_credentials (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 587,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      encryption TEXT NOT NULL DEFAULT 'STARTTLS'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS bounce_events (
      id TEXT PRIMARY KEY,
      email_address_id TEXT REFERENCES email_addresses(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      raw TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // token_version: bumped on password reset, password change, and email
  // change. Embedded in every JWT and compared at auth time so that a stolen
  // token cannot survive a credential rotation event.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`;

  await sql`ALTER TABLE email_addresses ADD COLUMN IF NOT EXISTS display_name TEXT`;
  // forwarding_verified_at: set when the destination address completes
  // double-opt-in. The inbound webhook refuses to relay unless this is
  // non-NULL, preventing the app from being used as a one-hop spam relay.
  await sql`ALTER TABLE email_addresses ADD COLUMN IF NOT EXISTS forwarding_verified_at TIMESTAMPTZ`;

  // forwarding_tokens: one row per pending forward-confirmation. Separate
  // from email_tokens because it carries an address_id and a stable
  // forwarding target snapshot — not tied to a user account.
  await sql`
    CREATE TABLE IF NOT EXISTS forwarding_tokens (
      id TEXT PRIMARY KEY,
      address_id TEXT NOT NULL REFERENCES email_addresses(id) ON DELETE CASCADE,
      target_email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Attachment metadata lives on the emails row as JSONB. The binary blobs
  // stay in S3 under attachments/{userId}/{emailId}/{idx}. has_quarantined
  // flips to true if any attachment was blocked (ext blocklist, MIME
  // mismatch, ClamAV hit, oversize) — the UI uses this to surface a warning.
  await sql`ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments_meta JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE emails ADD COLUMN IF NOT EXISTS has_quarantined BOOLEAN NOT NULL DEFAULT false`;

  // Migrations: drop legacy billing columns and waitlist table
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS plan`;
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS ls_customer_id`;
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS ls_subscription_id`;
  await sql`DROP TABLE IF EXISTS waitlist`;

  console.log("[db] PostgreSQL schema ready");
}

export default sql;
