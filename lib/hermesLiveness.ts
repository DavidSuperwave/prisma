import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ensureWorkspaceHermesHome, resolveWorkspaceHermesHome } from "@/lib/hermesHome";

type RuntimeCheckResult = {
  ok: boolean;
  path?: string;
  statusCode?: number;
  error?: string;
};

export type WorkspaceHomeFileStatus = {
  exists: boolean;
  sha256: string | null;
  size: number | null;
  modifiedAt: string | null;
  matchesExpected: boolean;
};

export type WorkspaceHomeProbeResult = {
  ok: boolean;
  via: "shim" | "local";
  homePath: string | null;
  files: Record<string, WorkspaceHomeFileStatus>;
  missingRequired: string[];
  mismatched: string[];
  error?: string;
};

export type AgentLivenessProbeResult = {
  ok: boolean;
  runtime: RuntimeCheckResult;
  workspaceHome: WorkspaceHomeProbeResult;
  status: "healthy" | "unreachable" | "drifted";
  message: string;
};

type ProbeAgentLivenessInput = {
  workspaceId: string;
  workspaceSlug?: string;
  agentId?: string | null;
  endpoint: string;
  apiKey: string;
};

type ExpectedSignature = {
  relativePath: string;
  required: boolean;
  sha256: string | null;
};

const REQUIRED_HOME_FILES = ["SOUL.md", "config.yaml", ".env"] as const;

function buildLocalWorkspaceHomeProbe(
  workspaceId: string,
  signatures: ExpectedSignature[],
  error?: string,
): WorkspaceHomeProbeResult {
  const missingRequired = signatures
    .filter((entry) => entry.required && !entry.sha256)
    .map((entry) => entry.relativePath);
  const files = Object.fromEntries(
    signatures.map((entry) => [
      entry.relativePath,
      {
        exists: Boolean(entry.sha256),
        sha256: entry.sha256,
        size: null,
        modifiedAt: null,
        matchesExpected: Boolean(entry.sha256),
      } satisfies WorkspaceHomeFileStatus,
    ]),
  );
  return {
    ok: missingRequired.length === 0,
    via: "local",
    homePath: resolveWorkspaceHermesHome(workspaceId),
    files,
    missingRequired,
    mismatched: [],
    ...(error ? { error } : {}),
  };
}

function normalizeBaseUrl(input: string) {
  return input.trim().replace(/\/+$/, "");
}

async function hashFile(filePath: string) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function collectExpectedWorkspaceHome(workspaceId: string): Promise<{
  homePath: string;
  signatures: ExpectedSignature[];
  files: Record<string, WorkspaceHomeFileStatus>;
}> {
  const homePath = resolveWorkspaceHermesHome(workspaceId);
  const signatures: ExpectedSignature[] = [];
  const files: Record<string, WorkspaceHomeFileStatus> = {};

  for (const relativePath of REQUIRED_HOME_FILES) {
    const absolutePath = path.join(homePath, relativePath);
    try {
      const fileStat = await stat(absolutePath);
      const sha256 = await hashFile(absolutePath);
      signatures.push({ relativePath, required: true, sha256 });
      files[relativePath] = {
        exists: true,
        sha256,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
        matchesExpected: true,
      };
    } catch {
      signatures.push({ relativePath, required: true, sha256: null });
      files[relativePath] = {
        exists: false,
        sha256: null,
        size: null,
        modifiedAt: null,
        matchesExpected: false,
      };
    }
  }

  return { homePath, signatures, files };
}

export async function verifyHermesRuntimeHealth(baseUrl: string, apiKey: string): Promise<RuntimeCheckResult> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const checks = [
    { path: "/health", useAuth: false },
    { path: "/v1/models", useAuth: true },
  ] as const;

  let lastError = "Hermes runtime did not respond.";
  for (const check of checks) {
    try {
      const response = await fetch(`${normalizedBaseUrl}${check.path}`, {
        method: "GET",
        headers: check.useAuth ? { Authorization: `Bearer ${apiKey}` } : undefined,
        cache: "no-store",
      });
      if (response.ok) {
        return { ok: true, path: check.path, statusCode: response.status };
      }
      lastError = `${check.path} returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown Hermes runtime error.";
    }
  }

  return { ok: false, error: lastError };
}

async function probeWorkspaceHomeViaShim(args: {
  workspaceId: string;
  agentId?: string | null;
  signatures: ExpectedSignature[];
}): Promise<WorkspaceHomeProbeResult> {
  const shimUrl = process.env.PRISMA_HERMES_SHIM_URL?.trim();
  if (!shimUrl) {
    return buildLocalWorkspaceHomeProbe(args.workspaceId, args.signatures);
  }

  try {
    const response = await fetch(`${shimUrl.replace(/\/$/, "")}/workspace/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PRISMA_HERMES_SHIM_SHARED_SECRET
          ? { "x-prisma-shim-secret": process.env.PRISMA_HERMES_SHIM_SHARED_SECRET }
          : {}),
      },
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        agentId: args.agentId ?? null,
        expectedFiles: args.signatures,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      ok?: boolean;
      homePath?: string | null;
      missingRequired?: unknown;
      mismatched?: unknown;
      files?: Record<
        string,
        {
          exists?: boolean;
          sha256?: string | null;
          size?: number | null;
          modifiedAt?: string | null;
          matchesExpected?: boolean;
        }
      >;
    };
    if (!response.ok) {
      if (response.status >= 500) {
        return buildLocalWorkspaceHomeProbe(
          args.workspaceId,
          args.signatures,
          payload.error ?? `Shim workspace status failed with ${response.status}; local fallback used.`,
        );
      }
      return {
        ok: false,
        via: "shim",
        homePath: null,
        files: {},
        missingRequired: [],
        mismatched: [],
        error: payload.error ?? `Shim workspace status failed with ${response.status}.`,
      };
    }

    const files = Object.fromEntries(
      Object.entries(payload.files ?? {}).map(([relativePath, value]) => [
        relativePath,
        {
          exists: value.exists === true,
          sha256: typeof value.sha256 === "string" ? value.sha256 : null,
          size: typeof value.size === "number" ? value.size : null,
          modifiedAt: typeof value.modifiedAt === "string" ? value.modifiedAt : null,
          matchesExpected: value.matchesExpected !== false,
        } satisfies WorkspaceHomeFileStatus,
      ]),
    );

    return {
      ok: payload.ok === true,
      via: "shim",
      homePath: typeof payload.homePath === "string" ? payload.homePath : null,
      files,
      missingRequired: Array.isArray(payload.missingRequired)
        ? payload.missingRequired.map((entry) => String(entry))
        : [],
      mismatched: Array.isArray(payload.mismatched)
        ? payload.mismatched.map((entry) => String(entry))
        : [],
    };
  } catch (error) {
    return buildLocalWorkspaceHomeProbe(
      args.workspaceId,
      args.signatures,
      error instanceof Error ? error.message : "Unable to contact Hermes shim.",
    );
  }
}

export async function probeAgentLiveness(input: ProbeAgentLivenessInput): Promise<AgentLivenessProbeResult> {
  await ensureWorkspaceHermesHome({
    workspaceId: input.workspaceId,
    workspaceSlug: input.workspaceSlug,
    agentId: input.agentId ?? null,
  });

  const runtime = await verifyHermesRuntimeHealth(input.endpoint, input.apiKey);
  const expectedHome = await collectExpectedWorkspaceHome(input.workspaceId);
  const workspaceHome = await probeWorkspaceHomeViaShim({
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? null,
    signatures: expectedHome.signatures,
  });

  if (!runtime.ok) {
    return {
      ok: false,
      runtime,
      workspaceHome,
      status: "unreachable",
      message: runtime.error ?? "Runtime unreachable.",
    };
  }

  if (!workspaceHome.ok) {
    const detail =
      workspaceHome.error ??
      (workspaceHome.missingRequired.length > 0
        ? `Missing files: ${workspaceHome.missingRequired.join(", ")}`
        : workspaceHome.mismatched.length > 0
          ? `Workspace home drifted: ${workspaceHome.mismatched.join(", ")}`
          : "Workspace home is not in sync.");
    return {
      ok: false,
      runtime,
      workspaceHome,
      status: "drifted",
      message: detail,
    };
  }

  return {
    ok: true,
    runtime,
    workspaceHome,
    status: "healthy",
    message: "Runtime reachable and workspace home synced.",
  };
}
