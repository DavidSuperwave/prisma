/**
 * Confirm-before-commit tokens for agent write tools.
 *
 * Flow:
 *   1. Agent calls a write tool with dryRun: true.
 *   2. Handler resolves targets, builds a canonical proposal, signs it with
 *      signProposal() and returns it in the tool_result.
 *   3. Chat UI shows a confirmation card with the proposal + token.
 *   4. After the user confirms, the agent reissues the same tool call with
 *      dryRun: false and the confirmToken the proposal carried.
 *   5. Handler calls verifyProposal(token, sameProposal) before committing;
 *      a mismatch or expired token aborts the write.
 *
 * The signed payload MUST include the fully-resolved proposal (target ids,
 * diffs, counts, etc.) so the agent cannot swap targets between steps.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 5 * 60;
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw =
    process.env.AGENT_TOOL_CONFIRM_SECRET?.trim() ||
    process.env.PRISMA_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const seed = raw && raw.length > 0 ? raw : "prisma-dev-confirm-secret";
  cachedKey = createHash("sha256").update(`prisma-confirm::${seed}`).digest();
  return cachedKey;
}

/** Canonicalize a JSON value so signing is stable across key ordering. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return "null";
}

function fingerprint(proposal: unknown): string {
  return createHash("sha256").update(canonicalize(proposal)).digest("hex");
}

export type ConfirmToken = {
  token: string;
  expiresAt: string;
  fingerprint: string;
};

export function signProposal(proposal: unknown): ConfirmToken {
  const fp = fingerprint(proposal);
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${VERSION}.${fp}.${exp}`;
  const sig = createHmac("sha256", deriveKey()).update(payload).digest("hex");
  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    fingerprint: fp,
  };
}

export type VerifyResult =
  | { ok: true; expiresAt: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "fingerprint_mismatch" };

export function verifyProposal(token: unknown, proposal: unknown): VerifyResult {
  if (typeof token !== "string" || !token) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [version, fp, expStr, sig] = parts;
  if (version !== VERSION) return { ok: false, reason: "malformed" };
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed" };

  const payload = `${version}.${fp}.${expStr}`;
  const expectedSig = createHmac("sha256", deriveKey()).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(sigBuf, expectedBuf)) return { ok: false, reason: "bad_signature" };

  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: "expired" };

  const actualFp = fingerprint(proposal);
  if (actualFp !== fp) return { ok: false, reason: "fingerprint_mismatch" };

  return { ok: true, expiresAt: new Date(exp * 1000).toISOString() };
}
