import { Hono } from "hono";
import type { AppVariables } from "../lib/context.js";
import bcrypt from "bcryptjs";
const { hashSync, compareSync } = bcrypt;
import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import sql from "../db.js";
import { authMiddleware, getJwtSecret } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { sendEmail, verifyEmailBody, resetPasswordBody } from "../lib/send-email.js";
import { serializeUser } from "../serializers.js";

const auth = new Hono<{ Variables: AppVariables }>();

// Rate limits, tuned for single-user self-host. Brute-force / credential-
// stuffing protection on the public endpoints; email-bombing protection on
// the ones that send mail. Buckets are per-IP, per-route (separate scopes
// so /login traffic doesn't consume /forgot-password budget).
const MIN = 60_000;
const HOUR = 60 * MIN;
const loginLimit            = rateLimit({ windowMs: 15 * MIN, max: 8  });
const registerLimit         = rateLimit({ windowMs: HOUR,     max: 5  });
const passwordResetLimit    = rateLimit({ windowMs: HOUR,     max: 5  });
const verifyEmailLimit      = rateLimit({ windowMs: 15 * MIN, max: 20 });
const resendVerifyLimit     = rateLimit({ windowMs: HOUR,     max: 3  });

async function createToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

function generateEmailToken() {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

// POST /api/auth/register
auth.post("/register", registerLimit, async (c) => {
  if (process.env.REGISTRATION_ENABLED !== "true") {
    return c.json({ error: "Registration is currently closed." }, 403);
  }

  const body = await c.req.json();
  const { name, email, password } = body;

  if (!name || !email || !password) {
    return c.json({ error: "Name, email, and password are required" }, 400);
  }

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = hashSync(password, 10);

  await sql`INSERT INTO users (id, name, email, password_hash) VALUES (${id}, ${name}, ${email}, ${passwordHash})`;

  const { raw, hash } = generateEmailToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO email_tokens (id, user_id, token_hash, type, expires_at)
    VALUES (${crypto.randomUUID()}, ${id}, ${hash}, 'verify', ${expiresAt})
  `;

  sendEmail(email, "Verify your account", verifyEmailBody(raw)).catch(console.error);

  const [user] = await sql`
    SELECT id, name, email, email_verified_at, suspended_at, created_at FROM users WHERE id = ${id}
  `;

  const token = await createToken(id);
  return c.json({ token, user: serializeUser(user) }, 201);
});

// POST /api/auth/login
auth.post("/login", loginLimit, async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const [row] = await sql`SELECT * FROM users WHERE email = ${email}`;

  if (!row || !compareSync(password, row.password_hash)) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await createToken(row.id);
  return c.json({ token, user: serializeUser(row) });
});

// GET /api/auth/me
auth.get("/me", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json(serializeUser(user));
});

// PUT /api/auth/me
auth.put("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { name, email } = body;

  if (!name && !email) {
    return c.json({ error: "Name or email is required" }, 400);
  }

  if (email) {
    const [existing] = await sql`SELECT id FROM users WHERE email = ${email} AND id != ${userId}`;
    if (existing) {
      return c.json({ error: "Email already in use" }, 409);
    }
  }

  if (name && email) {
    await sql`UPDATE users SET name = ${name}, email = ${email} WHERE id = ${userId}`;
  } else if (name) {
    await sql`UPDATE users SET name = ${name} WHERE id = ${userId}`;
  } else {
    await sql`UPDATE users SET email = ${email} WHERE id = ${userId}`;
  }

  const [user] = await sql`
    SELECT id, name, email, email_verified_at, suspended_at, created_at FROM users WHERE id = ${userId}
  `;

  return c.json(serializeUser(user));
});

// PUT /api/auth/password
auth.put("/password", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return c.json({ error: "Current password and new password are required" }, 400);
  }

  const [row] = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;

  if (!compareSync(currentPassword, row.password_hash)) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  await sql`UPDATE users SET password_hash = ${hashSync(newPassword, 10)} WHERE id = ${userId}`;
  return c.json({ message: "Password updated" });
});

// DELETE /api/auth/me
auth.delete("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");

  // Delete in FK-safe order; cascade handles dns_records, email_addresses, smtp_credentials, email_tokens
  await sql`DELETE FROM emails WHERE user_id = ${userId}`;
  await sql`DELETE FROM domains WHERE user_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;

  return c.json({ message: "Account deleted" });
});

// POST /api/auth/forgot-password
auth.post("/forgot-password", passwordResetLimit, async (c) => {
  const body = await c.req.json();
  const { email } = body;

  if (!email) return c.json({ error: "Email is required" }, 400);

  const [user] = await sql`SELECT id FROM users WHERE email = ${email}`;

  // Always return 200 to avoid leaking whether email exists
  if (user) {
    const { raw, hash } = generateEmailToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await sql`DELETE FROM email_tokens WHERE user_id = ${user.id} AND type = 'reset'`;
    await sql`
      INSERT INTO email_tokens (id, user_id, token_hash, type, expires_at)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${hash}, 'reset', ${expiresAt})
    `;

    sendEmail(email, "Reset your password", resetPasswordBody(raw)).catch(console.error);
  }

  return c.json({ message: "If an account exists, a reset link has been sent." });
});

// POST /api/auth/reset-password
auth.post("/reset-password", passwordResetLimit, async (c) => {
  const body = await c.req.json();
  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return c.json({ error: "Token and new password are required" }, 400);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [record] = await sql`
    SELECT * FROM email_tokens WHERE token_hash = ${tokenHash} AND type = 'reset' AND used_at IS NULL
  `;

  if (!record) return c.json({ error: "Invalid or expired token" }, 400);
  if (new Date(record.expires_at) < new Date()) {
    return c.json({ error: "Token has expired" }, 400);
  }

  await sql`UPDATE users SET password_hash = ${hashSync(newPassword, 10)} WHERE id = ${record.user_id}`;
  await sql`UPDATE email_tokens SET used_at = NOW() WHERE id = ${record.id}`;

  return c.json({ message: "Password reset successfully" });
});

// GET /api/auth/verify-email?token=...
auth.get("/verify-email", verifyEmailLimit, async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token is required" }, 400);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [record] = await sql`
    SELECT * FROM email_tokens WHERE token_hash = ${tokenHash} AND type = 'verify' AND used_at IS NULL
  `;

  if (!record) return c.json({ error: "Invalid or expired token" }, 400);
  if (new Date(record.expires_at) < new Date()) {
    return c.json({ error: "Token has expired" }, 400);
  }

  await sql`UPDATE users SET email_verified_at = NOW() WHERE id = ${record.user_id}`;
  await sql`UPDATE email_tokens SET used_at = NOW() WHERE id = ${record.id}`;

  return c.json({ message: "Email verified" });
});

// POST /api/auth/resend-verification
auth.post("/resend-verification", authMiddleware, resendVerifyLimit, async (c) => {
  const userId = c.get("userId");
  const user = c.get("user") as any;

  if (user.email_verified_at) {
    return c.json({ error: "Email already verified" }, 400);
  }

  await sql`DELETE FROM email_tokens WHERE user_id = ${userId} AND type = 'verify'`;

  const { raw, hash } = generateEmailToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO email_tokens (id, user_id, token_hash, type, expires_at)
    VALUES (${crypto.randomUUID()}, ${userId}, ${hash}, 'verify', ${expiresAt})
  `;

  sendEmail(user.email, "Verify your account", verifyEmailBody(raw)).catch(console.error);

  return c.json({ message: "Verification email sent" });
});

export default auth;
