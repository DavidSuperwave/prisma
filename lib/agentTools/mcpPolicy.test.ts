import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agentTools/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agentTools/registry")>();
  return {
    ...actual,
    listTools: vi.fn(),
  };
});

import { listTools } from "@/lib/agentTools/registry";
import { listDefaultOperatorToolNames, resolveMcpToolPolicy } from "./mcpPolicy";

const mockedListTools = vi.mocked(listTools);

describe("mcpPolicy", () => {
  beforeEach(() => {
    mockedListTools.mockReset();
    mockedListTools.mockReturnValue([
      { name: "integrations.list" } as never,
      { name: "recipes.save" } as never,
      { name: "skills.publish_recipe" } as never,
      { name: "cms.push_inventory" } as never,
      { name: "peer.list_agents" } as never,
      { name: "connections.assist" } as never,
      { name: "agents.update_soul" } as never,
    ]);
  });

  it("includes the default operator utility namespaces used by the operator UI", () => {
    expect(listDefaultOperatorToolNames()).toEqual([
      "cms.push_inventory",
      "connections.assist",
      "integrations.list",
      "peer.list_agents",
      "recipes.save",
      "skills.publish_recipe",
    ]);
  });

  it("keeps the sales preset aligned with recipe publishing, cms, connections, and peer tools", () => {
    const policy = resolveMcpToolPolicy({
      agentType: "channel",
      knowledgeScope: {},
    });

    expect(policy.rolePreset).toBe("sales");
    expect(policy.include).toEqual([
      "cms.push_inventory",
      "connections.assist",
      "integrations.list",
      "peer.list_agents",
      "recipes.save",
      "skills.publish_recipe",
    ]);
  });
});

