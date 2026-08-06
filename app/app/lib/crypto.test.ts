import { describe, it, expect, afterEach } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted, encryptionAvailable, SecretKeyMissing } from "./crypto";

// The failure modes here were verified by hand when encryption shipped (7b955362). Pinning them:
// every one is silent if it regresses — a plaintext write, a wrong-key read, or a tampered value
// accepted all look like normal operation from the outside.

const KEY = process.env.COMPASS_SECRET_KEY;
afterEach(() => { process.env.COMPASS_SECRET_KEY = KEY; });

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const secret = "ATATT3xFfGF0-a-realistic-looking-atlassian-token-192-chars";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("does not leak the plaintext into the ciphertext", () => {
    const secret = "super-secret-token";
    expect(encryptSecret(secret)).not.toContain(secret);
  });

  it("produces a different ciphertext each time (fresh IV)", () => {
    // Equal ciphertexts for equal inputs would leak which engagements share a credential.
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("tags its output so a rotation can identify what it is", () => {
    const enc = encryptSecret("x");
    expect(enc.startsWith("enc.v1.")).toBe(true);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.split(".")).toHaveLength(5);          // enc . v1 . iv . tag . ct
  });

  it("is a no-op on already-encrypted input", () => {
    const once = encryptSecret("x");
    expect(encryptSecret(once)).toBe(once);
  });

  it("passes legacy plaintext through unchanged", () => {
    // Deployable before the migration ran; unprefixed values must keep working.
    expect(decryptSecret("plaintext-legacy-token")).toBe("plaintext-legacy-token");
    expect(isEncrypted("plaintext-legacy-token")).toBe(false);
  });

  it("returns '' for empty / null / undefined", () => {
    expect(decryptSecret("")).toBe("");
    expect(decryptSecret(null)).toBe("");
    expect(decryptSecret(undefined)).toBe("");
  });
});

describe("failure modes", () => {
  it("REFUSES to encrypt with no key, rather than falling back to plaintext", () => {
    // The whole point: a silent plaintext fallback would reintroduce the exposure at the exact
    // moment an operator believes it is fixed.
    delete process.env.COMPASS_SECRET_KEY;
    expect(encryptionAvailable()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(SecretKeyMissing);
  });

  it("degrades to '' on the wrong key instead of throwing", () => {
    // Callers are credential resolvers that treat "" as not-configured, so a bad key surfaces as
    // an honest readiness failure rather than a 500 from inside an unrelated workflow.
    const enc = encryptSecret("x");
    process.env.COMPASS_SECRET_KEY = "a-different-key";
    expect(decryptSecret(enc)).toBe("");
  });

  it("rejects a tampered ciphertext via the GCM auth tag", () => {
    const enc = encryptSecret("transfer-1000");
    const [p, v, iv, tag, ct] = enc.split(".");
    const flipped = ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
    expect(decryptSecret([p, v, iv, tag, flipped].join("."))).toBe("");
  });

  it("rejects a truncated value", () => {
    expect(decryptSecret("enc.v1.only-one-segment")).toBe("");
  });
});
