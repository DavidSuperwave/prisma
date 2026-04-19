/**
 * Best-effort detector for API-key-shaped strings inside user chat messages.
 *
 * When a match is found we:
 *   1. Auto-create a workspace_integrations row with provider=generic_http
 *      (or a specific provider if the pattern is recognizable).
 *   2. Store the plaintext in workspace_integration_secrets (AES-256-GCM).
 *   3. Replace the token in the persisted message with a short marker.
 *
 * Goal: when a workspace user pastes a raw key in chat, the secret never
 * lives in `workspace_conversation_messages.content`. The agent is given a
 * system note pointing at the new integration slug instead.
 */

import { createIntegration } from "@/lib/integrations/store";

type DetectedSecret = {
  match: string;
  provider: string;
  suggestedSlug: string;
  suggestedLabel: string;
  secretKey: string;
  start: number;
  end: number;
};

const PATTERNS: Array<{
  regex: RegExp;
  provider: string;
  secretKey: string;
  label: string;
  slug: string;
}> = [
  {
    // Close CRM: begins with api_ and ~30-40 hex chars. Conservative: 25+.
    regex: /\bapi_[A-Za-z0-9]{25,}\b/g,
    provider: "close",
    secretKey: "apiKey",
    label: "Close (auto-detected)",
    slug: "close-auto",
  },
  {
    // HubSpot private app tokens: pat-xx-xxxx-xxxx... (35+)
    regex: /\bpat-[a-z0-9]{2}-[a-zA-Z0-9-]{20,}\b/g,
    provider: "hubspot",
    secretKey: "accessToken",
    label: "HubSpot (auto-detected)",
    slug: "hubspot-auto",
  },
  {
    // OpenAI-shaped: sk-... with 40+ chars
    regex: /\bsk-[A-Za-z0-9_\-]{20,}\b/g,
    provider: "generic_http",
    secretKey: "apiKey",
    label: "API key (auto-detected)",
    slug: "api-key-auto",
  },
  {
    // Explicit Bearer <token> of >=20 chars
    regex: /\bBearer\s+([A-Za-z0-9_\-\.]{20,})\b/g,
    provider: "generic_http",
    secretKey: "apiKey",
    label: "Bearer token (auto-detected)",
    slug: "bearer-auto",
  },
];

export function detectSecrets(content: string): DetectedSecret[] {
  if (!content) return [];
  const out: DetectedSecret[] = [];
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content)) !== null) {
      const raw = match[0];
      // For the "Bearer xxx" pattern, store only the token portion.
      const token = match[1] ?? raw;
      out.push({
        match: raw,
        provider: pattern.provider,
        suggestedSlug: pattern.slug,
        suggestedLabel: pattern.label,
        secretKey: pattern.secretKey,
        start: match.index,
        end: match.index + raw.length,
      });
      if (token !== raw) {
        // Overwrite match to avoid storing "Bearer …" prefix.
        out[out.length - 1].match = token;
      }
    }
  }
  // Dedupe overlapping matches; keep first occurrence per token value.
  const seen = new Set<string>();
  return out.filter((entry) => {
    if (seen.has(entry.match)) return false;
    seen.add(entry.match);
    return true;
  });
}

export type ScrubResult = {
  scrubbedContent: string;
  createdIntegrations: Array<{ slug: string; provider: string; label: string }>;
  systemNotes: string[];
  detected: boolean;
};

export type ScrubOptions = {
  workspaceId: string;
  createdBy?: string | null;
};

/**
 * Scans content, persists any detected secrets into the vault, and returns a
 * sanitized copy to persist in conversation history. No-op when no secrets.
 */
export async function scrubAndStoreSecrets(
  content: string,
  opts: ScrubOptions,
): Promise<ScrubResult> {
  const detected = detectSecrets(content);
  if (detected.length === 0) {
    return { scrubbedContent: content, createdIntegrations: [], systemNotes: [], detected: false };
  }
  const createdIntegrations: Array<{ slug: string; provider: string; label: string }> = [];
  const systemNotes: string[] = [];
  let working = content;
  // Replace from end to start so offsets remain valid.
  const sorted = [...detected].sort((a, b) => b.start - a.start);
  for (const d of sorted) {
    try {
      const integration = await createIntegration({
        workspaceId: opts.workspaceId,
        label: d.suggestedLabel,
        slug: d.suggestedSlug,
        provider: d.provider,
        authType: d.provider === "hubspot" ? "bearer" : "api_key",
        secrets: { [d.secretKey]: d.match },
        createdBy: opts.createdBy ?? null,
      });
      createdIntegrations.push({ slug: integration.slug, provider: integration.provider, label: integration.label });
      const marker = `<redacted:${d.provider}:${integration.slug}>`;
      working = working.slice(0, d.start) + marker + working.slice(d.end);
      systemNotes.push(
        `User pasted a ${d.provider} secret. Saved as integration slug="${integration.slug}". Use integrations.call with that slug; do not ask the user to paste the secret again.`,
      );
    } catch (error) {
      // If persistence fails, still scrub the secret from content to avoid
      // leaking it into storage.
      const marker = `<redacted:${d.provider}:store-failed>`;
      working = working.slice(0, d.start) + marker + working.slice(d.end);
      systemNotes.push(
        `Detected a ${d.provider} secret but failed to persist it: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { scrubbedContent: working, createdIntegrations, systemNotes, detected: true };
}
