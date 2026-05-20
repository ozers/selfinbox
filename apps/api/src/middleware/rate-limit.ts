import type { MiddlewareHandler } from "hono";

// In-memory sliding-window rate limiter. Fine for single-process self-host
// deploys (the project's stated topology). If you scale to multiple API
// pods, swap the store for Redis or rely on a Cloudflare / nginx layer in
// front — both are common with this app and would protect every replica.

type Bucket = { hits: number[]; };
const store = new Map<string, Bucket>();

// Sweep stale keys every minute so the map doesn't grow unbounded under
// scanner traffic. We rely on Node keeping the timer alive; in tests with
// fake timers this is a no-op.
const SWEEP_INTERVAL_MS = 60_000;
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // anything older than 1h is dead
  for (const [key, bucket] of store) {
    bucket.hits = bucket.hits.filter((t) => t > cutoff);
    if (bucket.hits.length === 0) store.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref?.();

// X-Forwarded-For / X-Real-IP are trivially forgeable. We only honor them
// when TRUST_PROXY is explicitly enabled — for self-host deploys without a
// reverse proxy this leaves the socket address as the only signal an
// attacker can't spoof, preventing trivial rate-limit bypass by rotating
// the XFF header on each request.
//
//   TRUST_PROXY=true        — honor XFF / X-Real-IP unconditionally
//   TRUST_PROXY=<unset/0>   — ignore XFF / X-Real-IP (default)
//
// In a future iteration we could parse an allowlist of trusted proxy IPs.
const TRUST_PROXY = (() => {
  const v = (process.env.TRUST_PROXY ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
})();

function clientIp(c: Parameters<MiddlewareHandler>[0]): string {
  if (TRUST_PROXY) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = c.req.header("x-real-ip");
    if (real) return real.trim();
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Bucket scope. Default: route path. Different routes share IP quotas only if you pass the same scope. */
  scope?: string;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max, scope } = opts;
  return async (c, next) => {
    const ip = clientIp(c);
    const key = `${scope ?? c.req.path}:${ip}`;
    const now = Date.now();
    const bucket = store.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= max) {
      const oldest = bucket.hits[0]!;
      const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
      c.header("Retry-After", String(retryAfterSec));
      return c.json(
        { error: "Too many requests. Try again later." },
        429
      );
    }

    bucket.hits.push(now);
    store.set(key, bucket);
    return next();
  };
}
