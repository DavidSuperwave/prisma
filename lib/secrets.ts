/**
 * AES-256-GCM helpers for per-workspace integration credentials.
 *
 * Key source: process.env.PRISMA_SECRETS_KEY — base64-encoded 32 bytes.
 * In dev we fall back to a stable derived key from SUPABASE_SERVICE_ROLE_KEY
 * so local workflows don't crash, but production MUST set PRISMA_SECRETS_KEY
 * explicitly.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

export class SecretsKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsKeyError";
  }
}

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PRISMA_SECRETS_KEY?.trim();
  if (raw) {
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      throw new SecretsKeyError("PRISMA_SECRETS_KEY must be base64-encoded.");
    }
    if (buf.length !== 32) {
      // Accept hex fallback for convenience.
      const hex = Buffer.from(raw, "hex");
      if (hex.length === 32) {
        cachedKey = hex;
        return cachedKey;
      }
      throw new SecretsKeyError("PRISMA_SECRETS_KEY must decode to 32 bytes.");
    }
    cachedKey = buf;
    return cachedKey;
  }
  if (process.env.NODE_ENV === "production") {
    throw new SecretsKeyError("PRISMA_SECRETS_KEY is required in production.");
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "prisma-dev-secrets-key";
  cachedKey = createHash("sha256").update(`prisma-secrets::${fallback}`).digest();
  return cachedKey;
}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(envelope: EncryptedSecret): string {
  const key = deriveKey();
  const iv = Buffer.from(envelope.iv, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

/** Convenience: returns { ok: false, error } instead of throwing. */
export function tryDecryptSecret(envelope: EncryptedSecret):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: decryptSecret(envelope) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Decrypt failed" };
  }
}
