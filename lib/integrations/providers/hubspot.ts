import { appendQuery, type ProviderAdapter } from "./types";

/**
 * HubSpot private-app token adapter.
 * Docs: https://developers.hubspot.com/docs/api/private-apps
 */
export const hubspotProvider: ProviderAdapter = {
  provider: "hubspot",
  label: "HubSpot",
  authType: "bearer",
  secretKeys: ["accessToken"],
  configKeys: [],
  buildRequest({ secrets, method, path, query, body, headers }) {
    const token = secrets.accessToken;
    if (!token) throw new Error("HubSpot integration is missing `accessToken` secret.");
    const safePath = path.startsWith("/") ? path : `/${path}`;
    if (!/^\/[\w\-./]+$/.test(safePath)) {
      throw new Error("Invalid HubSpot API path.");
    }
    const url = appendQuery(`https://api.hubapi.com${safePath}`, query);
    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    };
  },
  testRequest({ secrets }) {
    const token = secrets.accessToken;
    if (!token) throw new Error("Missing accessToken.");
    return {
      method: "GET",
      url: "https://api.hubapi.com/crm/v3/owners?limit=1",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    };
  },
};
