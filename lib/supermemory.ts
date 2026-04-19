/**
 * Supermemory client wrapper.
 *
 * Semantic memory store for cross-agent context. The canonical tenant tag
 * scheme lives in `TENANT.md`. All reads/writes should pass a `containerTags`
 * array containing at least one `prismaalalegal_*` tag.
 *
 * Write failures are non-fatal for the hot path: callers should log the
 * failure and continue, because Postgres is the authoritative store.
 */

const SUPERMEMORY_BASE_URL = "https://api.supermemory.ai/v3";

export type SupermemoryWriteArgs = {
  content: string;
  containerTags: string[];
  metadata?: Record<string, unknown>;
};

export type SupermemorySearchArgs = {
  query: string;
  containerTags: string[];
  limit?: number;
  filter?: Record<string, unknown>;
};

export type SupermemorySearchHit = {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type SupermemoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean };

function apiKey(): string | null {
  const key = process.env.SUPERMEMORY_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function hasSupermemoryConfig(): boolean {
  return Boolean(apiKey());
}

async function call<T>(
  path: string,
  init: RequestInit,
): Promise<SupermemoryResult<T>> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error: "SUPERMEMORY_API_KEY is not configured",
      retryable: false,
    };
  }
  try {
    const response = await fetch(`${SUPERMEMORY_BASE_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Supermemory ${response.status}: ${text || response.statusText}`,
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const data = (await response.json().catch(() => ({}))) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}

export async function storeMemory(
  args: SupermemoryWriteArgs,
): Promise<SupermemoryResult<{ id?: string }>> {
  validateTags(args.containerTags);
  return call<{ id?: string }>("/memories", {
    method: "POST",
    body: JSON.stringify({
      content: args.content,
      containerTags: args.containerTags,
      metadata: args.metadata ?? {},
    }),
  });
}

export async function searchMemory(
  args: SupermemorySearchArgs,
): Promise<SupermemoryResult<{ results: SupermemorySearchHit[] }>> {
  validateTags(args.containerTags);
  return call<{ results: SupermemorySearchHit[] }>("/search", {
    method: "POST",
    body: JSON.stringify({
      q: args.query,
      containerTags: args.containerTags,
      limit: args.limit ?? 10,
      filter: args.filter ?? {},
    }),
  });
}

/**
 * Record a single conversation turn (user/assistant/system/tool) into
 * Supermemory under the agent's `prisma:<workspaceId>:<agentId>` namespace.
 *
 * No-ops when `SUPERMEMORY_API_KEY` is not configured so callers can invoke it
 * unconditionally. Failures are non-fatal from the caller's perspective; the
 * returned `SupermemoryResult` should be logged but the caller should NOT
 * throw on `ok: false` in the chat hot path (Postgres remains the authority).
 *
 * Phase 3 leaves this export unused. A follow-up phase will wire it into
 * `app/api/chat/route.ts`.
 */
export async function recordConversationTurn(args: {
  workspaceId: string;
  agentId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<SupermemoryResult<{ id?: string } | { skipped: true }>> {
  if (!hasSupermemoryConfig()) {
    return { ok: true, data: { skipped: true } };
  }
  const namespace = `prisma:${args.workspaceId}:${args.agentId}`;
  const result = await storeMemory({
    content: args.content,
    containerTags: [
      namespace,
      `prisma:workspace:${args.workspaceId}`,
      `prisma:agent:${args.agentId}`,
    ],
    metadata: {
      ...(args.metadata ?? {}),
      role: args.role,
      workspace_id: args.workspaceId,
      agent_id: args.agentId,
      recorded_at: new Date().toISOString(),
    },
  });
  return result;
}

const FORBIDDEN_TAG_PREFIXES = ["client:alalegal", "client:prismaalalegal"];

function validateTags(tags: string[]): void {
  for (const tag of tags) {
    for (const forbidden of FORBIDDEN_TAG_PREFIXES) {
      if (tag.startsWith(forbidden)) {
        throw new Error(
          `Supermemory tag "${tag}" uses forbidden legacy prefix "${forbidden}". ` +
            "See TENANT.md for the canonical tag scheme.",
        );
      }
    }
  }
}
