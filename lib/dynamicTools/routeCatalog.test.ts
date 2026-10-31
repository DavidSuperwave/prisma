import { describe, expect, it } from "vitest";

import { fillWorkspaceSlugInRoutePattern, isAllowedInternalRoute } from "./routeCatalog";

describe("routeCatalog", () => {
  it("isAllowedInternalRoute allows documented workspace route prefixes", () => {
    expect(isAllowedInternalRoute("/api/workspaces/ws/records", "ws")).toBe(true);
    expect(isAllowedInternalRoute("/api/workspaces/ws/records/abc?limit=10", "ws")).toBe(true);
  });

  it("rejects wrong slug segment", () => {
    expect(isAllowedInternalRoute("/api/workspaces/other/records", "ws")).toBe(false);
  });

  it("rejects unknown workspace-scoped routes outside the catalog", () => {
    expect(isAllowedInternalRoute("/api/workspaces/ws/connections", "ws")).toBe(false);
  });

  it("rejects non-api paths", () => {
    expect(isAllowedInternalRoute("https://x/api/workspaces/ws/records", "ws")).toBe(false);
  });

  it("fillWorkspaceSlugInRoutePattern replaces placeholder", () => {
    expect(fillWorkspaceSlugInRoutePattern("/api/workspaces/<slug>/r", "ab")).toBe(
      "/api/workspaces/ab/r",
    );
  });
});
