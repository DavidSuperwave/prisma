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

type FormInboundPayload = {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  source?: string;
  [key: string]: unknown;
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeInboundWorkspace(workspaceSlug, request);
    if ("error" in auth) {
      return auth.error;
    }
    const workspace = auth.context;

    const payload = (await request.json().catch(() => ({}))) as FormInboundPayload;
    const leadsObjectId = await findLeadsObjectId(workspace.workspaceId);
    const leadRecordId = await createLeadRecord({
      workspaceId: workspace.workspaceId,
      objectId: leadsObjectId,
      data: {
        name: payload.name ?? "Lead Form",
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        message: payload.message ?? null,
        source: payload.source ?? "web_form",
        status: "new",
        form_payload: payload,
      },
    });

    const taskId = await createInboundTask({
      workspaceId: workspace.workspaceId,
      sourceRecordId: leadRecordId,
      type: "inbound_lead",
      title: "Inbound lead (Form)",
      metadata: {
        channel: "form",
        payload,
      },
    });

    if (leadRecordId && leadsObjectId) {
      await logInboundActivity({
        workspaceId: workspace.workspaceId,
        recordId: leadRecordId,
        objectId: leadsObjectId,
        subject: "Inbound web form",
        body: typeof payload.message === "string" ? payload.message : null,
        data: {
          channel: "form",
          source: payload.source ?? "web_form",
          payload,
        },
      });

      const supabase = getSupabaseAdmin();
      if (supabase) {
        await safeEmitEvent({
          supabase,
          workspaceId: workspace.workspaceId,
          type: "form.submitted",
          record: {
            id: leadRecordId,
            objectId: leadsObjectId,
            kind: "crm_people",
            data: payload as Record<string, unknown>,
          },
          extra: { channel: "form", source: payload.source ?? "web_form" },
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
    const message = error instanceof Error ? error.message : "Unable to process form inbound webhook.";
    return Response.json({ error: message }, { status: 400 });
  }
}
