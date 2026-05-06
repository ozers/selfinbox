import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import type { AppVariables } from "../lib/context.js";
import sql from "../db.js";
import { authMiddleware, getJwtSecret } from "../middleware/auth.js";
import { createCloudflareDnsRecords } from "../lib/cloudflare-dns.js";

const oauth = new Hono<{ Variables: AppVariables }>();

const CF_AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";

function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:3001").replace(/\/$/, "");
}

// GET /api/oauth/cloudflare/authorize  (protected — called by frontend)
oauth.get("/cloudflare/authorize", authMiddleware, async (c) => {
  const clientId = process.env.CLOUDFLARE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: "Cloudflare OAuth is not configured on this server" }, 503);
  }

  const userId = c.get("userId");
  const domainId = c.req.query("domainId");
  if (!domainId) return c.json({ error: "domainId is required" }, 400);

  const [domain] = await sql`SELECT id FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) return c.json({ error: "Domain not found" }, 404);

  // Sign a short-lived state JWT containing domainId + userId
  const state = await new SignJWT({ domainId, userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(getJwtSecret());

  const redirectUri = `${getAppUrl()}/api/oauth/cloudflare/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "zone:read dns_records:edit",
    state,
  });

  return c.json({ url: `${CF_AUTH_URL}?${params.toString()}` });
});

// GET /api/oauth/cloudflare/callback  (public — Cloudflare redirects here)
oauth.get("/cloudflare/callback", async (c) => {
  const appUrl = getAppUrl();
  const doneUrl = `${appUrl}/oauth/cloudflare/done`;

  const error = c.req.query("error");
  if (error) {
    return c.redirect(`${doneUrl}?error=${encodeURIComponent(error)}`);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.redirect(`${doneUrl}?error=missing_params`);
  }

  // Verify state JWT
  let domainId: string;
  let userId: string;
  try {
    const { payload } = await jwtVerify(state, getJwtSecret());
    domainId = payload.domainId as string;
    userId = payload.userId as string;
  } catch {
    return c.redirect(`${doneUrl}?error=invalid_state`);
  }

  // Exchange code for access token
  const clientId = process.env.CLOUDFLARE_CLIENT_ID!;
  const clientSecret = process.env.CLOUDFLARE_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/cloudflare/callback`;

  let accessToken: string;
  try {
    const tokenRes = await fetch(CF_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error("No access token in response");
    accessToken = tokenData.access_token;
  } catch (err: any) {
    console.error("[oauth] Cloudflare token exchange failed:", err);
    return c.redirect(`${doneUrl}?error=${encodeURIComponent("Token exchange failed")}`);
  }

  // Get domain
  const [domain] = await sql`SELECT * FROM domains WHERE id = ${domainId} AND user_id = ${userId}`;
  if (!domain) {
    return c.redirect(`${doneUrl}?error=domain_not_found`);
  }

  // Create DNS records via Cloudflare API
  try {
    const { created, skipped } = await createCloudflareDnsRecords(accessToken, domain.domain, domainId);
    return c.redirect(`${doneUrl}?success=true&created=${created}&skipped=${skipped}`);
  } catch (err: any) {
    console.error("[oauth] Cloudflare DNS setup failed:", err);
    return c.redirect(`${doneUrl}?error=${encodeURIComponent(err.message || "DNS setup failed")}`);
  }
});

export default oauth;
