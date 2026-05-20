import { PutObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from "file-type";
import crypto from "node:crypto";
import path from "node:path";
import type { Attachment as MailAttachment } from "mailparser";
import { s3, S3_INBOUND_BUCKET } from "./aws.js";
import { scanBufferIfEnabled } from "./clamav.js";

// ── Config (env-overridable; sane defaults for self-hosters) ─────────────────

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MAX_ATTACHMENTS_PER_EMAIL = envInt("ATTACHMENT_MAX_COUNT", 20);
export const MAX_ATTACHMENT_SIZE_BYTES = envInt("ATTACHMENT_MAX_SIZE_MB", 25) * 1024 * 1024;
export const MAX_TOTAL_SIZE_BYTES = envInt("ATTACHMENT_MAX_TOTAL_MB", 40) * 1024 * 1024;

// Extensions that ship native code or active content. Default blocklist —
// override via ATTACHMENT_EXT_BLOCKLIST (comma-separated, leading dot
// optional). Items here aren't deleted; they're marked quarantined so the
// user can still opt-in to download with an explicit warning.
const DEFAULT_BLOCKLIST = [
  "exe", "scr", "bat", "cmd", "com", "vbs", "vbe", "js", "jse", "wsh", "wsf",
  "msi", "msp", "mst", "lnk", "iso", "img", "jar", "ps1", "psm1", "reg",
  "hta", "cpl", "scf", "pif", "gadget", "inf", "ins", "isp", "msc",
  "dll", "so", "dylib", "app", "deb", "rpm", "apk", "dmg",
];

function parseBlocklist(): Set<string> {
  const raw = process.env.ATTACHMENT_EXT_BLOCKLIST;
  const list = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase().replace(/^\./, "")).filter(Boolean)
    : DEFAULT_BLOCKLIST;
  return new Set(list);
}

const BLOCKLIST = parseBlocklist();

// Active-content MIME types that must never be served inline regardless of
// whether the extension was on the blocklist.
const ACTIVE_MIME_PREFIXES = ["text/html", "image/svg", "application/xhtml", "application/javascript", "text/javascript"];

// Image types we will allow to render inline (after magic-byte verification).
export const INLINE_IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon",
]);

// ── Sanitization helpers ─────────────────────────────────────────────────────

/**
 * Sanitize an untrusted attachment filename. Strips path separators, control
 * characters, bidi overrides (the `coexe.doc` trick), null bytes, and
 * normalizes unicode. Falls back to `attachment-{n}` if nothing usable
 * remains.
 */
export function sanitizeFilename(raw: string | undefined, fallbackIndex: number): string {
  if (!raw) return `attachment-${fallbackIndex}`;
  let s = raw.normalize("NFKC");
  // Strip directory components — `path.basename` handles both / and \ on posix.
  s = path.basename(s.replace(/\\/g, "/"));
  // Drop control chars + bidi overrides (U+202A..U+202E, U+2066..U+2069).
  s = s.replace(/[\x00-\x1f\x7f‪-‮⁦-⁩]/g, "");
  // Collapse whitespace + trim.
  s = s.replace(/\s+/g, " ").trim();
  // Forbid leading dots (hidden files on unix).
  s = s.replace(/^\.+/, "");
  // Cap length (255 bytes is the typical filesystem limit, but be conservative).
  if (Buffer.byteLength(s, "utf8") > 200) {
    const ext = path.extname(s);
    const base = s.slice(0, s.length - ext.length);
    s = base.slice(0, 200 - Buffer.byteLength(ext, "utf8")) + ext;
  }
  return s || `attachment-${fallbackIndex}`;
}

function extOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

function isActiveMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return ACTIVE_MIME_PREFIXES.some((p) => m.startsWith(p));
}

// ── S3 ───────────────────────────────────────────────────────────────────────

function s3Key(userId: string, emailId: string, idx: number): string {
  return `attachments/${userId}/${emailId}/${idx}`;
}

// ── Metadata shape (matches what the API serializer returns + the JSONB blob) ─

export interface AttachmentMeta {
  idx: number;
  filename: string;
  contentType: string;        // sniffed/canonical type we trust
  declaredType: string;       // what the email claimed
  size: number;
  contentId: string | null;   // for inline rendering (cid:)
  isInline: boolean;
  s3Key: string;
  sha256: string;
  quarantined: boolean;
  quarantineReason: string | null;
}

// ── Main ingest entry point ──────────────────────────────────────────────────

export interface IngestResult {
  attachments: AttachmentMeta[];
  hasQuarantined: boolean;
}

/**
 * Process attachments from a parsed inbound email: enforce limits, sniff
 * magic bytes, sanitize filenames, upload to S3, and return metadata to be
 * stored on the email row. Never throws on a single bad attachment — that
 * attachment is dropped from the result instead, so a malformed item can't
 * block delivery of the legitimate ones.
 */
export async function ingestAttachments(
  raw: MailAttachment[] | undefined,
  userId: string,
  emailId: string,
): Promise<IngestResult> {
  if (!raw || raw.length === 0) return { attachments: [], hasQuarantined: false };

  const out: AttachmentMeta[] = [];
  let totalSize = 0;
  let hasQuarantined = false;

  const items = raw.slice(0, MAX_ATTACHMENTS_PER_EMAIL);
  if (raw.length > MAX_ATTACHMENTS_PER_EMAIL) {
    console.warn(`[attachments] ${emailId}: dropped ${raw.length - MAX_ATTACHMENTS_PER_EMAIL} attachments (exceeded count limit)`);
  }

  for (let i = 0; i < items.length; i++) {
    const att = items[i];
    if (!att.content) continue;

    const buffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content as any);
    const size = buffer.byteLength;

    if (size > MAX_ATTACHMENT_SIZE_BYTES) {
      console.warn(`[attachments] ${emailId}: skipped oversize attachment (${size} bytes)`);
      continue;
    }
    if (totalSize + size > MAX_TOTAL_SIZE_BYTES) {
      console.warn(`[attachments] ${emailId}: total size cap reached, dropping remaining attachments`);
      break;
    }
    totalSize += size;

    const filename = sanitizeFilename(att.filename, i);
    const declaredType = (att.contentType || "application/octet-stream").toLowerCase();

    // Magic-byte sniff. file-type returns undefined for plain text and many
    // legitimate non-binary formats — that's fine; we just fall back to the
    // declared type. The mismatch check only fires when sniffing succeeds.
    let sniffedMime: string | null = null;
    try {
      const sniff = await fileTypeFromBuffer(buffer);
      if (sniff) sniffedMime = sniff.mime.toLowerCase();
    } catch {
      // ignore
    }

    let quarantined = false;
    let quarantineReason: string | null = null;

    // ClamAV (no-op if CLAMAV_HOST unset). Run before extension checks so a
    // genuine virus signature wins over the cosmetic reason.
    const verdict = await scanBufferIfEnabled(buffer, `${emailId}/${i}`);
    if (verdict.status === "infected") {
      quarantined = true;
      quarantineReason = `virus detected: ${verdict.signature}`;
    }

    const ext = extOf(filename);
    if (!quarantined && ext && BLOCKLIST.has(ext)) {
      quarantined = true;
      quarantineReason = `extension .${ext} is on the blocklist`;
    } else if (!quarantined && sniffedMime && isActiveMime(sniffedMime)) {
      // Active content regardless of how it was declared.
      quarantined = true;
      quarantineReason = `active content detected (${sniffedMime})`;
    } else if (!quarantined && sniffedMime && declaredType && declaredType !== "application/octet-stream" && declaredType !== sniffedMime) {
      // Declared vs actual mismatch — could be benign (browsers send wrong
      // MIME all the time) but is also the classic polyglot trick.
      const declaredFamily = declaredType.split("/")[0];
      const sniffedFamily = sniffedMime.split("/")[0];
      if (declaredFamily !== sniffedFamily) {
        quarantined = true;
        quarantineReason = `declared type ${declaredType} does not match actual content ${sniffedMime}`;
      }
    }

    // Canonical content type we trust for serving: prefer sniff over declared.
    const canonicalType = sniffedMime || declaredType;

    const key = s3Key(userId, emailId, i);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    try {
      await s3.send(new PutObjectCommand({
        Bucket: S3_INBOUND_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: canonicalType,
        ServerSideEncryption: "AES256",
        // Filename is NEVER part of the S3 key — only metadata, so a malicious
        // sender can't influence storage paths.
        Metadata: {
          "original-filename-sha256": crypto.createHash("sha256").update(filename).digest("hex"),
        },
      }));
    } catch (err) {
      console.error(`[attachments] ${emailId}: S3 upload failed for idx=${i}:`, err);
      continue;
    }

    const contentId = att.cid ? att.cid.replace(/^<|>$/g, "") : null;
    // mailparser flags inline attachments via contentDisposition === 'inline'
    // OR by referencing them via cid in the HTML body. We only honor inline
    // for verified image MIMEs.
    const requestedInline = att.contentDisposition === "inline" || !!contentId;
    const isInline = requestedInline && !quarantined && INLINE_IMAGE_MIMES.has(canonicalType);

    if (quarantined) hasQuarantined = true;

    out.push({
      idx: i,
      filename,
      contentType: canonicalType,
      declaredType,
      size,
      contentId,
      isInline,
      s3Key: key,
      sha256,
      quarantined,
      quarantineReason,
    });
  }

  return { attachments: out, hasQuarantined };
}
