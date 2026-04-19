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

type MergeBody = {
  entity?: string;
  primaryRecordId?: string;
  secondaryRecordIds?: unknown;
  fieldChoices?: Record<string, string>;
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
    if (authorization.membership.role !== "admin" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "Only admins can merge records." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as MergeBody;
    const entity = typeof body.entity === "string" ? body.entity : "";
    const kind = ENTITY_TO_KIND[entity];
    if (!kind) return Response.json({ error: "Invalid entity." }, { status: 400 });

    const primaryId = typeof body.primaryRecordId === "string" ? body.primaryRecordId : "";
    if (!primaryId) return Response.json({ error: "primaryRecordId required." }, { status: 400 });

    const secondaryIds = Array.isArray(body.secondaryRecordIds)
      ? body.secondaryRecordIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (secondaryIds.length === 0) {
      return Response.json({ error: "secondaryRecordIds required." }, { status: 400 });
    }

    const fieldChoices =
      body.fieldChoices && typeof body.fieldChoices === "object" && !Array.isArray(body.fieldChoices)
        ? body.fieldChoices
        : {};

    const supabase = requireSupabaseAdmin();
    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, kind);
    if (!objectId) return Response.json({ error: "CRM object not initialized." }, { status: 404 });

    const ids = [primaryId, ...secondaryIds];
    const { data: rows, error: loadError } = await supabase
      .from("records")
      .select("id, object_id, data")
      .eq("workspace_id", authorization.workspaceId)
      .eq("object_id", objectId)
      .is("deleted_at", null)
      .in("id", ids);
    if (loadError) throw new Error(loadError.message);

    const rowMap = new Map<string, { id: string; object_id: string; data: Record<string, unknown> }>();
    for (const row of (rows ?? []) as Array<{ id: string; object_id: string; data: Record<string, unknown> | null }>) {
      rowMap.set(row.id, { id: row.id, object_id: row.object_id, data: row.data ?? {} });
    }
    const primary = rowMap.get(primaryId);
    if (!primary) return Response.json({ error: "Primary record not found." }, { status: 404 });
    const secondaries = secondaryIds
      .map((id) => rowMap.get(id))
      .filter((row): row is { id: string; object_id: string; data: Record<string, unknown> } => Boolean(row));

    const mergedData: Record<string, unknown> = { ...primary.data };
    for (const secondary of secondaries) {
      for (const [key, value] of Object.entries(secondary.data)) {
        const choice = fieldChoices[key];
        if (choice && choice.startsWith("secondary-") && choice.endsWith(secondary.id)) {
          mergedData[key] = value;
          continue;
        }
        if (choice === "primary") continue;
        const currentPrimary = mergedData[key];
        if (currentPrimary === undefined || currentPrimary === null || currentPrimary === "") {
          mergedData[key] = value;
        }
      }
    }

    const { error: updateError } = await supabase
      .from("records")
      .update({ data: mergedData, updated_at: new Date().toISOString() })
      .eq("id", primaryId)
      .eq("workspace_id", authorization.workspaceId);
    if (updateError) throw new Error(updateError.message);

    const secondaryIdList = secondaries.map((row) => row.id);

    if (secondaryIdList.length > 0) {
      const { error: actErr } = await supabase
        .from("record_activities")
        .update({ record_id: primaryId })
        .eq("workspace_id", authorization.workspaceId)
        .in("record_id", secondaryIdList);
      if (actErr) throw new Error(actErr.message);

      const { error: taskErr } = await supabase
        .from("workspace_tasks")
        .update({ source_record_id: primaryId })
        .eq("workspace_id", authorization.workspaceId)
        .in("source_record_id", secondaryIdList);
      if (taskErr) {
        console.error("bulk merge tasks update failed", taskErr.message);
      }

      for (const secondary of secondaries) {
        const mergedPayload: Record<string, unknown> = {
          ...secondary.data,
          merged_into: primaryId,
        };
        const { error: softErr } = await supabase
          .from("records")
          .update({ deleted_at: new Date().toISOString(), data: mergedPayload })
          .eq("id", secondary.id)
          .eq("workspace_id", authorization.workspaceId);
        if (softErr) {
          console.error("soft delete secondary failed", softErr.message);
        }
      }
    }

    await logRecordActivity(supabase, {
      workspaceId: authorization.workspaceId,
      recordId: primaryId,
      objectId: primary.object_id,
      type: "merged",
      subject: `${secondaries.length} duplicados fusionados`,
      data: { merged_from: secondaryIdList },
      authorUserId: authorization.user.id,
    });

    return Response.json({
      primaryRecordId: primaryId,
      mergedFrom: secondaryIdList,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to merge records.";
    return Response.json({ error: message }, { status: 400 });
  }
}
