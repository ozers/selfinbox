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

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
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
