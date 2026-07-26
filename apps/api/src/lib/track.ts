/**
 * event-beacon client — fire-and-forget product-event pings to the
 * self-hosted beacon (https://github.com/ozers/event-beacon).
 *
 * No-op unless BEACON_URL + BEACON_KEY are set, so tests/dev without
 * config stay silent. Never throws, never blocks the request path.
 * No PII: distinctId is the opaque user id, never an email.
 */
const BEACON_URL = process.env.BEACON_URL;
const BEACON_KEY = process.env.BEACON_KEY; // per-app key (EB-...) — also identifies the project

export function track(
  event: string,
  props: Record<string, unknown> = {},
  distinctId: string | null = null,
): void {
  if (!BEACON_URL || !BEACON_KEY) return;
  fetch(`${BEACON_URL}/track`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${BEACON_KEY}` },
    body: JSON.stringify({ event, props, distinct_id: distinctId }),
  }).catch(() => {
    // swallow — analytics must never break the app
  });
}
