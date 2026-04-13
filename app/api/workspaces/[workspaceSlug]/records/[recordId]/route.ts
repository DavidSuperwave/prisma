import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type UpdateRecordPayload = {
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

async function authorizeRecordWrite(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }

  if (!user.isPlatformAdmin && membership.role === "viewer") {
    return { error: Response.json({ error: "You do not have permission to modify records." }, { status: 403 }) };
  }

  return { user, membership };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const authorization = await authorizeRecordWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const body = (await request.json().catch(() => ({}))) as UpdateRecordPayload;
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      return Response.json({ error: "A valid data object is required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();

    const { data: updatedRecord, error } = await supabase
      .from("records")
      .update({ data: body.data })
      .eq("id", recordId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, workspace_id, object_id, data, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!updatedRecord) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    return Response.json({ record: mapRecordRow(updatedRecord as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update record.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const authorization = await authorizeRecordWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const supabase = requireSupabaseAdmin();

    const { data: deletedRecord, error } = await supabase
      .from("records")
      .delete()
      .eq("id", recordId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!deletedRecord) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    return Response.json({ deletedRecordId: deletedRecord.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete record.";
    return Response.json({ error: message }, { status: 400 });
  }
}
