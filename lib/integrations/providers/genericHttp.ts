import { appendQuery, type ProviderAdapter } from "./types";

/**
 * Generic HTTP adapter. Workspace user supplies:
 *   config.baseUrl (required, https)
 *   config.allowedPathPrefixes (optional array of path prefixes)
 *   secrets.apiKey (optional)
 *   config.authHeader (optional, default "Authorization")
 *   config.authScheme (optional, "Bearer" | "Basic" | "ApiKey" | "")
 */
export const genericHttpProvider: ProviderAdapter = {
  provider: "generic_http",
  label: "Generic HTTP API",
  authType: "bearer",
  secretKeys: ["apiKey"],
  configKeys: ["baseUrl", "authHeader", "authScheme", "allowedPathPrefixes"],
  buildRequest({ secrets, config, method, path, query, body, headers }) {
    const baseUrlRaw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
    if (!baseUrlRaw) throw new Error("Integration is missing config.baseUrl.");
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
    const finalUrl = appendQuery(`${base.origin}${base.pathname.replace(/\/$/, "")}${safePath}`, query);
    const authHeaderName = typeof config.authHeader === "string" && config.authHeader.trim() ? config.authHeader.trim() : "Authorization";
    const scheme = typeof config.authScheme === "string" ? config.authScheme.trim() : "Bearer";
    const built: Record<string, string> = {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    };
    if (secrets.apiKey) {
      built[authHeaderName] = scheme ? `${scheme} ${secrets.apiKey}` : secrets.apiKey;
    }
    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: finalUrl,
      headers: built,
      body: body ? JSON.stringify(body) : undefined,
    };
  },
};
