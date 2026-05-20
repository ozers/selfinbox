import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
import { initDb } from "./db.js";
import auth from "./routes/auth.js";
import domains from "./routes/domains.js";
import emails from "./routes/emails.js";
import smtp from "./routes/smtp.js";
import usage from "./routes/usage.js";
import webhooks from "./routes/webhooks.js";
import cloudflare from "./routes/cloudflare.js";
import oauth from "./routes/oauth.js";
import { startDnsPoller } from "./lib/dns-poller.js";

const app = new Hono();

// CORS: by default accept the local Vite dev server. In production deploys
// where the API serves the built SPA from the same origin, CORS isn't used at
// all. If you serve the frontend from a different origin, set WEB_ORIGIN
// (comma-separated for multiple).
const corsOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "/api/*",
  cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/api/auth", auth);
app.route("/api/domains", domains);
app.route("/api/domains", smtp);
app.route("/api/emails", emails);
app.route("/api/usage", usage);
app.route("/api/domains", cloudflare);
app.route("/api/oauth", oauth);
app.route("/api/webhooks", webhooks);

app.get("/health", (c) => c.json({ status: "ok" }));

// Serve built frontend static files
app.use("*", serveStatic({ root: publicDir }));

// SPA fallback — serve index.html for all unmatched routes
app.get("*", (c) => {
  try {
    const html = readFileSync(join(publicDir, "index.html"), "utf-8");
    return c.html(html);
  } catch {
    return c.text("Not found", 404);
  }
});

const port = Number(process.env.PORT) || 3001;

// Pre-boot env check. Only DB + JWT are strictly required to start — without
// them the app can't even authenticate. AWS / FROM_EMAIL are warned on but
// not fatal so the UI can still boot for a demo / no-AWS preview; mail send
// and inbound webhooks return 4xx at request time if those are missing.
{
  const fatal = ["DATABASE_URL", "JWT_SECRET"] as const;
  const missingFatal = fatal.filter((k) => !process.env[k]);
  if (missingFatal.length > 0) {
    console.error("[boot] Missing required environment variables:");
    for (const k of missingFatal) console.error(`  ${k}`);
    console.error("[boot] Edit apps/api/.env and fill them in, then restart.");
    process.exit(1);
  }

  const awsKeys = ["FROM_EMAIL", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_INBOUND_BUCKET"] as const;
  const missingAws = awsKeys.filter((k) => !process.env[k]);
  if (missingAws.length > 0) {
    console.warn("[boot] AWS / SES config incomplete — mail send/receive will fail at request time:");
    for (const k of missingAws) console.warn(`  ${k}`);
  }
}

initDb()
  .then(() => {
    serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
      console.log(`Selfinbox API running on http://0.0.0.0:${port}`);
    });
    startDnsPoller();
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
