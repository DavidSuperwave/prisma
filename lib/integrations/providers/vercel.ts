import { appendQuery, type ProviderAdapter } from "./types";

/**
 * Vercel REST API adapter. Uses a personal or team API token (bearer) to hit
 * https://api.vercel.com. Supports optional team scoping via config.teamId —
 * when set, the adapter appends `teamId` to every request's query string so
 * team-scoped routes behave identically to unscoped ones.
 *
 * See https://vercel.com/docs/rest-api.
 */
export const vercelProvider: ProviderAdapter = {
  provider: "vercel",
  label: "Vercel",
  authType: "bearer",
  secretKeys: ["token"],
  configKeys: ["teamId", "projectId"],
  buildRequest({ secrets, config, method, path, query, body, headers }) {
    const token = secrets.token;
    if (!token) throw new Error("Missing Vercel API token (secrets.token).");
    const safePath = path.startsWith("/") ? path : `/${path}`;
    if (!/^\/[\w\-./%]*$/.test(safePath)) {
      throw new Error("Invalid Vercel API path.");
    }
    const effectiveQuery: Record<string, string | number | boolean | undefined> = { ...(query ?? {}) };
    if (typeof config.teamId === "string" && config.teamId && effectiveQuery.teamId === undefined) {
      effectiveQuery.teamId = config.teamId;
    }
    const url = appendQuery(`https://api.vercel.com${safePath}`, effectiveQuery);
    const built: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    };
    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url,
      headers: built,
      body: body ? JSON.stringify(body) : undefined,
    };
  },
  testRequest({ secrets, config }) {
    const token = secrets.token;
    if (!token) throw new Error("Missing token.");
    const query: Record<string, string> = {};
    if (typeof config.teamId === "string" && config.teamId) query.teamId = config.teamId;
    return {
      method: "GET",
      url: appendQuery("https://api.vercel.com/v2/user", query),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    };
  },
};
