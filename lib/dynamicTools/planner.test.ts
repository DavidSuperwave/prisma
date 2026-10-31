import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/extraction/structuredField", () => ({
  hermesStructured: vi.fn(),
}));

import { hermesStructured } from "@/lib/extraction/structuredField";
import { runWorkflowPlanner, type PlannerOutput } from "./planner";

const mockedHermes = vi.mocked(hermesStructured);

describe("runWorkflowPlanner", () => {
  beforeEach(() => {
    mockedHermes.mockReset();
  });

  it("adds dyn. prefix to tool names and validates bad routes", async () => {
    const raw: PlannerOutput = {
      notes: "test",
      tools: [
        {
          name: "t1",
          description: "d",
          rationale: "r",
          args: [
            { key: "a", type: "string", required: true, description: "x" },
          ],
          implementation: {
            kind: "api_compose",
            steps: [
              { action: "fetch_internal", route: "https://evil.com", method: "GET" },
            ],
          },
        },
        {
          name: "dyn.t2",
          description: "d2",
          rationale: "r2",
          args: [],
          implementation: { kind: "api_compose", steps: [] },
        },
      ],
    };
    mockedHermes.mockResolvedValue({
      data: raw,
      provider: "hermes",
      model: "m",
      raw: "{}",
    });
    const { output, validationWarnings } = await runWorkflowPlanner({
      documentText: "x",
      workspaceSlug: "acme",
    });
    expect(output.tools[0].name).toBe("dyn.t1");
    expect(validationWarnings.some((w) => w.includes("disallowed"))).toBe(true);
  });

  it("accepts valid workspace routes in steps", async () => {
    const raw: PlannerOutput = {
      notes: "ok",
      tools: [
        {
          name: "p",
          description: "d",
          rationale: "r",
          args: [],
          implementation: {
            kind: "api_compose",
            steps: [
              { action: "fetch_internal", route: "/api/workspaces/acme/records", method: "GET" },
            ],
          },
        },
      ],
    };
    mockedHermes.mockResolvedValue({ data: raw, provider: "hermes", model: "m", raw: "{}" });
    const { validationWarnings } = await runWorkflowPlanner({ documentText: "x", workspaceSlug: "acme" });
    expect(validationWarnings.filter((w) => w.includes("disallowed"))).toHaveLength(0);
  });
});

describe("grupo automotriz fixture (mocked hermes)", () => {
  it("planner result shape is preserved for fixture", async () => {
    const fixturePath = path.join(process.cwd(), "tests/fixtures/grupo-automotriz-workflow.md");
    const documentText = await readFile(fixturePath, "utf-8");
    const raw: PlannerOutput = {
      notes: "Automotriz workflow",
      tools: [
        {
          name: "dyn.automotriz_check_inventory",
          description: "List inventory for territory",
          rationale: "Uses cms and records",
          args: [
            { key: "territory", type: "string", required: false, description: "Filter" },
          ],
          implementation: { kind: "api_compose", steps: [] },
        },
        {
          name: "dyn.automotriz_route_lead",
          description: "Route lead to rep",
          rationale: "Lead routing",
          args: [
            { key: "recordId", type: "string", required: true, description: "Person record" },
          ],
          implementation: {
            kind: "api_compose",
            steps: [
              { action: "fetch_internal", route: "/api/workspaces/demo/records", method: "GET" },
            ],
          },
        },
        {
          name: "dyn.automotriz_price_calc",
          description: "Spreadsheet pricing",
          rationale: "Numbers",
          args: [],
          implementation: { kind: "api_compose", steps: [] },
        },
      ],
    };
    mockedHermes.mockResolvedValue({ data: raw, provider: "hermes", model: "m", raw: "{}" });
    const { output } = await runWorkflowPlanner({ documentText, workspaceSlug: "demo" });
    expect(output.tools.length).toBeGreaterThanOrEqual(3);
    expect(output.tools.every((t) => t.name.startsWith("dyn."))).toBe(true);
  });
});
