import { appendQuery, type ProviderAdapter } from "./types";

/**
 * Close CRM adapter. Docs: https://developer.close.com/
 * Auth: HTTP Basic, username = api key, password empty.
 */
export const closeProvider: ProviderAdapter = {
  provider: "close",
  label: "Close CRM",
  authType: "api_key",
  secretKeys: ["apiKey"],
  configKeys: [],
  buildRequest({ secrets, method, path, query, body, headers }) {
    const apiKey = secrets.apiKey;
    if (!apiKey) throw new Error("Close integration is missing `apiKey` secret.");
    const safePath = path.startsWith("/") ? path : `/${path}`;
    if (!/^\/[\w\-./]+$/.test(safePath)) {
      throw new Error("Invalid Close API path.");
    }
    const base = "https://api.close.com/api/v1";
    const url = appendQuery(`${base}${safePath}`, query);
    const basic = Buffer.from(`${apiKey}:`).toString("base64");
    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url,
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    };
  },
  testRequest({ secrets }) {
    const apiKey = secrets.apiKey;
    if (!apiKey) throw new Error("Missing apiKey.");
    const basic = Buffer.from(`${apiKey}:`).toString("base64");
    return {
      method: "GET",
      url: "https://api.close.com/api/v1/me/",
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    };
  },
};
