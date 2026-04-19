import {
  authorizeCrmWrite,
  findCrmObjectIdByKind,
  logRecordActivity,
  requireSupabaseAdmin,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { PrismaCrmKind } from "@/lib/workspaceStore";

type Context = { params: Promise<{ workspaceSlug: string }> };

type BulkBody = {
  entity?: string;
  recordIds?: unknown;
  operation?: {
    type?: string;
    payload?: Record<string, unknown>;
  };
};

const ENTITY_TO_KIND: Record<string, PrismaCrmKind> = {
  people: "crm_people",
  companies: "crm_companies",
  deals: "crm_deals",
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as BulkBody;
    const entity = typeof body.entity === "string" ? body.entity : "";
    const kind = ENTITY_TO_KIND[entity];
    if (!kind) {
      return Response.json({ error: "Invalid entity." }, { status: 400 });
    }

    const recordIds = Array.isArray(body.recordIds)
      ? body.recordIds.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (recordIds.length === 0) {
      return Response.json({ error: "recordIds required." }, { status: 400 });
    }
    if (recordIds.length > 500) {
      return Response.json({ error: "Too many records (max 500)." }, { status: 400 });
    }

    const opType = typeof body.operation?.type === "string" ? body.operation.type : "";
    const payload = body.operation?.payload ?? {};
    const supabase = requireSupabaseAdmin();

    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, kind);
    if (!objectId) {
      return Response.json({ error: "CRM object not initialized." }, { status: 404 });
    }

    const { data: existingRows, error: loadError } = await supabase
      .from("records")
      .select("id, object_id, data")
      .eq("workspace_id", authorization.workspaceId)
      .eq("object_id", objectId)
      .is("deleted_at", null)
      .in("id", recordIds);
    if (loadError) throw new Error(loadError.message);

    const existing = (existingRows ?? []) as Array<{ id: string; object_id: string; data: Record<string, unknown> | null }>;
    if (existing.length === 0) {
      return Response.json({ updated: 0, errors: [] });
    }

    const errors: Array<{ id: string; message: string }> = [];
    let updated = 0;
    const nowIso = new Date().toISOString();

    if (opType === "delete") {
      const { error } = await supabase
        .from("records")
        .update({ deleted_at: nowIso })
        .eq("workspace_id", authorization.workspaceId)
        .in("id", existing.map((row) => row.id));
      if (error) throw new Error(error.message);
      updated = existing.length;
      return Response.json({ updated, errors });
    }

    const patchPerRow = (row: { id: string; object_id: string; data: Record<string, unknown> | null }) => {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...data };
      const activityEvents: Array<{ type: string; subject?: string; data?: Record<string, unknown> }> = [];

      if (opType === "update_field") {
        const field = typeof payload.field === "string" ? payload.field : null;
        if (!field) throw new Error("field is required");
        const value = payload.value ?? null;
        next[field] = value;
      } else if (opType === "change_stage") {
        const stage = typeof payload.stage === "string" ? payload.stage : null;
        if (!stage) throw new Error("stage is required");
        if (kind === "crm_deals") {
          const previous = typeof data.stage_id === "string" ? data.stage_id : null;
          next.stage_id = stage;
          if (previous !== stage) {
            activityEvents.push({
              type: "status_change",
              subject: "Cambio de etapa (bulk)",
              data: { from_stage_id: previous, to_stage_id: stage },
            });
          }
        } else {
          const previous = typeof data.stage === "string" ? data.stage : null;
          next.stage = stage;
          if (previous !== stage) {
            activityEvents.push({
              type: "status_change",
              subject: `Etapa: ${previous ?? "—"} → ${stage}`,
              data: { from: previous, to: stage },
            });
          }
        }
      } else if (opType === "change_owner") {
        const owner = typeof payload.owner_user_id === "string" ? payload.owner_user_id : null;
        if (!owner) throw new Error("owner_user_id is required");
        next.owner_user_id = owner;
      } else {
        throw new Error(`Unsupported operation type: ${opType}`);
      }

      return { next, activityEvents };
    };

    for (const row of existing) {
      try {
        const { next, activityEvents } = patchPerRow(row);
        const { error: updateError } = await supabase
          .from("records")
          .update({ data: next, updated_at: nowIso })
          .eq("id", row.id)
          .eq("workspace_id", authorization.workspaceId);
        if (updateError) {
          errors.push({ id: row.id, message: updateError.message });
          continue;
        }
        updated += 1;
        for (const event of activityEvents) {
          await logRecordActivity(supabase, {
            workspaceId: authorization.workspaceId,
            recordId: row.id,
            objectId: row.object_id,
            type: event.type,
            subject: event.subject ?? null,
            data: event.data ?? {},
            authorUserId: authorization.user.id,
          });
        }
      } catch (err) {
        errors.push({ id: row.id, message: err instanceof Error ? err.message : "failed" });
      }
    }

    return Response.json({ updated, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run bulk operation.";
    return Response.json({ error: message }, { status: 400 });
  }
}
