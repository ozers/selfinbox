#!/usr/bin/env node
/**
 * Create a Selfinbox user directly in the database.
 * Skips REGISTRATION_ENABLED — safe for initial setup and inviting users.
 *
 * Usage (from repo root):
 *   npm run create-user -- --email you@example.com --name "Your Name" --password secret
 *   npm run create-user   (interactive prompts)
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  // In Docker / CI, vars are injected directly — no .env file needed.
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
    console.error("apps/api/.env not found — run `npm run init` first.");
    process.exit(1);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email") result.email = args[++i];
    else if (args[i] === "--name") result.name = args[++i];
    else if (args[i] === "--password") result.password = args[++i];
  }
  return result;
}

async function ask(rl, question) {
  return (await rl.question(question)).trim();
}

async function main() {
  const env = loadEnv();
  const DATABASE_URL = env.DATABASE_URL;

  const placeholder = "postgres://user:pass@localhost:5432/selfinbox";
  if (!DATABASE_URL || DATABASE_URL === placeholder) {
    console.error("DATABASE_URL is not configured. Edit apps/api/.env first.");
    process.exit(1);
  }

  let { email, name, password } = parseArgs();

  const rl = createInterface({ input, output });
  if (!name) name = await ask(rl, "Name:     ");
  if (!email) email = await ask(rl, "Email:    ");
  if (!password) password = await ask(rl, "Password: ");
  rl.close();

  if (!name || !email || !password) {
    console.error("Name, email, and password are all required.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  // Match the API's SSL detection: skip TLS for localhost, unix sockets, and
  // single-label hostnames (Docker Compose service names).
  let ssl;
  if (/[?&]sslmode=disable\b/.test(DATABASE_URL)) {
    ssl = false;
  } else if (/[?&]sslmode=(require|verify-ca|verify-full|prefer)\b/.test(DATABASE_URL)) {
    ssl = { rejectUnauthorized: false };
  } else {
    const isLocal =
      /(@|\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/.test(DATABASE_URL) ||
      DATABASE_URL.startsWith("postgres://localhost");
    let singleLabelHost = false;
    try {
      const host = new URL(DATABASE_URL).hostname;
      singleLabelHost = !!host && !host.includes(".");
    } catch { /* ignore */ }
    ssl = isLocal || singleLabelHost ? false : { rejectUnauthorized: false };
  }

  const sql = postgres(DATABASE_URL, { ssl, max: 1 });

  try {
    const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) {
      console.error(`A user with email "${email}" already exists.`);
      process.exit(1);
    }

    const id = randomUUID();
    const passwordHash = bcrypt.hashSync(password, 10);

    await sql`
      INSERT INTO users (id, name, email, password_hash, email_verified_at)
      VALUES (${id}, ${name}, ${email}, ${passwordHash}, NOW())
    `;

    console.log(`\n✓ User created: ${name} <${email}>`);
    console.log("  Log in at your Selfinbox instance.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
