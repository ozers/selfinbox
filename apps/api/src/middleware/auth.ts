import { Context, Next } from "hono";
import { jwtVerify } from "jose";
import sql from "../db.js";
import type { AppVariables } from "../lib/context.js";

const JWT_SECRET = process.env.JWT_SECRET || "";

// Fail loudly at module load. Both dev and prod require a real secret —
// the previous fallback ("selfinbox-dev-secret-do-not-use-in-prod") was a
// foot-gun: any code path that bypassed the boot guard would silently
// sign with a hardcoded value. There is no safe default here.
if (!JWT_SECRET) {
  throw new Error("[auth] JWT_SECRET environment variable is required");
}

if (JWT_SECRET.length < 32) {
  throw new Error("[auth] JWT_SECRET must be at least 32 characters");
}

const ENCODED_SECRET = new TextEncoder().encode(JWT_SECRET);

export function getJwtSecret() {
  return ENCODED_SECRET;
}

export async function authMiddleware(c: Context<{ Variables: AppVariables }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = payload.sub as string;

    const [user] = await sql`
      SELECT id, name, email, email_verified_at, suspended_at, created_at
      FROM users WHERE id = ${userId}
    `;

    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    c.set("user", user);
    c.set("userId", userId);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}
