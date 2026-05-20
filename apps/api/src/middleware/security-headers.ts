import type { MiddlewareHandler } from "hono";

// Baseline security headers applied to every response. Tight defaults; if
// you embed Selfinbox or load third-party widgets, loosen the CSP via the
// CSP_EXTRA_* env vars rather than relaxing the middleware itself.
//
// HSTS is only emitted when the request looks like it was served over
// HTTPS (either the direct connection or via a trusted proxy header) so
// http://localhost dev still works.

const isProd = process.env.NODE_ENV === "production";

// Allow ops to extend img-src and connect-src without editing code.
// Example: CSP_IMG_SRC="https://cdn.example.com" enables remote tracking
// pixels in email previews if you want them.
const extraImg = (process.env.CSP_IMG_SRC ?? "").trim();
const extraConnect = (process.env.CSP_CONNECT_SRC ?? "").trim();

const CSP = [
  "default-src 'self'",
  // Vite injects inline scripts at dev; we still keep 'self' tight and
  // rely on the dev server proxy for HMR. Production builds are fine.
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // 'data:' for SVG icon sprites and inline previews; 'blob:' for inline
  // email image attachments (cid-mapped blob URLs).
  `img-src 'self' data: blob: https:${extraImg ? " " + extraImg : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${extraConnect ? " " + extraConnect : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const headers = c.res.headers;

    // Don't override per-route CSPs (the attachment route sets a tighter
    // sandbox CSP). Only set when missing.
    if (!headers.has("content-security-policy")) {
      headers.set("Content-Security-Policy", CSP);
    }
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
    headers.set("X-DNS-Prefetch-Control", "off");

    if (isProd) {
      const proto = c.req.header("x-forwarded-proto");
      const url = new URL(c.req.url);
      const isHttps = url.protocol === "https:" || proto === "https";
      if (isHttps) {
        headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      }
    }
  };
}
