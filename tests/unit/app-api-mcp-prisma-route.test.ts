import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agentMcpSession", () => ({
  verifyPrismaMcpSessionToken: vi.fn(),
}));

vi.mock("@/lib/agentTools/registry", () => ({
  listTools: vi.fn(),
}));

vi.mock("@/lib/agentTools/executor", () => ({
  runTool: vi.fn(),
}));

vi.mock("@/lib/dynamicTools/store", () => ({
  listDynamicTools: vi.fn(),
}));

vi.mock("@/lib/dynamicTools/executor", () => ({
  executeDynamicTool: vi.fn(),
}));

import { verifyPrismaMcpSessionToken } from "@/lib/agentMcpSession";
import { listTools } from "@/lib/agentTools/registry";
import { runTool } from "@/lib/agentTools/executor";
import { executeDynamicTool } from "@/lib/dynamicTools/executor";
import { listDynamicTools } from "@/lib/dynamicTools/store";
import { POST } from "@/app/api/mcp/prisma/route";

const mockedVerify = vi.mocked(verifyPrismaMcpSessionToken);
const mockedListTools = vi.mocked(listTools);
const mockedRunTool = vi.mocked(runTool);
const mockedExecuteDynamicTool = vi.mocked(executeDynamicTool);
const mockedListDynamicTools = vi.mocked(listDynamicTools);

function makeRequest(body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  return new Request("https://app.example.com/api/mcp/prisma", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe("/api/mcp/prisma", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedVerify.mockReturnValue({
      iss: "prisma",
      aud: "prisma-mcp",
      sub: "ws-1:agent-1",
      iat: 1,
      exp: Math.floor(Date.now() / 1000) + 60,
      jti: "jti-1",
      workspaceId: "ws-1",
      workspaceSlug: "demo",
      agentId: "agent-1",
      rolePreset: "sales",
      toolsInclude: ["crm.query"],
    });
    mockedListTools.mockReturnValue([
      {
        name: "crm.query",
        description: "Query CRM",
        args: {
          q: { type: "string", required: true, description: "Search query" },
        },
        handler: vi.fn(),
      },
      {
        name: "records.create",
        description: "Create record",
        args: {},
        handler: vi.fn(),
      },
    ]);
    mockedListDynamicTools.mockResolvedValue([
      {
        id: "dyn-1",
        workspace_id: "ws-1",
        agent_id: null,
        name: "dyn.follow_up",
        description: "Dynamic follow up",
        args_schema: {
          recordId: { type: "string", required: true, description: "Record id" },
        },
        implementation: { kind: "api_compose", steps: [] },
        status: "active",
        source_document_id: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    mockedRunTool.mockResolvedValue({ ok: true, data: { echoed: true } });
    mockedExecuteDynamicTool.mockResolvedValue({ ok: true, data: { dynamic: true } });
  });

  it("initializes as an MCP tool server", async () => {
    const response = await POST(
      makeRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { result?: Record<string, unknown> };
    expect(payload.result?.serverInfo).toEqual({
      name: "prisma-internal-mcp",
      version: "0.1.0",
    });
  });

  it("lists static tools filtered by policy and unions active dynamic tools", async () => {
    const response = await POST(
      makeRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    );

    const payload = (await response.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    expect(payload.result?.tools?.map((tool) => tool.name)).toEqual([
      "crm.query",
      "dyn.follow_up",
    ]);
  });

  it("calls static tools with workspace auth bridged from x-prisma-access-token", async () => {
    const response = await POST(
      makeRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "crm.query",
            arguments: {
              q: "acme",
            },
          },
        },
        {
          "x-prisma-access-token": "access-123",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(mockedRunTool).toHaveBeenCalledWith({
      name: "crm.query",
      args: { q: "acme" },
      ctx: expect.objectContaining({
        workspaceSlug: "demo",
        agentId: "agent-1",
        cookieHeader: "prisma-access-token=access-123",
      }),
    });
    const payload = (await response.json()) as { result?: { isError?: boolean } };
    expect(payload.result?.isError).toBe(false);
  });

  it("dispatches dynamic tools through the dynamic executor", async () => {
    const response = await POST(
      makeRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "dyn.follow_up",
          arguments: {
            recordId: "rec-1",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedExecuteDynamicTool).toHaveBeenCalledWith(
      "dyn.follow_up",
      { recordId: "rec-1" },
      expect.objectContaining({
        workspaceSlug: "demo",
        agentId: "agent-1",
      }),
    );
  });
});

