import {
  authorizeInboundWorkspace,
  createInboundTask,
  createLeadRecord,
  findLeadsObjectId,
  logInboundActivity,
} from "@/app/api/workspaces/[workspaceSlug]/inbound/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEmitEvent } from "@/lib/workflows/engine";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type WhatsappInboundPayload = {
  from?: string;
  message?: string;
  text?: string;
  name?: string;
  contact?: { name?: string; phone?: string };
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeInboundWorkspace(workspaceSlug, request);
    if ("error" in auth) {
      return auth.error;
    }
    const workspace = auth.context;

    const payload = (await request.json().catch(() => ({}))) as WhatsappInboundPayload;
    const inboundText = String(payload.message ?? payload.text ?? "").trim();
    const inboundFrom = String(payload.from ?? payload.contact?.phone ?? "").trim();
    const leadName = String(payload.name ?? payload.contact?.name ?? "").trim();

    const leadsObjectId = await findLeadsObjectId(workspace.workspaceId);
    const leadRecordId = await createLeadRecord({
      workspaceId: workspace.workspaceId,
      objectId: leadsObjectId,
      data: {
        name: leadName || inboundFrom || "Lead WhatsApp",
        source: "whatsapp",
        status: "new",
        phone: inboundFrom || null,
        message: inboundText || null,
        channel_payload: payload,
      },
    });

    const taskId = await createInboundTask({
      workspaceId: workspace.workspaceId,
      sourceRecordId: leadRecordId,
      type: "inbound_lead",
      title: "Inbound lead (WhatsApp)",
      metadata: {
        channel: "whatsapp",
        from: inboundFrom || null,
        message: inboundText || null,
        payload,
      },
    });

    if (leadRecordId && leadsObjectId) {
      await logInboundActivity({
        workspaceId: workspace.workspaceId,
        recordId: leadRecordId,
        objectId: leadsObjectId,
        subject: "Inbound WhatsApp",
        body: inboundText || null,
        data: {
          channel: "whatsapp",
          from: inboundFrom || null,
          payload,
        },
      });

      const supabase = getSupabaseAdmin();
      if (supabase) {
        await safeEmitEvent({
          supabase,
          workspaceId: workspace.workspaceId,
          type: "whatsapp.message_received",
          record: {
            id: leadRecordId,
            objectId: leadsObjectId,
            kind: "crm_people",
            data: { phone: inboundFrom || null, message: inboundText || null },
          },
          extra: { from: inboundFrom, message: inboundText },
        });
      }
    }

    return Response.json(
      {
        ok: true,
        workspaceId: workspace.workspaceId,
        recordId: leadRecordId,
        taskId,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process WhatsApp inbound webhook.";
    return Response.json({ error: message }, { status: 400 });
  }
}
