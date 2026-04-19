/**
 * Centralized client for the OpenClaw multi-agent gateway.
 *
 * - Every call logs endpoint, latency, status.
 * - Error classification: TIMEOUT, CONNECTION_REFUSED, AUTH_FAILURE,
 *   INVALID_RESPONSE, UNAVAILABLE, UNKNOWN.
 * - If `OPENCLAW_AGENT_URL` is unset, calls return
 *   `{ ok: false, classification: "UNAVAILABLE" }` without attempting
 *   network I/O so local dev does not break.
 *
 * The draft/reply routes should treat a failed call as a degraded state:
 * surface a banner but never block manual operator replies.
 */

export type OpenclawErrorClass =
  | "TIMEOUT"
  | "CONNECTION_REFUSED"
  | "AUTH_FAILURE"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type OpenclawResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | {
      ok: false;
      error: string;
      classification: OpenclawErrorClass;
      latencyMs: number;
      retryable: boolean;
    };

function baseUrl(): string | null {
  const raw = process.env.OPENCLAW_AGENT_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function apiKey(): string | undefined {
  return process.env.OPENCLAW_API_KEY?.trim() || undefined;
}

export function hasOpenclawConfig(): boolean {
  return Boolean(baseUrl());
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<OpenclawResult<T>> {
  const root = baseUrl();
  const startedAt = Date.now();

  if (!root) {
    console.warn("[openclaw]", path, "skipped: OPENCLAW_AGENT_URL not set");
    return {
      ok: false,
      error: "OPENCLAW_AGENT_URL is not configured",
      classification: "UNAVAILABLE",
      latencyMs: 0,
      retryable: false,
    };
  }

  const timeoutMs = init.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    const key = apiKey();
    if (key) {
      headers.authorization = `Bearer ${key}`;
    }

    const response = await fetch(`${root}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    if (response.status === 401 || response.status === 403) {
      const text = await response.text().catch(() => "");
      console.error("[openclaw]", path, "auth failure", { latencyMs, status: response.status });
      return {
        ok: false,
        error: text || response.statusText,
        classification: "AUTH_FAILURE",
        latencyMs,
        retryable: false,
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[openclaw]", path, "non-2xx", { latencyMs, status: response.status, body: text.slice(0, 200) });
      return {
        ok: false,
        error: text || response.statusText,
        classification: response.status >= 500 ? "UNAVAILABLE" : "UNKNOWN",
        latencyMs,
        retryable: response.status >= 500,
      };
    }

    const data = (await response.json().catch(() => null)) as T | null;
    if (data === null) {
      console.error("[openclaw]", path, "invalid JSON", { latencyMs });
      return {
        ok: false,
        error: "Invalid JSON response",
        classification: "INVALID_RESPONSE",
        latencyMs,
        retryable: false,
      };
    }
    console.log("[openclaw]", path, { latencyMs, status: response.status });
    return { ok: true, data, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if ((error as Error).name === "AbortError") {
      console.error("[openclaw]", path, "timeout", { latencyMs, timeoutMs });
      return { ok: false, error: `Timeout after ${timeoutMs}ms`, classification: "TIMEOUT", latencyMs, retryable: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    const refused = /ECONNREFUSED|fetch failed/i.test(message);
    console.error("[openclaw]", path, "network", { latencyMs, message });
    return {
      ok: false,
      error: message,
      classification: refused ? "CONNECTION_REFUSED" : "UNKNOWN",
      latencyMs,
      retryable: refused,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type NotifyAgentArgs = {
  agent: "operator" | "leads-inbox" | "qualified-leads";
  message: string;
  metadata?: Record<string, unknown>;
};

export async function notifyAgent(args: NotifyAgentArgs) {
  return request<{ sessionId?: string }>("/api/sessions/send", {
    method: "POST",
    body: JSON.stringify({
      agent: args.agent,
      message: args.message,
      metadata: args.metadata ?? {},
    }),
    timeoutMs: 5_000,
  });
}

export async function ping() {
  return request<{ status: string }>("/api/health", {
    method: "GET",
    timeoutMs: 2_000,
  });
}

export async function requestDraft(args: {
  agent: "leads-inbox";
  conversationId: string;
  inbound: string;
  context?: Record<string, unknown>;
}) {
  return request<{ draft: string; raw?: unknown }>("/api/drafts", {
    method: "POST",
    body: JSON.stringify({
      agent: args.agent,
      conversationId: args.conversationId,
      inbound: args.inbound,
      context: args.context ?? {},
    }),
    timeoutMs: 15_000,
  });
}
