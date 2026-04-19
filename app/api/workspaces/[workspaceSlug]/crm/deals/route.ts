import {
  authorizeCrmWrite,
  findCrmObjectIdByKind,
  logRecordActivity,
  mapRecordRow,
  normalizeText,
  requireSupabaseAdmin,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { safeEmitEvent } from "@/lib/workflows/engine";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateDealRequest = {
  title?: string;
  amount?: number;
  currency?: string;
  pipelineId?: string;
  pipeline_id?: string;
  stageId?: string;
  stage_id?: string;
  confidence?: number;
  closeDate?: string;
  close_date?: string;
  companyId?: string;
  company_id?: string;
  primaryContactId?: string;
  primary_contact_id?: string;
  ownerUserId?: string;
  owner_user_id?: string;
  data?: Record<string, unknown>;
};

async function resolveDefaultPipelineAndStage(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
) {
  const { data: pipeline } = await supabase
    .from("workspace_pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();

  if (!pipeline) return { pipelineId: null, stageId: null };

  const { data: firstStage } = await supabase
    .from("workspace_pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .eq("stage_type", "active")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    pipelineId: String(pipeline.id),
    stageId: firstStage ? String(firstStage.id) : null,
  };
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as CreateDealRequest;
    const title = normalizeText(payload.title ?? payload.data?.title);
    if (!title) {
      return Response.json({ error: "title is required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, "crm_deals");
    if (!objectId) {
      return Response.json({ error: "CRM Deals object not provisioned." }, { status: 409 });
    }

    let pipelineId = normalizeText(payload.pipelineId ?? payload.pipeline_id ?? payload.data?.pipeline_id);
    let stageId = normalizeText(payload.stageId ?? payload.stage_id ?? payload.data?.stage_id);

    if (!pipelineId || !stageId) {
      const fallback = await resolveDefaultPipelineAndStage(supabase, authorization.workspaceId);
      pipelineId = pipelineId ?? fallback.pipelineId;
      stageId = stageId ?? fallback.stageId;
    }

    if (!pipelineId) {
      return Response.json({ error: "No default pipeline found for workspace." }, { status: 409 });
    }
    if (!stageId) {
      return Response.json({ error: "No active stage available in pipeline." }, { status: 409 });
    }

    const { data: stageRow, error: stageError } = await supabase
      .from("workspace_pipeline_stages")
      .select("id, pipeline_id, stage_type")
      .eq("id", stageId)
      .eq("workspace_id", authorization.workspaceId)
      .maybeSingle();
    if (stageError) throw new Error(stageError.message);
    if (!stageRow) {
      return Response.json({ error: "Stage not found in this workspace." }, { status: 404 });
    }
    if (String(stageRow.pipeline_id) !== pipelineId) {
      return Response.json({ error: "Stage does not belong to the provided pipeline." }, { status: 400 });
    }

    const mergedData: Record<string, unknown> = { ...(payload.data ?? {}) };
    mergedData.title = title;
    mergedData.pipeline_id = pipelineId;
    mergedData.stage_id = stageId;
    if (typeof payload.amount === "number") mergedData.amount = payload.amount;
    const currency = normalizeText(payload.currency ?? payload.data?.currency) ?? "USD";
    mergedData.currency = currency;
    if (typeof payload.confidence === "number") mergedData.confidence = payload.confidence;
    const closeDate = normalizeText(payload.closeDate ?? payload.close_date ?? payload.data?.close_date);
    if (closeDate) mergedData.close_date = closeDate;
    const companyId = normalizeText(payload.companyId ?? payload.company_id ?? payload.data?.company_id);
    if (companyId) mergedData.company_id = companyId;
    const primaryContactId = normalizeText(
      payload.primaryContactId ?? payload.primary_contact_id ?? payload.data?.primary_contact_id,
    );
    if (primaryContactId) mergedData.primary_contact_id = primaryContactId;
    const ownerUserId = normalizeText(payload.ownerUserId ?? payload.owner_user_id ?? payload.data?.owner_user_id);
    if (ownerUserId) mergedData.owner_user_id = ownerUserId;

    const { data: created, error: createError } = await supabase
      .from("records")
      .insert({
        workspace_id: authorization.workspaceId,
        object_id: objectId,
        data: mergedData,
        created_by: authorization.user.id,
      })
      .select("id, workspace_id, object_id, data, created_at, updated_at")
      .single();

    if (createError) throw new Error(createError.message);

    await logRecordActivity(supabase, {
      workspaceId: authorization.workspaceId,
      recordId: String(created.id),
      objectId,
      type: "deal_created",
      subject: `Oportunidad creada: ${title}`,
      data: {
        amount: mergedData.amount ?? null,
        currency,
        pipeline_id: pipelineId,
        stage_id: stageId,
      },
      authorUserId: authorization.user.id,
    });

    const createdMapped = mapRecordRow(created as Record<string, unknown>);
    await safeEmitEvent({
      supabase,
      workspaceId: authorization.workspaceId,
      type: "deal.created",
      record: { id: createdMapped.id, objectId, kind: "crm_deals", data: createdMapped.data },
      actorUserId: authorization.user.id,
    });

    return Response.json(
      { record: createdMapped, matched: false },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create deal.";
    return Response.json({ error: message }, { status: 400 });
  }
}
