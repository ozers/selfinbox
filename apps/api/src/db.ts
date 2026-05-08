import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// SSL: required by every cloud Postgres (Neon, Supabase, RDS, Railway, etc.).
// Disabled only for local connections (localhost / 127.0.0.1 / unix socket).
function shouldUseSsl(url: string): boolean | { rejectUnauthorized: false } {
  const isLocal = /(@|\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/.test(url) || url.startsWith("postgres://localhost") || url.includes("host=/");
  if (isLocal) return false;
  // Honor explicit sslmode=disable in the URL
  if (/[?&]sslmode=disable\b/.test(url)) return false;
  // Most managed providers ship with self-signed-ish chains — accept without verification
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

  await sql`ALTER TABLE email_addresses ADD COLUMN IF NOT EXISTS display_name TEXT`;

  // Migrations: drop legacy billing columns and waitlist table
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS plan`;
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS ls_customer_id`;
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS ls_subscription_id`;
  await sql`DROP TABLE IF EXISTS waitlist`;

  console.log("[db] PostgreSQL schema ready");
}

export default sql;
