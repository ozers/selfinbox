import net from "node:net";

// ── Optional ClamAV integration ──────────────────────────────────────────────
//
// If CLAMAV_HOST is set, every attachment buffer is streamed to a clamd
// daemon via the INSTREAM command and the verdict is used to flag the
// attachment. If unset, scanning is a no-op so self-hosters who don't run
// clamd aren't blocked from receiving mail.
//
// Wire format reference: https://docs.clamav.net/manual/Usage/Scanning.html#clamd

const CLAMAV_HOST = process.env.CLAMAV_HOST || "";
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT || "3310", 10);
const CLAMAV_TIMEOUT_MS = parseInt(process.env.CLAMAV_TIMEOUT_MS || "10000", 10);
const CLAMAV_CHUNK_SIZE = 64 * 1024;

export function isClamavEnabled(): boolean {
  return CLAMAV_HOST.length > 0;
}

export type ClamavVerdict =
  | { status: "clean" }
  | { status: "infected"; signature: string }
  | { status: "error"; message: string };

/**
 * Scan a buffer against clamd's INSTREAM endpoint. Returns 'clean' on OK,
 * 'infected' with the signature name on a hit, or 'error' on connection /
 * protocol failure (callers should treat 'error' as fail-open or fail-closed
 * per their policy; this module is conservative and does not block delivery
 * on its own).
 */
export async function scanBuffer(buffer: Buffer): Promise<ClamavVerdict> {
  if (!isClamavEnabled()) return { status: "clean" };

  return new Promise<ClamavVerdict>((resolve) => {
    const socket = new net.Socket();
    let response = "";
    let settled = false;

    const settle = (v: ClamavVerdict) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* noop */ }
      resolve(v);
    };

    socket.setTimeout(CLAMAV_TIMEOUT_MS);
    socket.on("timeout", () => settle({ status: "error", message: "clamd timeout" }));
    socket.on("error", (err) => settle({ status: "error", message: err.message }));
    socket.on("data", (chunk) => { response += chunk.toString("utf8"); });
    socket.on("close", () => {
      if (settled) return;
      const line = response.trim();
      if (line.endsWith("OK")) return settle({ status: "clean" });
      if (line.endsWith("FOUND")) {
        const m = line.match(/:\s*(.+?)\s+FOUND/);
        return settle({ status: "infected", signature: m?.[1] || "unknown" });
      }
      settle({ status: "error", message: `unexpected clamd response: ${line.slice(0, 200)}` });
    });

    socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
      socket.write("zINSTREAM\0");
      let offset = 0;
      while (offset < buffer.length) {
        const slice = buffer.subarray(offset, Math.min(offset + CLAMAV_CHUNK_SIZE, buffer.length));
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(slice.length, 0);
        socket.write(sizeBuf);
        socket.write(slice);
        offset += slice.length;
      }
      // Zero-length chunk terminates the stream.
      const term = Buffer.alloc(4);
      term.writeUInt32BE(0, 0);
      socket.write(term);
    });
  });
}

/**
 * Convenience: scan only if clamd is configured; otherwise return clean.
 * Errors are logged and treated as clean (fail-open) — the rationale being
 * that a sysadmin who turns on clamd should not lose all mail when clamd
 * crashes; alerting on the error log is the right escalation.
 */
export async function scanBufferIfEnabled(buffer: Buffer, label: string): Promise<ClamavVerdict> {
  if (!isClamavEnabled()) return { status: "clean" };
  const v = await scanBuffer(buffer);
  if (v.status === "error") {
    console.error(`[clamav] scan error for ${label}: ${v.message}`);
  } else if (v.status === "infected") {
    console.warn(`[clamav] INFECTED ${label}: ${v.signature}`);
  }
  return v;
}
