import {
  authorizeInboundWorkspace,
  createInboundTask,
  createLeadRecord,
  findLeadsObjectId,
  logInboundActivity,
  verifyMetaSignature,
} from "@/app/api/workspaces/[workspaceSlug]/inbound/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEmitEvent } from "@/lib/workflows/engine";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

function resolveLeadgenId(payload: Record<string, unknown>) {
  const direct = payload.leadgen_id;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
  const changes =
    entry && typeof entry === "object" && Array.isArray((entry as { changes?: unknown[] }).changes)
      ? (entry as { changes: Array<{ value?: Record<string, unknown> }> }).changes
      : [];
  const changeValue = changes[0]?.value;
  if (changeValue && typeof changeValue.leadgen_id === "string" && changeValue.leadgen_id.trim().length > 0) {
    return changeValue.leadgen_id.trim();
  }
  return null;
}

async function fetchMetaLeadDetails(leadgenId: string, accessToken: string) {
  const endpoint = `https://graph.facebook.com/v22.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeInboundWorkspace(workspaceSlug, request);
    if ("error" in auth) {
      return auth.error;
    }
    const workspace = auth.context;

    const rawBody = await request.text();
    const payload = (JSON.parse(rawBody || "{}") as Record<string, unknown>) ?? {};
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (appSecret) {
      const signature = request.headers.get("x-hub-signature-256");
      if (!verifyMetaSignature(rawBody, signature, appSecret)) {
        return Response.json({ error: "Invalid Meta signature." }, { status: 401 });
      }
    }

    const leadgenId = resolveLeadgenId(payload);
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? "";
    const leadDetail =
      leadgenId && pageAccessToken ? await fetchMetaLeadDetails(leadgenId, pageAccessToken) : null;

    const leadsObjectId = await findLeadsObjectId(workspace.workspaceId);
    const leadRecordId = await createLeadRecord({
      workspaceId: workspace.workspaceId,
      objectId: leadsObjectId,
      data: {
        name: "Lead Meta Ads",
        source: "meta_ads",
        status: "new",
        leadgen_id: leadgenId,
        meta_detail: leadDetail,
        payload,
      },
    });

    const taskId = await createInboundTask({
      workspaceId: workspace.workspaceId,
      sourceRecordId: leadRecordId,
      type: "inbound_lead",
      title: "Inbound lead (Meta Ads)",
      metadata: {
        channel: "meta_ads",
        leadgen_id: leadgenId,
        payload,
        lead_detail: leadDetail,
      },
    });

    if (leadRecordId && leadsObjectId) {
      await logInboundActivity({
        workspaceId: workspace.workspaceId,
        recordId: leadRecordId,
        objectId: leadsObjectId,
        subject: "Inbound Meta Ads",
        body: null,
        data: {
          channel: "meta_ads",
          leadgen_id: leadgenId,
          lead_detail: leadDetail,
        },
      });

      const supabase = getSupabaseAdmin();
      if (supabase) {
        await safeEmitEvent({
          supabase,
          workspaceId: workspace.workspaceId,
          type: "meta.lead_received",
          record: {
            id: leadRecordId,
            objectId: leadsObjectId,
            kind: "crm_people",
            data: { leadgen_id: leadgenId, meta_detail: leadDetail },
          },
          extra: { leadgen_id: leadgenId },
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
    const message = error instanceof Error ? error.message : "Unable to process Meta inbound webhook.";
    return Response.json({ error: message }, { status: 400 });
  }
}
