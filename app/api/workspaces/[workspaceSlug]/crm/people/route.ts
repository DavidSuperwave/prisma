import {
  authorizeCrmWrite,
  findCrmObjectIdByKind,
  findRecordByFieldValues,
  logRecordActivity,
  mapRecordRow,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  requireSupabaseAdmin,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { safeEmitEvent } from "@/lib/workflows/engine";
import { safeRecomputePersonScore } from "@/lib/crm/score";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreatePersonRequest = {
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
  source_channel?: string;
  activity?: { type?: string; subject?: string | null; body?: string | null; data?: Record<string, unknown> };
};

// Canonical stage vocabulary (superset). Legacy `new`/`lost` map to
// `lead`/`unqualified`. Keep both so older data and skills remain compatible.
const ALLOWED_STAGES = new Set([
  "new",
  "lead",
  "qualified",
  "opportunity",
  "customer",
  "lost",
  "unqualified",
]);

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as CreatePersonRequest;
    const fullName = normalizeText(payload.fullName ?? payload.full_name ?? payload.data?.full_name);
    const email = normalizeEmail(payload.email ?? payload.data?.email);
    const phone = normalizePhone(payload.phone ?? payload.data?.phone);
    const stageRaw = normalizeText(payload.stage ?? payload.data?.stage)?.toLowerCase() ?? "new";
    const stage = ALLOWED_STAGES.has(stageRaw) ? stageRaw : "new";

    if (!fullName && !email && !phone) {
      return Response.json(
        { error: "At least one of fullName, email, or phone is required." },
        { status: 400 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, "crm_people");
    if (!objectId) {
      return Response.json({ error: "CRM People object not provisioned." }, { status: 409 });
    }

    const candidates: Array<{ key: string; value: string }> = [];
    if (email) candidates.push({ key: "email", value: email });
    if (phone) candidates.push({ key: "phone", value: phone });

    const existingRecordId = candidates.length
      ? await findRecordByFieldValues(supabase, authorization.workspaceId, objectId, candidates)
      : null;

    const mergedData: Record<string, unknown> = {
      ...(payload.data ?? {}),
    };
    if (fullName) mergedData.full_name = fullName;
    if (email) mergedData.email = email;
    if (phone) mergedData.phone = phone;
    mergedData.stage = stage;
    const source = normalizeText(payload.source ?? payload.data?.source);
    if (source) mergedData.source = source;
    const ownerUserId = normalizeText(payload.ownerUserId ?? payload.owner_user_id ?? payload.data?.owner_user_id);
    if (ownerUserId) mergedData.owner_user_id = ownerUserId;
    if (typeof payload.score === "number") mergedData.score = payload.score;
    const companyId = normalizeText(payload.companyId ?? payload.company_id ?? payload.data?.company_id);
    if (companyId) mergedData.company_id = companyId;

    if (existingRecordId) {
      const { data: existing, error: loadError } = await supabase
        .from("records")
        .select("id, workspace_id, object_id, data, created_at, updated_at")
        .eq("id", existingRecordId)
        .maybeSingle();
      if (loadError || !existing) {
        throw new Error(loadError?.message ?? "Existing record not found.");
      }
      const existingData = (existing.data as Record<string, unknown>) ?? {};
      const previousStage =
        typeof existingData.stage === "string" ? (existingData.stage as string).toLowerCase() : null;

      const { data: updated, error: updateError } = await supabase
        .from("records")
        .update({
          data: { ...existingData, ...mergedData },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRecordId)
        .select("id, workspace_id, object_id, data, created_at, updated_at")
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (previousStage && previousStage !== stage) {
        await logRecordActivity(supabase, {
          workspaceId: authorization.workspaceId,
          recordId: existingRecordId,
          objectId,
          type: "status_change",
          subject: `Etapa: ${previousStage} → ${stage}`,
          data: { from: previousStage, to: stage },
          authorUserId: authorization.user.id,
        });
      }

      if (payload.activity?.type) {
        await logRecordActivity(supabase, {
          workspaceId: authorization.workspaceId,
          recordId: existingRecordId,
          objectId,
          type: payload.activity.type,
          subject: payload.activity.subject ?? null,
          body: payload.activity.body ?? null,
          data: payload.activity.data ?? {},
          authorUserId: authorization.user.id,
        });
      }

      await safeRecomputePersonScore(supabase, authorization.workspaceId, existingRecordId);

      const updatedRecord = mapRecordRow(updated as Record<string, unknown>);
      await safeEmitEvent({
        supabase,
        workspaceId: authorization.workspaceId,
        type: "lead.updated",
        record: { id: existingRecordId, objectId, kind: "crm_people", data: updatedRecord.data },
        actorUserId: authorization.user.id,
      });
      if (previousStage && previousStage !== stage) {
        await safeEmitEvent({
          supabase,
          workspaceId: authorization.workspaceId,
          type: "lead.stage_changed",
          record: { id: existingRecordId, objectId, kind: "crm_people", data: updatedRecord.data },
          extra: { from: previousStage, to: stage },
        });
        if (stage === "qualified") {
          await safeEmitEvent({
            supabase,
            workspaceId: authorization.workspaceId,
            type: "lead.qualified",
            record: { id: existingRecordId, objectId, kind: "crm_people", data: updatedRecord.data },
            extra: { from: previousStage, to: stage },
          });
        }
      }

      return Response.json(
        { record: updatedRecord, matched: true },
        { status: 200 },
      );
    }

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

    if (createError) {
      throw new Error(createError.message);
    }

    await logRecordActivity(supabase, {
      workspaceId: authorization.workspaceId,
      recordId: String(created.id),
      objectId,
      type: "note",
      subject: "Contacto creado",
      body: fullName ? `Nuevo contacto: ${fullName}` : "Contacto registrado en CRM.",
      data: { stage, source: source ?? payload.source_channel ?? null },
      authorUserId: authorization.user.id,
    });

    if (payload.activity?.type) {
      await logRecordActivity(supabase, {
        workspaceId: authorization.workspaceId,
        recordId: String(created.id),
        objectId,
        type: payload.activity.type,
        subject: payload.activity.subject ?? null,
        body: payload.activity.body ?? null,
        data: payload.activity.data ?? {},
        authorUserId: authorization.user.id,
      });
    }

    await safeRecomputePersonScore(supabase, authorization.workspaceId, String(created.id));

    const createdMapped = mapRecordRow(created as Record<string, unknown>);
    await safeEmitEvent({
      supabase,
      workspaceId: authorization.workspaceId,
      type: "lead.created",
      record: { id: createdMapped.id, objectId, kind: "crm_people", data: createdMapped.data },
      actorUserId: authorization.user.id,
    });

    return Response.json(
      { record: createdMapped, matched: false },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upsert person.";
    return Response.json({ error: message }, { status: 400 });
  }
}
