import {
  authorizeCrmWrite,
  logRecordActivity,
  mapRecordRow,
  normalizeDomain,
  normalizeText,
  requireSupabaseAdmin,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { safeEmitEvent } from "@/lib/workflows/engine";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type UpdateCompanyRequest = {
  name?: string;
  domain?: string;
  industry?: string;
  size?: string;
  ownerUserId?: string;
  owner_user_id?: string;
  data?: Record<string, unknown>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as UpdateCompanyRequest;
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
      return Response.json({ error: "Company record not found." }, { status: 404 });
    }

    const existingData = (existing.data as Record<string, unknown>) ?? {};
    const updates: Record<string, unknown> = {};

    const name = normalizeText(payload.name ?? payload.data?.name);
    if (name) updates.name = name;
    const domain = normalizeDomain(payload.domain ?? payload.data?.domain);
    if (domain) updates.domain = domain;
    const industry = normalizeText(payload.industry ?? payload.data?.industry);
    if (industry) updates.industry = industry;
    const size = normalizeText(payload.size ?? payload.data?.size);
    if (size) updates.size = size;
    const ownerUserId = normalizeText(payload.ownerUserId ?? payload.owner_user_id ?? payload.data?.owner_user_id);
    if (ownerUserId) updates.owner_user_id = ownerUserId;

    if (payload.data) {
      Object.assign(updates, payload.data, updates);
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updatable fields provided." }, { status: 400 });
    }

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

    await logRecordActivity(supabase, {
      workspaceId: authorization.workspaceId,
      recordId,
      objectId: String(existing.object_id),
      type: "note",
      subject: "Empresa actualizada",
      body: Object.keys(updates)
        .filter((k) => k !== "updated_at")
        .join(", "),
      data: updates,
      authorUserId: authorization.user.id,
    });

    const mappedRecord = mapRecordRow(updated as Record<string, unknown>);
    await safeEmitEvent({
      supabase,
      workspaceId: authorization.workspaceId,
      type: "company.updated",
      record: {
        id: recordId,
        objectId: String(existing.object_id),
        kind: "crm_companies",
        data: mappedRecord.data,
      },
      actorUserId: authorization.user.id,
    });

    return Response.json({ record: mappedRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update company.";
    return Response.json({ error: message }, { status: 400 });
  }
}
