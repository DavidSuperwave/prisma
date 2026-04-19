/**
 * Provider adapter contract for dynamic 3rd-party integrations.
 * Each adapter describes how to build an authenticated HTTP request and
 * an allowlist of safe base URLs / path patterns.
 */

export type ProviderRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
};

export type ProviderAdapter = {
  /** Stable identifier (matches workspace_integrations.provider) */
  provider: string;
  /** Human-readable label for UI */
  label: string;
  /** Default auth_type when UI creates an integration */
  authType: "api_key" | "bearer" | "oauth" | "mcp" | "hmac";
  /** Secret key names this provider expects (e.g. "apiKey", "webhookSecret") */
  secretKeys: string[];
  /** Optional config keys (non-secret, e.g. "baseUrl") */
  configKeys: string[];
  /** Build a full authenticated request from user-supplied args */
  buildRequest: (args: {
    secrets: Record<string, string>;
    config: Record<string, unknown>;
    method: string;
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
  }) => ProviderRequest;
  /** Optional: smoke-test call used by the "Test integration" button */
  testRequest?: (args: {
    secrets: Record<string, string>;
    config: Record<string, unknown>;
  }) => ProviderRequest;
};

export function appendQuery(url: string, query?: Record<string, string | number | boolean | undefined>) {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}
