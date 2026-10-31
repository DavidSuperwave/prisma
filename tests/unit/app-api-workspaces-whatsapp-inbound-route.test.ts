import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/workspaces/[workspaceSlug]/inbound/_shared", () => ({
  authorizeInboundWorkspace: vi.fn(),
  createInboundTask: vi.fn(),
  createLeadRecord: vi.fn(),
  findLeadsObjectId: vi.fn(),
  logInboundActivity: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/workflows/engine", () => ({
  safeEmitEvent: vi.fn(),
}));

import {
  authorizeInboundWorkspace,
  createInboundTask,
  createLeadRecord,
  findLeadsObjectId,
  logInboundActivity,
} from "@/app/api/workspaces/[workspaceSlug]/inbound/_shared";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEmitEvent } from "@/lib/workflows/engine";
import { POST } from "@/app/api/workspaces/[workspaceSlug]/inbound/whatsapp/route";

const mockedAuthorizeInboundWorkspace = vi.mocked(authorizeInboundWorkspace);
const mockedCreateInboundTask = vi.mocked(createInboundTask);
const mockedCreateLeadRecord = vi.mocked(createLeadRecord);
const mockedFindLeadsObjectId = vi.mocked(findLeadsObjectId);
const mockedLogInboundActivity = vi.mocked(logInboundActivity);
const mockedGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);
const mockedSafeEmitEvent = vi.mocked(safeEmitEvent);

describe("/api/workspaces/[workspaceSlug]/inbound/whatsapp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedAuthorizeInboundWorkspace.mockResolvedValue({
      context: {
        workspaceId: "ws-1",
      },
    } as never);
    mockedFindLeadsObjectId.mockResolvedValue("obj-leads");
    mockedCreateLeadRecord.mockResolvedValue("rec-lead");
    mockedCreateInboundTask.mockResolvedValue("task-1");
    mockedGetSupabaseAdmin.mockReturnValue({} as never);
    mockedSafeEmitEvent.mockResolvedValue(undefined as never);
  });

  it("creates the lead/task and emits whatsapp.message_received", async () => {
    const request = new Request("https://app.example.com/api/workspaces/demo/inbound/whatsapp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "+5215550001111",
        message: "Hola, vendo autopartes",
        name: "Refacciones Demo",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ workspaceSlug: "demo" }),
    });

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected route handler to return a response.");
    }
    expect(response.status).toBe(201);
    expect(mockedCreateLeadRecord).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      objectId: "obj-leads",
      data: expect.objectContaining({
        name: "Refacciones Demo",
        source: "whatsapp",
        status: "new",
        phone: "+5215550001111",
        message: "Hola, vendo autopartes",
        qualification_status: "collecting",
        qualification_playbook: "prisma-ai-free-website-v1",
        next_action: "Ask what the business does, then qualify with employee count.",
      }),
    });
    expect(mockedCreateInboundTask).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        sourceRecordId: "rec-lead",
        type: "inbound_lead",
      }),
    );
    expect(mockedLogInboundActivity).toHaveBeenCalled();
    expect(mockedSafeEmitEvent).toHaveBeenCalledWith({
      supabase: {},
      workspaceId: "ws-1",
      type: "whatsapp.message_received",
      record: {
        id: "rec-lead",
        objectId: "obj-leads",
        kind: "crm_people",
        data: {
          phone: "+5215550001111",
          message: "Hola, vendo autopartes",
          qualification_status: "collecting",
          next_action: "Ask what the business does, then qualify with employee count.",
        },
      },
      extra: expect.objectContaining({
        channel: "whatsapp",
        from: "+5215550001111",
        message: "Hola, vendo autopartes",
        sdr_playbook: "prisma-ai-free-website-v1",
        qualification_status: "collecting",
        next_question: "business_type",
      }),
    });
  });
});

