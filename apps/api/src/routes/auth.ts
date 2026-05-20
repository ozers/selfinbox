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

// Bcrypt cost. OWASP 2026 baseline is 12; the prior value (10) is crackable
// on commodity GPUs in hours if a hash dump leaks. Cost 12 ≈ 4x slower hash
// per login (~250ms on modern CPU) — acceptable for a self-host workload.
const BCRYPT_COST = 12;
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string") return "Password is required";
  if (pw.length < MIN_PASSWORD_LEN) return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  if (pw.length > 256) return "Password is too long";
  return null;
}

function validateEmail(email: unknown): string | null {
  if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 254) {
    return "Invalid email address";
  }
  return null;
}

// POST /api/auth/register
auth.post("/register", registerLimit, async (c) => {
  if (process.env.REGISTRATION_ENABLED !== "true") {
    return c.json({ error: "Registration is currently closed." }, 403);
  }

  const body = await c.req.json();
  const { name, email, password } = body;

  if (!name || typeof name !== "string" || name.length > 200) {
    return c.json({ error: "Name is required" }, 400);
  }
  const emailErr = validateEmail(email);
  if (emailErr) return c.json({ error: emailErr }, 400);
  const pwErr = validatePassword(password);
  if (pwErr) return c.json({ error: pwErr }, 400);

  const normalizedEmail = (email as string).toLowerCase().trim();
  const [existing] = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
  if (existing) {
    // Equalize work so timing doesn't reveal the existence branch. We still
    // return 409 here for self-host operator UX (registration is gated by
    // REGISTRATION_ENABLED), but the path takes ~the same time as success.
    hashSync(password, BCRYPT_COST);
    return c.json({ error: "Email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = hashSync(password, BCRYPT_COST);

  await sql`INSERT INTO users (id, name, email, password_hash) VALUES (${id}, ${name}, ${normalizedEmail}, ${passwordHash})`;

  const { raw, hash } = generateEmailToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO email_tokens (id, user_id, token_hash, type, expires_at)
    VALUES (${crypto.randomUUID()}, ${id}, ${hash}, 'verify', ${expiresAt})
  `;

  sendEmail(normalizedEmail, "Verify your account", verifyEmailBody(raw)).catch((err) =>
    console.error("[auth/register] verify email send failed:", err?.message ?? err),
  );

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

  const normalizedEmail = String(email).toLowerCase().trim();
  const [row] = await sql`SELECT * FROM users WHERE email = ${normalizedEmail}`;

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
  const current = c.get("user") as any;
  const body = await c.req.json();
  const { name, email } = body;

  if (!name && !email) {
    return c.json({ error: "Name or email is required" }, 400);
  }

  let normalizedEmail: string | null = null;
  if (email) {
    const emailErr = validateEmail(email);
    if (emailErr) return c.json({ error: emailErr }, 400);
    normalizedEmail = String(email).toLowerCase().trim();
    const [existing] = await sql`SELECT id FROM users WHERE email = ${normalizedEmail} AND id != ${userId}`;
    if (existing) {
      return c.json({ error: "Email already in use" }, 409);
    }
  }

  // If the email is changing, the new address has not been verified.
  // Wipe the verification timestamp and trigger a fresh verify-email send,
  // otherwise an attacker who took over an existing verified account could
  // pivot the "verified" status onto a brand-new attacker-controlled inbox.
  const emailChanged = normalizedEmail !== null && normalizedEmail !== current.email;

  if (name && normalizedEmail && emailChanged) {
    await sql`UPDATE users SET name = ${name}, email = ${normalizedEmail}, email_verified_at = NULL WHERE id = ${userId}`;
  } else if (name && normalizedEmail) {
    await sql`UPDATE users SET name = ${name}, email = ${normalizedEmail} WHERE id = ${userId}`;
  } else if (name) {
    await sql`UPDATE users SET name = ${name} WHERE id = ${userId}`;
  } else if (normalizedEmail && emailChanged) {
    await sql`UPDATE users SET email = ${normalizedEmail}, email_verified_at = NULL WHERE id = ${userId}`;
  } else if (normalizedEmail) {
    await sql`UPDATE users SET email = ${normalizedEmail} WHERE id = ${userId}`;
  }

  if (emailChanged && normalizedEmail) {
    await sql`DELETE FROM email_tokens WHERE user_id = ${userId} AND type = 'verify'`;
    const { raw, hash } = generateEmailToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await sql`
      INSERT INTO email_tokens (id, user_id, token_hash, type, expires_at)
      VALUES (${crypto.randomUUID()}, ${userId}, ${hash}, 'verify', ${expiresAt})
    `;
    sendEmail(normalizedEmail, "Verify your new email", verifyEmailBody(raw)).catch((err) =>
      console.error("[auth/me] verify email send failed:", err?.message ?? err),
    );
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
  const pwErr = validatePassword(newPassword);
  if (pwErr) return c.json({ error: pwErr }, 400);

  const [row] = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;

  if (!compareSync(currentPassword, row.password_hash)) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  await sql`UPDATE users SET password_hash = ${hashSync(newPassword, BCRYPT_COST)} WHERE id = ${userId}`;
  return c.json({ message: "Password updated" });
});

// DELETE /api/auth/me
auth.delete("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");

  // Atomic delete. Without a transaction a partial failure could leave
  // emails / domains pointing at a deleted user_id, breaking FK invariants
  // and orphaning data the user expected to be removed.
  await sql.begin(async (tx) => {
    await tx`DELETE FROM emails WHERE user_id = ${userId}`;
    await tx`DELETE FROM domains WHERE user_id = ${userId}`;
    await tx`DELETE FROM users WHERE id = ${userId}`;
  });

  return c.json({ message: "Account deleted" });
});

// POST /api/auth/forgot-password
auth.post("/forgot-password", passwordResetLimit, async (c) => {
  const body = await c.req.json();
  const { email } = body;

  if (!email) return c.json({ error: "Email is required" }, 400);

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;

  // Always return 200 to avoid leaking whether email exists
  if (user) {
    const { raw, hash } = generateEmailToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await sql`DELETE FROM email_tokens WHERE user_id = ${user.id} AND type = 'reset'`;
    await sql`
      INSERT INTO email_tokens (id, user_id, token_hash, type, expires_at)
      VALUES (${crypto.randomUUID()}, ${user.id}, ${hash}, 'reset', ${expiresAt})
    `;

    sendEmail(normalizedEmail, "Reset your password", resetPasswordBody(raw)).catch((err) =>
      console.error("[auth/forgot] reset email send failed:", err?.message ?? err),
    );
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
  const pwErr = validatePassword(newPassword);
  if (pwErr) return c.json({ error: pwErr }, 400);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [record] = await sql`
    SELECT * FROM email_tokens WHERE token_hash = ${tokenHash} AND type = 'reset' AND used_at IS NULL
  `;

  if (!record) return c.json({ error: "Invalid or expired token" }, 400);
  if (new Date(record.expires_at) < new Date()) {
    return c.json({ error: "Token has expired" }, 400);
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE users SET password_hash = ${hashSync(newPassword, BCRYPT_COST)} WHERE id = ${record.user_id}`;
    await tx`UPDATE email_tokens SET used_at = NOW() WHERE id = ${record.id}`;
  });

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

  await sql.begin(async (tx) => {
    await tx`UPDATE users SET email_verified_at = NOW() WHERE id = ${record.user_id}`;
    await tx`UPDATE email_tokens SET used_at = NOW() WHERE id = ${record.id}`;
  });

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

  sendEmail(user.email, "Verify your account", verifyEmailBody(raw)).catch((err) =>
    console.error("[auth/resend] verify email send failed:", err?.message ?? err),
  );

  return c.json({ message: "Verification email sent" });
});

export default auth;
