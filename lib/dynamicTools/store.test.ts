import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { batchUpsertDynamicTools, getDynamicTool, listDynamicTools, upsertDynamicTool } from "./store";

describe("listDynamicTools", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns rows and applies status filter", async () => {
    const row = { id: "1", name: "dyn.t", status: "active" };
    const finalOrder = vi.fn().mockResolvedValue({ data: [row], error: null });
    const afterStatusEq = vi.fn().mockReturnValue({ order: finalOrder });
    const afterWorkspaceEq = vi.fn().mockReturnValue({ eq: afterStatusEq });
    fromMock.mockReturnValue({
      select: () => ({ eq: afterWorkspaceEq }),
    });
    const list = await listDynamicTools("ws-1", { status: "active" });
    expect(list).toEqual([row]);
    expect(afterWorkspaceEq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(afterStatusEq).toHaveBeenCalledWith("status", "active");
  });
});

describe("getDynamicTool", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns null for empty name", async () => {
    const g = await getDynamicTool("ws-1", "");
    expect(g).toBeNull();
  });

  it("prefixes name for lookup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { name: "dyn.x" }, error: null });
    const afterNameEq = vi.fn().mockReturnValue({ maybeSingle });
    const afterWorkspaceEq = vi.fn().mockReturnValue({ eq: afterNameEq });
    fromMock.mockReturnValue({ select: () => ({ eq: afterWorkspaceEq }) });
    await getDynamicTool("ws-1", "x");
    expect(afterNameEq).toHaveBeenCalledWith("name", "dyn.x");
  });
});

describe("upsertDynamicTool", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("upserts with dyn prefix and returns row", async () => {
    const row = {
      id: "id1",
      workspace_id: "ws-1",
      name: "dyn.p",
      description: "d",
      args_schema: {},
      implementation: { kind: "api_compose", steps: [] },
      status: "draft",
      source_document_id: null,
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    fromMock.mockReturnValue({
      upsert: () => ({
        select: () => ({ single }),
      }),
    });
    const out = await upsertDynamicTool("ws-1", {
      name: "p",
      description: "d",
      args_schema: {},
      implementation: { kind: "api_compose", steps: [] },
    });
    expect(out.name).toBe("dyn.p");
  });
});

describe("batchUpsertDynamicTools", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns empty for empty specs", async () => {
    const out = await batchUpsertDynamicTools("ws-1", []);
    expect(out).toEqual([]);
  });
});
