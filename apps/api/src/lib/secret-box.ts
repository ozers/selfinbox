import crypto from "node:crypto";

// AES-256-GCM envelope for values that must be retrievable in plaintext
// (e.g. SMTP credentials the user pastes into Apple Mail / Thunderbird).
// The key is derived from ENCRYPTION_KEY when provided, otherwise from
// JWT_SECRET. Both inputs are HKDF-stretched with a per-deploy salt so
// rotating JWT_SECRET also rotates the encryption key.
//
// Storage format (string): "v1:" + base64(iv) + ":" + base64(ciphertext+tag)
//   - iv:        12 bytes (GCM standard)
//   - tag:       16 bytes appended to ciphertext (Node convention)
//
// Forward-compat: any future scheme should bump the "v1" prefix so we can
// detect and migrate values lazily on read.

const PREFIX = "v1:";
const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const material =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "";
  if (material.length < 32) {
    throw new Error("[secret-box] ENCRYPTION_KEY or JWT_SECRET must be at least 32 chars");
  }
  // Salt is a stable per-deploy constant. Don't expose this — its job is
  // domain separation between subsystems that share the same input secret.
  const salt = Buffer.from("selfinbox/secret-box/v1");
  const derived = crypto.hkdfSync("sha256", material, salt, Buffer.from("smtp-credential"), 32);
  cachedKey = Buffer.from(derived as ArrayBuffer);
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString("base64") + ":" + Buffer.concat([enc, tag]).toString("base64");
}

export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext value (pre-encryption). Return as-is so existing
    // rows continue to work; they will be re-encrypted on next regenerate.
    return value;
  }
  const rest = value.slice(PREFIX.length);
  const [ivB64, blobB64] = rest.split(":");
  if (!ivB64 || !blobB64) throw new Error("Invalid ciphertext");
  const iv = Buffer.from(ivB64, "base64");
  const blob = Buffer.from(blobB64, "base64");
  if (iv.length !== IV_LEN || blob.length < TAG_LEN) throw new Error("Invalid ciphertext");
  const ct = blob.subarray(0, blob.length - TAG_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
