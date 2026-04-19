import { appendQuery, type ProviderAdapter } from "./types";
import { getIntegrationBySlug, getIntegrationSecrets } from "@/lib/integrations/store";

/**
 * Browser-Use Cloud adapter. Managed remote-browser automation service.
 * Docs: https://docs.browser-use.com/ (REST). We call the public REST API
 * directly via `fetch`; no SDK dependency.
 *
 * Auth: `Authorization: Bearer <api_key>` where the key is stored in the
 * integrations vault under secret slot `api_key` (slug `browser-use`).
 * Optional config fields:
 *   - `profile_id` (string)
 *   - `proxy` (object — server/username/password as browser-use expects)
 */
const BROWSER_USE_INTEGRATION_SLUG = "browser-use";
const DEFAULT_BASE_URL = "https://api.browser-use.com";

export const browserUseProvider: ProviderAdapter = {
  provider: "browser_use",
  label: "Browser-Use Cloud",
  authType: "api_key",
  secretKeys: ["api_key"],
  configKeys: ["baseUrl", "profile_id", "proxy"],
  buildRequest({ secrets, config, method, path, query, body, headers }) {
    const apiKey = secrets.api_key ?? secrets.apiKey;
    if (!apiKey) throw new Error("Browser-Use integration is missing `api_key` secret.");
    const baseUrlRaw =
      typeof config.baseUrl === "string" && config.baseUrl.trim().length > 0
        ? config.baseUrl.trim()
        : DEFAULT_BASE_URL;
    let base: URL;
    try {
      base = new URL(baseUrlRaw);
    } catch {
      throw new Error("config.baseUrl is not a valid URL.");
    }
    if (base.protocol !== "https:" && base.hostname !== "localhost") {
      throw new Error("config.baseUrl must use https.");
    }
    const safePath = path.startsWith("/") ? path : `/${path}`;
    if (!/^\/[\w\-./]+$/.test(safePath)) {
      throw new Error("Invalid Browser-Use API path.");
    }
    const url = appendQuery(`${base.origin}${base.pathname.replace(/\/$/, "")}${safePath}`, query);
    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    };
  },
  testRequest({ secrets, config }) {
    const apiKey = secrets.api_key ?? secrets.apiKey;
    if (!apiKey) throw new Error("Missing api_key.");
    const baseUrlRaw =
      typeof config.baseUrl === "string" && config.baseUrl.trim().length > 0
        ? config.baseUrl.trim()
        : DEFAULT_BASE_URL;
    return {
      method: "GET",
      url: `${baseUrlRaw.replace(/\/+$/, "")}/health`,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    };
  },
};

export type BrowserUseProbeResult = {
  ok: boolean;
  status: number;
  sample?: unknown;
  error?: string;
};

/**
 * Low-level health probe for a workspace's browser-use integration. Safe to
 * call from admin / settings UIs — never returns or logs the raw key.
 */
export async function probe(workspaceId: string): Promise<BrowserUseProbeResult> {
  const integration = await getIntegrationBySlug(workspaceId, BROWSER_USE_INTEGRATION_SLUG);
  const envApiKey = process.env.BROWSER_USE_API_KEY?.trim() ?? "";
  let apiKey = envApiKey;
  let baseUrl = (process.env.BROWSER_USE_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (integration) {
    const secrets = await getIntegrationSecrets(integration.id);
    apiKey = secrets.api_key ?? secrets.apiKey ?? apiKey;
    const cfgBaseUrl =
      typeof integration.config?.baseUrl === "string" ? String(integration.config.baseUrl).trim() : "";
    if (cfgBaseUrl) baseUrl = cfgBaseUrl.replace(/\/+$/, "");
  }
  if (!apiKey) {
    return { ok: false, status: 412, error: "browser_use_not_configured" };
  }
  const target = `${baseUrl}/health`;
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    let sample: unknown = text;
    if (text.length > 0) {
      try {
        sample = JSON.parse(text);
      } catch {
        sample = text.slice(0, 500);
      }
    }
    return { ok: response.ok, status: response.status, sample };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return { ok: false, status: 502, error: message };
  }
}
