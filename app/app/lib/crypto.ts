import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Secrets at rest — envelope encryption for the credential columns on `engagement`.
//
// A control tower holds MANY clients' credentials, so one database compromise (a leaked
// service-role key, console access, a backup) would otherwise expose every client's Atlassian
// or Graph account at once. Encrypting in the app rather than with pgcrypto keeps the key out
// of the database entirely: reading the rows is no longer enough.
//
// This is honest about what it is: encryption at rest with a key held in the environment. It
// defends against database exposure, NOT against a compromised app server (which by definition
// holds the key). The stronger answer is per-engagement OAuth so long-lived tokens are never
// stored at all — see compass/framework/mvp-brd.md.
//
// Format: `enc.v1.<iv>.<tag>.<ciphertext>`, all base64url. The version segment exists so a key
// rotation can re-wrap without guessing what an unprefixed value is.
//
// Backward compatible BY DESIGN: `decryptSecret` returns any unprefixed value unchanged, so
// tokens written before this shipped keep working. `isEncrypted` is what a migration uses to
// find them.

const PREFIX = "enc.v1.";
const ALGO = "aes-256-gcm";

export class SecretKeyMissing extends Error {
  constructor() {
    super(
      "COMPASS_SECRET_KEY is not set, so credentials cannot be encrypted. Generate one with " +
      "`openssl rand -base64 32` and add it to the environment. Refusing to store a secret in " +
      "plaintext.",
    );
    this.name = "SecretKeyMissing";
  }
}

/** The 32-byte key, derived from COMPASS_SECRET_KEY. Any length of input is accepted (hashed to
 *  32 bytes) so operators aren't forced to produce an exactly-32-byte value. */
function key(): Buffer | null {
  const raw = process.env.COMPASS_SECRET_KEY;
  if (!raw || !raw.trim()) return null;
  return createHash("sha256").update(raw.trim()).digest();
}

export function encryptionAvailable(): boolean {
  return key() !== null;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a secret for storage. Throws `SecretKeyMissing` when no key is configured — refusing
 * loudly, because the alternative (falling back to plaintext) would silently reintroduce exactly
 * the exposure this exists to close, at the moment an operator believes it is fixed.
 *
 * Already-encrypted input is returned unchanged, so callers can be careless about double-wrapping.
 */
export function encryptSecret(plain: string): string {
  if (isEncrypted(plain)) return plain;
  const k = key();
  if (!k) throw new SecretKeyMissing();
  const iv = randomBytes(12);                       // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGO, k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64url")).join(".");
}

/**
 * Decrypt a stored secret. Unprefixed values are legacy plaintext and are returned as-is, so
 * this can be dropped in front of every read before any migration has run.
 *
 * Returns "" when a value IS encrypted but cannot be decrypted (wrong key, tampering, truncation).
 * Deliberately empty rather than throwing: the callers are credential resolvers that already
 * treat "" as "not configured", so a bad key degrades to an honest not-configured failure — and
 * the readiness probe then reports it — instead of a 500 from deep inside an unrelated workflow.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!isEncrypted(stored)) return stored;          // legacy plaintext
  const k = key();
  if (!k) return "";
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(".");
    if (!ivB64 || !tagB64 || !ctB64) return "";
    const decipher = createDecipheriv(ALGO, k, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch { return ""; }
}
