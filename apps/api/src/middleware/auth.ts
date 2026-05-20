import { Context, Next } from "hono";
import { jwtVerify } from "jose";
import sql from "../db.js";
import type { AppVariables } from "../lib/context.js";

const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("[auth] FATAL: JWT_SECRET env var is required in production");
    process.exit(1);
  }
  console.warn("[auth] JWT_SECRET not set — using insecure dev fallback. DO NOT deploy without setting JWT_SECRET.");
}

const EFFECTIVE_SECRET = JWT_SECRET || "selfinbox-dev-secret-do-not-use-in-prod";

export function getJwtSecret() {
  return new TextEncoder().encode(EFFECTIVE_SECRET);
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
