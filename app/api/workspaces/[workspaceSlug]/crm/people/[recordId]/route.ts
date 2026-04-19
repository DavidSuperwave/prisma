import {
  authorizeCrmWrite,
  logRecordActivity,
  mapRecordRow,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  requireSupabaseAdmin,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { safeEmitEvent } from "@/lib/workflows/engine";
import { safeRecomputePersonScore } from "@/lib/crm/score";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type UpdatePersonRequest = {
  fullName?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  stage?: string;
  source?: string;
  ownerUserId?: string;
  owner_user_id?: string;
  score?: number;
  companyId?: string;
  company_id?: string;
  data?: Record<string, unknown>;
};

// Canonical stage vocabulary (superset). See people/route.ts for rationale.
const ALLOWED_STAGES = new Set([
  "new",
  "lead",
  "qualified",
  "opportunity",
  "customer",
  "lost",
  "unqualified",
]);

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as UpdatePersonRequest;
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
      return Response.json({ error: "Person record not found." }, { status: 404 });
    }

    const existingData = (existing.data as Record<string, unknown>) ?? {};
    const updates: Record<string, unknown> = {};
    const fullName = normalizeText(payload.fullName ?? payload.full_name ?? payload.data?.full_name);
    if (fullName) updates.full_name = fullName;
    const email = normalizeEmail(payload.email ?? payload.data?.email);
    if (email) updates.email = email;
    const phone = normalizePhone(payload.phone ?? payload.data?.phone);
    if (phone) updates.phone = phone;

    const stageRaw = normalizeText(payload.stage ?? payload.data?.stage)?.toLowerCase();
    const nextStage = stageRaw && ALLOWED_STAGES.has(stageRaw) ? stageRaw : null;
    if (nextStage) updates.stage = nextStage;

    const source = normalizeText(payload.source ?? payload.data?.source);
    if (source) updates.source = source;
    const ownerUserId = normalizeText(payload.ownerUserId ?? payload.owner_user_id ?? payload.data?.owner_user_id);
    if (ownerUserId) updates.owner_user_id = ownerUserId;
    if (typeof payload.score === "number") updates.score = payload.score;
    const companyId = normalizeText(payload.companyId ?? payload.company_id ?? payload.data?.company_id);
    if (companyId) updates.company_id = companyId;

    if (payload.data) {
      Object.assign(updates, payload.data, updates);
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updatable fields provided." }, { status: 400 });
    }

    const previousStage =
      typeof existingData.stage === "string" ? (existingData.stage as string).toLowerCase() : null;

    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update({
        data: { ...existingData, ...updates },
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select("id, workspace_id, object_id, data, created_at, updated_at")
      .single();

    if (updateError) throw new Error(updateError.message);

    if (nextStage && previousStage !== nextStage) {
      await logRecordActivity(supabase, {
        workspaceId: authorization.workspaceId,
        recordId,
        objectId: String(existing.object_id),
        type: "status_change",
        subject: `Etapa: ${previousStage ?? "—"} → ${nextStage}`,
        data: { from: previousStage, to: nextStage },
        authorUserId: authorization.user.id,
      });
    }

    await safeRecomputePersonScore(supabase, authorization.workspaceId, recordId);

    const mappedRecord = mapRecordRow(updated as Record<string, unknown>);
    await safeEmitEvent({
      supabase,
      workspaceId: authorization.workspaceId,
      type: "lead.updated",
      record: {
        id: recordId,
        objectId: String(existing.object_id),
        kind: "crm_people",
        data: mappedRecord.data,
      },
      actorUserId: authorization.user.id,
    });
    if (nextStage && previousStage !== nextStage) {
      await safeEmitEvent({
        supabase,
        workspaceId: authorization.workspaceId,
        type: "lead.stage_changed",
        record: {
          id: recordId,
          objectId: String(existing.object_id),
          kind: "crm_people",
          data: mappedRecord.data,
        },
        extra: { from: previousStage, to: nextStage },
      });
      if (nextStage === "qualified") {
        await safeEmitEvent({
          supabase,
          workspaceId: authorization.workspaceId,
          type: "lead.qualified",
          record: {
            id: recordId,
            objectId: String(existing.object_id),
            kind: "crm_people",
            data: mappedRecord.data,
          },
          extra: { from: previousStage, to: nextStage },
        });
      }
    }

    return Response.json({ record: mappedRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update person.";
    return Response.json({ error: message }, { status: 400 });
  }
}
