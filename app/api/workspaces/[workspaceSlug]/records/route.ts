import { resolveWorkspaceRequestContext } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { computeFieldDiff, logRecordHistory } from "@/lib/recordHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateRecordRequest = {
  objectId?: string;
  data?: Record<string, unknown>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function mapRecordRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    data: (row.data as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const resolved = await resolveWorkspaceRequestContext(workspaceSlug);
    if (resolved instanceof Response) return resolved;
    const { user, membership } = resolved;
    if (!membership.isPlatformAdmin && membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to modify records." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateRecordRequest;
    const objectId = body.objectId?.trim();
    const payloadData = body.data;

    if (!objectId) {
      return Response.json({ error: "objectId is required." }, { status: 400 });
    }
    if (!payloadData || typeof payloadData !== "object" || Array.isArray(payloadData)) {
      return Response.json({ error: "data must be an object." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("id", objectId)
      .eq("workspace_id", membership.workspaceId)
      .maybeSingle();

    if (objectError) {
      throw new Error(objectError.message);
    }
    if (!objectRow) {
      return Response.json({ error: "Object not found in this workspace." }, { status: 404 });
    }

    const { data: created, error: createError } = await supabase
      .from("records")
      .insert({
        workspace_id: membership.workspaceId,
        object_id: objectId,
        data: payloadData,
        created_by: user.id,
      })
      .select("id, workspace_id, object_id, data, created_at, updated_at")
      .single();

    if (createError) {
      throw new Error(createError.message);
    }

    const createdData =
      created.data && typeof created.data === "object" && !Array.isArray(created.data)
        ? (created.data as Record<string, unknown>)
        : {};

    await logRecordHistory({
      supabase,
      workspaceId: membership.workspaceId,
      objectId,
      recordId: String(created.id),
      actor: { userId: user.id },
      type: "record.created",
      diff: computeFieldDiff({}, createdData),
    });

    return Response.json({ record: mapRecordRow(created as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create record.";
    return Response.json({ error: message }, { status: 400 });
  }
}
