import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type PrismaMcpRolePreset = "intake" | "ops" | "sales" | "custom";

export type PrismaMcpSessionClaims = {
  iss: "prisma";
  aud: "prisma-mcp";
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  workspaceId: string;
  workspaceSlug: string;
  agentId: string;
  rolePreset: PrismaMcpRolePreset;
  toolsInclude?: string[];
  toolsExclude?: string[];
  userId?: string;
};

type IssueSessionTokenInput = {
  workspaceId: string;
  workspaceSlug: string;
  agentId: string;
  rolePreset: PrismaMcpRolePreset;
  toolsInclude?: string[];
  toolsExclude?: string[];
  userId?: string;
};

const ISSUER = "prisma" as const;
const AUDIENCE = "prisma-mcp" as const;
const ALGORITHM = "HS256";
const DEFAULT_TTL_SECONDS = 15 * 60;

function getSigningSecret(): string {
  const configured =
    process.env.PRISMA_MCP_JWT_SECRET?.trim() ||
    process.env.HERMES_API_KEY?.trim() ||
    "";
  if (!configured) {
    throw new Error("PRISMA_MCP_JWT_SECRET (or HERMES_API_KEY fallback) is required for MCP JWT sessions.");
  }
  return configured;
}

function getSessionTtlSeconds(): number {
  const parsed = Number(process.env.PRISMA_MCP_JWT_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.max(60, Math.min(24 * 60 * 60, Math.floor(parsed)));
}

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeSegment(value: string): Record<string, unknown> | null {
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sign(unsignedToken: string, secret: string): string {
  return createHmac("sha256", secret).update(unsignedToken).digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

export function issuePrismaMcpSessionToken(input: IssueSessionTokenInput): {
  token: string;
  issuedAt: string;
  expiresAt: string;
  claims: PrismaMcpSessionClaims;
} {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = getSessionTtlSeconds();
  const normalizedInclude = normalizeStringArray(input.toolsInclude);
  const normalizedExclude = normalizeStringArray(input.toolsExclude);
  const payload: PrismaMcpSessionClaims = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: `${input.workspaceId}:${input.agentId}`,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
    workspaceId: input.workspaceId,
    workspaceSlug: input.workspaceSlug,
    agentId: input.agentId,
    rolePreset: input.rolePreset,
    ...(normalizedInclude ? { toolsInclude: normalizedInclude } : {}),
    ...(normalizedExclude ? { toolsExclude: normalizedExclude } : {}),
    ...(typeof input.userId === "string" && input.userId.trim().length > 0 ? { userId: input.userId.trim() } : {}),
  };

  const header = {
    alg: ALGORITHM,
    typ: "JWT",
  };
  const encodedHeader = encodeSegment(header);
  const encodedPayload = encodeSegment(payload as unknown as Record<string, unknown>);
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(unsigned, getSigningSecret());
  return {
    token: `${unsigned}.${signature}`,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    claims: payload,
  };
}

export function verifyPrismaMcpSessionToken(token: string): PrismaMcpSessionClaims | null {
  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const expected = sign(`${encodedHeader}.${encodedPayload}`, getSigningSecret());
  if (!signaturesMatch(signature, expected)) return null;

  const header = decodeSegment(encodedHeader);
  const payload = decodeSegment(encodedPayload);
  if (!header || !payload) return null;
  if (header.alg !== ALGORITHM || header.typ !== "JWT") return null;

  const iss = payload.iss;
  const aud = payload.aud;
  const iat = Number(payload.iat ?? Number.NaN);
  const exp = Number(payload.exp ?? Number.NaN);
  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : "";
  const workspaceSlug = typeof payload.workspaceSlug === "string" ? payload.workspaceSlug : "";
  const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
  const rolePreset = typeof payload.rolePreset === "string" ? payload.rolePreset : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const jti = typeof payload.jti === "string" ? payload.jti : "";

  if (iss !== ISSUER || aud !== AUDIENCE) return null;
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  if (!workspaceId || !workspaceSlug || !agentId || !sub || !jti) return null;
  if (rolePreset !== "intake" && rolePreset !== "ops" && rolePreset !== "sales" && rolePreset !== "custom") {
    return null;
  }

  const normalizedInclude = normalizeStringArray(payload.toolsInclude);
  const normalizedExclude = normalizeStringArray(payload.toolsExclude);

  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub,
    iat,
    exp,
    jti,
    workspaceId,
    workspaceSlug,
    agentId,
    rolePreset,
    ...(normalizedInclude ? { toolsInclude: normalizedInclude } : {}),
    ...(normalizedExclude ? { toolsExclude: normalizedExclude } : {}),
    ...(typeof payload.userId === "string" && payload.userId.trim().length > 0 ? { userId: payload.userId.trim() } : {}),
  };
}
