import {
  authorizeCrmWrite,
  logRecordActivity,
  mapRecordRow,
  requireSupabaseAdmin,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { safeEmitEvent } from "@/lib/workflows/engine";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type UpdateDealRequest = {
  stageId?: string;
  stage_id?: string;
  data?: Record<string, unknown>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as UpdateDealRequest;
    const supabase = requireSupabaseAdmin();

    const { data: existing, error: loadError } = await supabase
      .from("records")
      .select("id, workspace_id, object_id, data, created_at, updated_at")
      .eq("id", recordId)
      .eq("workspace_id", authorization.workspaceId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!existing) {
      return Response.json({ error: "Deal record not found." }, { status: 404 });
    }

    const existingData = (existing.data as Record<string, unknown>) ?? {};
    const newStageId =
      typeof (payload.stageId ?? payload.stage_id) === "string"
        ? String(payload.stageId ?? payload.stage_id)
        : typeof payload.data?.stage_id === "string"
          ? String(payload.data.stage_id)
          : null;

    let newStageType: "active" | "won" | "lost" | null = null;
    if (newStageId && newStageId !== existingData.stage_id) {
      const { data: stageRow, error: stageError } = await supabase
        .from("workspace_pipeline_stages")
        .select("id, pipeline_id, stage_type")
        .eq("id", newStageId)
        .eq("workspace_id", authorization.workspaceId)
        .maybeSingle();
      if (stageError) throw new Error(stageError.message);
      if (!stageRow) {
        return Response.json({ error: "Target stage not found." }, { status: 404 });
      }
      newStageType = stageRow.stage_type as "active" | "won" | "lost";
    }

    const mergedData: Record<string, unknown> = {
      ...existingData,
      ...(payload.data ?? {}),
    };
    if (newStageId) mergedData.stage_id = newStageId;

    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update({
        data: mergedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("id, workspace_id, object_id, data, created_at, updated_at")
      .single();

    if (updateError) throw new Error(updateError.message);

    if (newStageId && newStageId !== existingData.stage_id) {
      const activityType =
        newStageType === "won" ? "deal_won" : newStageType === "lost" ? "deal_lost" : "status_change";
      await logRecordActivity(supabase, {
        workspaceId: authorization.workspaceId,
        recordId,
        objectId: String(existing.object_id),
        type: activityType,
        subject:
          activityType === "deal_won"
            ? "Oportunidad ganada"
            : activityType === "deal_lost"
              ? "Oportunidad perdida"
              : "Cambio de etapa",
        data: {
          from_stage_id: existingData.stage_id ?? null,
          to_stage_id: newStageId,
          stage_type: newStageType,
        },
        authorUserId: authorization.user.id,
      });
    }

    const mappedRecord = mapRecordRow(updated as Record<string, unknown>);
    if (newStageId && newStageId !== existingData.stage_id) {
      const recordEvent = {
        id: recordId,
        objectId: String(existing.object_id),
        kind: "crm_deals" as const,
        data: mappedRecord.data,
      };
      await safeEmitEvent({
        supabase,
        workspaceId: authorization.workspaceId,
        type: "deal.stage_changed",
        record: recordEvent,
        extra: {
          from_stage_id: existingData.stage_id ?? null,
          to_stage_id: newStageId,
          stage_type: newStageType,
        },
      });
      if (newStageType === "won") {
        await safeEmitEvent({
          supabase,
          workspaceId: authorization.workspaceId,
          type: "deal.won",
          record: recordEvent,
          extra: { to_stage_id: newStageId },
        });
      } else if (newStageType === "lost") {
        await safeEmitEvent({
          supabase,
          workspaceId: authorization.workspaceId,
          type: "deal.lost",
          record: recordEvent,
          extra: { to_stage_id: newStageId },
        });
      }
    }

    return Response.json({ record: mappedRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update deal.";
    return Response.json({ error: message }, { status: 400 });
  }
}
