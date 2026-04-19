import { appendQuery, type ProviderAdapter } from "./types";

/**
 * Custom API adapter — the catch-all for any vendor the user has an API key for.
 * Unlike genericHttp, this one is surfaced in the UI as a first-class choice and
 * is what the agent should suggest when a user pastes a new key for an
 * unrecognized service.
 *
 *   config.baseUrl (required, https — localhost allowed in dev)
 *   config.authHeader (optional, default "Authorization")
 *   config.authScheme (optional, default "Bearer"; "" for header-only keys)
 *   config.authLocation (optional, "header" | "query"; default "header")
 *   config.authQueryKey (optional, used when authLocation === "query")
 *   config.extraHeaders (optional, Record<string,string>)
 *   config.allowedPathPrefixes (optional, array)
 *   secrets.apiKey (required — the user-pasted key)
 */
export const customApiProvider: ProviderAdapter = {
  provider: "custom_api",
  label: "Custom API (any vendor)",
  authType: "api_key",
  secretKeys: ["apiKey"],
  configKeys: [
    "baseUrl",
    "authHeader",
    "authScheme",
    "authLocation",
    "authQueryKey",
    "extraHeaders",
    "allowedPathPrefixes",
  ],
  buildRequest({ secrets, config, method, path, query, body, headers }) {
    const baseUrlRaw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
    if (!baseUrlRaw) throw new Error("custom_api integration is missing config.baseUrl.");
    let base: URL;
    try {
      base = new URL(baseUrlRaw);
    } catch {
      throw new Error("config.baseUrl is not a valid URL.");
    }
    if (base.protocol !== "https:" && base.hostname !== "localhost" && !base.hostname.startsWith("127.")) {
      throw new Error("config.baseUrl must use https.");
    }
    const safePath = path.startsWith("/") ? path : `/${path}`;
    if (!/^\/[\w\-./%]*$/.test(safePath)) {
      throw new Error("Invalid HTTP path.");
    }
    const allowed = Array.isArray(config.allowedPathPrefixes)
      ? (config.allowedPathPrefixes as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    if (allowed.length > 0 && !allowed.some((prefix) => safePath.startsWith(prefix))) {
      throw new Error(`Path ${safePath} is not in allowedPathPrefixes.`);
    }

    const authLocation =
      typeof config.authLocation === "string" && config.authLocation.trim()
        ? config.authLocation.trim()
        : "header";

    // Merge auth into query if requested
    const queryWithAuth: Record<string, string | number | boolean | undefined> = {
      ...(query ?? {}),
    };
    if (authLocation === "query" && secrets.apiKey) {
      const qk = typeof config.authQueryKey === "string" && config.authQueryKey.trim() ? config.authQueryKey.trim() : "api_key";
      queryWithAuth[qk] = secrets.apiKey;
    }

    const finalUrl = appendQuery(
      `${base.origin}${base.pathname.replace(/\/$/, "")}${safePath}`,
      queryWithAuth,
    );

    const extraHeaders =
      config.extraHeaders && typeof config.extraHeaders === "object" && !Array.isArray(config.extraHeaders)
        ? (config.extraHeaders as Record<string, string>)
        : {};

    const built: Record<string, string> = {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
      ...(headers ?? {}),
    };

    if (authLocation !== "query" && secrets.apiKey) {
      const authHeaderName =
        typeof config.authHeader === "string" && config.authHeader.trim()
          ? config.authHeader.trim()
          : "Authorization";
      const scheme = typeof config.authScheme === "string" ? config.authScheme : "Bearer";
      const trimmedScheme = scheme.trim();
      built[authHeaderName] = trimmedScheme ? `${trimmedScheme} ${secrets.apiKey}` : secrets.apiKey;
    }

    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: finalUrl,
      headers: built,
      body: body ? JSON.stringify(body) : undefined,
    };
  },
};
