import {
  authorizeCrmWrite,
  findCrmObjectIdByKind,
  findRecordByFieldValues,
  logRecordActivity,
  mapRecordRow,
  normalizeDomain,
  normalizeText,
  requireSupabaseAdmin,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { safeEmitEvent } from "@/lib/workflows/engine";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateCompanyRequest = {
  name?: string;
  domain?: string;
  industry?: string;
  size?: string;
  ownerUserId?: string;
  owner_user_id?: string;
  data?: Record<string, unknown>;
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as CreateCompanyRequest;
    const name = normalizeText(payload.name ?? payload.data?.name);
    const domain = normalizeDomain(payload.domain ?? payload.data?.domain);

    if (!name && !domain) {
      return Response.json(
        { error: "At least one of name or domain is required." },
        { status: 400 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, "crm_companies");
    if (!objectId) {
      return Response.json({ error: "CRM Companies object not provisioned." }, { status: 409 });
    }

    const candidates: Array<{ key: string; value: string }> = [];
    if (domain) candidates.push({ key: "domain", value: domain });
    if (name) candidates.push({ key: "name", value: name });

    const existingRecordId = await findRecordByFieldValues(
      supabase,
      authorization.workspaceId,
      objectId,
      candidates,
    );

    const mergedData: Record<string, unknown> = { ...(payload.data ?? {}) };
    if (name) mergedData.name = name;
    if (domain) mergedData.domain = domain;
    const industry = normalizeText(payload.industry ?? payload.data?.industry);
    if (industry) mergedData.industry = industry;
    const size = normalizeText(payload.size ?? payload.data?.size);
    if (size) mergedData.size = size;
    const ownerUserId = normalizeText(payload.ownerUserId ?? payload.owner_user_id ?? payload.data?.owner_user_id);
    if (ownerUserId) mergedData.owner_user_id = ownerUserId;

    if (existingRecordId) {
      const { data: existing } = await supabase
        .from("records")
        .select("data")
        .eq("id", existingRecordId)
        .maybeSingle();
      const existingData = (existing?.data as Record<string, unknown>) ?? {};

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

      return Response.json(
        { record: mapRecordRow(updated as Record<string, unknown>), matched: true },
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
      subject: "Empresa creada",
      body: name ?? domain ?? "Nueva empresa en CRM.",
      authorUserId: authorization.user.id,
    });

    const createdMapped = mapRecordRow(created as Record<string, unknown>);
    await safeEmitEvent({
      supabase,
      workspaceId: authorization.workspaceId,
      type: "company.created",
      record: { id: createdMapped.id, objectId, kind: "crm_companies", data: createdMapped.data },
      actorUserId: authorization.user.id,
    });

    return Response.json(
      { record: createdMapped, matched: false },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upsert company.";
    return Response.json({ error: message }, { status: 400 });
  }
}
