export type AgentReadinessState = "ready" | "draft";

export type AgentReadinessResult = {
  state: AgentReadinessState;
  isReady: boolean;
  issues: string[];
};

type EvaluateAgentReadinessInput = {
  apiEndpoint?: string | null;
  apiKey?: string | null;
  soulMd?: string | null;
};

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function evaluateAgentReadiness(input: EvaluateAgentReadinessInput): AgentReadinessResult {
  const issues: string[] = [];
  const endpoint = typeof input.apiEndpoint === "string" ? input.apiEndpoint.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const soulMd = typeof input.soulMd === "string" ? input.soulMd.trim() : "";
  const soulIsPlaceholder =
    soulMd.length > 0 &&
    (soulMd.toLowerCase().includes("aún no configurado") ||
      soulMd.toLowerCase().includes("aun no configurado") ||
      soulMd.toLowerCase().includes("not configured"));

  if (!endpoint) {
    issues.push("runtime endpoint is missing");
  } else if (!isValidHttpUrl(endpoint)) {
    issues.push("runtime endpoint must be a valid http(s) URL");
  }

  if (!apiKey) {
    issues.push("runtime api key is missing");
  }

  if (!soulMd || soulIsPlaceholder) {
    issues.push("soul_md is missing");
  }

  const isReady = issues.length === 0;
  return {
    state: isReady ? "ready" : "draft",
    isReady,
    issues,
  };
}

export function mergeReadinessIntoKnowledgeScope(
  currentKnowledgeScope: Record<string, unknown> | null | undefined,
  readiness: AgentReadinessResult,
) {
  const next = {
    ...(currentKnowledgeScope ?? {}),
    readiness_state: readiness.state,
    readiness_issues: readiness.issues,
    readiness_checked_at: new Date().toISOString(),
  } as Record<string, unknown>;

  if (readiness.isReady) {
    next.ready_at = typeof next.ready_at === "string" ? next.ready_at : new Date().toISOString();
  }

  return next;
}

export function deriveReadinessFromKnowledgeScope(
  knowledgeScope: Record<string, unknown> | null | undefined,
  fallback: AgentReadinessResult,
) {
  const state = knowledgeScope?.readiness_state;
  if (state !== "ready" && state !== "draft") {
    return fallback;
  }

  const rawIssues = knowledgeScope?.readiness_issues;
  const issues = Array.isArray(rawIssues)
    ? rawIssues.map((entry) => String(entry)).filter((entry) => entry.length > 0)
    : fallback.issues;
  const isReady = state === "ready" && issues.length === 0;
  return {
    state: isReady ? "ready" : "draft",
    isReady,
    issues: isReady ? [] : issues,
  } satisfies AgentReadinessResult;
}

export function executionBlockReason(
  status: string,
  readiness: AgentReadinessResult,
) {
  if (status !== "active") {
    return "Agent must be active before execution.";
  }
  if (!readiness.isReady) {
    return `Agent is in draft state: ${readiness.issues.join(", ") || "configuration incomplete"}.`;
  }
  return null;
}

