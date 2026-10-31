/**
 * Allowed `fetch_internal` route prefixes for dynamic tool API composition.
 * All routes must be workspace-scoped under the current slug; executor validates
 * the resolved path starts with /api/workspaces/ before calling fetchInternal.
 */
const ALLOWED_PREFIXES = [
  "/api/workspaces/<slug>/records",
  "/api/workspaces/<slug>/records/bulk",
  "/api/workspaces/<slug>/fields",
  "/api/workspaces/<slug>/conversations",
  "/api/workspaces/<slug>/documents",
  "/api/workspaces/<slug>/workflows",
  "/api/workspaces/<slug>/automations/schedule",
  "/api/workspaces/<slug>/gateway/native",
] as const;

const CMS_TOOL_NAMES = new Set([
  "cms.list_inventory",
  "cms.push_inventory",
  "cms.sync_inventory",
  "cms.bootstrap_vehicles",
]);

/**
 * Produces a human-readable catalog of patterns for the planner LLM prompt.
 */
export function renderRouteCatalogForPrompt(_workspaceSlug: string): string {
  return [
    "Workspace API patterns (use <slug> as the workspace subdomain; routes are only examples—executor validates exact paths at runtime):",
    ...ALLOWED_PREFIXES.map((p) => `- ${p}`),
    "For inventory/CMS operations, use static Hermes tool calls instead of fetch_internal when the step maps cleanly:",
    `  e.g. ${Array.from(CMS_TOOL_NAMES).join(", ")}`,
  ].join("\n");
}

/**
 * Normalizes a route string with a concrete slug (for validation).
 */
export function fillWorkspaceSlugInRoutePattern(route: string, workspaceSlug: string): string {
  return route.split("<slug>").join(encodeURIComponent(workspaceSlug));
}

/**
 * Returns true if the route is a safe workspace API path (after slug substitution).
 */
export function isAllowedInternalRoute(route: string, workspaceSlug: string): boolean {
  const trimmed = route.trim();
  if (!trimmed.startsWith("/")) {
    return false;
  }
  if (!trimmed.startsWith("/api/workspaces/")) {
    return false;
  }
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 3) {
    return false;
  }
  if (parts[0] !== "api" || parts[1] !== "workspaces") {
    return false;
  }
  if (parts[2] !== workspaceSlug) {
    return false;
  }
  if (trimmed.includes("..")) {
    return false;
  }
  const allowedPrefixes = ALLOWED_PREFIXES.map((pattern) =>
    fillWorkspaceSlugInRoutePattern(pattern, workspaceSlug),
  );
  return allowedPrefixes.some((prefix) => {
    if (!trimmed.startsWith(prefix)) return false;
    const nextChar = trimmed.charAt(prefix.length);
    return nextChar === "" || nextChar === "/" || nextChar === "?";
  });
}

export { CMS_TOOL_NAMES };
