import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { computeFieldDiff, logRecordHistory } from "@/lib/recordHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type UpdateRecordPayload = {
  data?: Record<string, unknown>;
};

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function extractOfferLabel(data: Record<string, unknown>) {
  const candidateKeys = ["offer_name", "title", "company_name", "name"];
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "Oferta";
}

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
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
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

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
    const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: record, error } = await supabase
      .from("records")
      .select("id, workspace_id, object_id, data, created_at, updated_at, deleted_at")
      .eq("id", recordId)
      .eq("workspace_id", membership.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!record) return Response.json({ error: "Record not found." }, { status: 404 });

    const url = new URL(request.url);
    const includeHistory = url.searchParams.get("includeHistory") === "true";
    let history: Array<Record<string, unknown>> | undefined;
    if (includeHistory) {
      const { data: activities } = await supabase
        .from("record_activities")
        .select("id, type, subject, body, data, created_at, author_user_id, author_agent_id")
        .eq("workspace_id", membership.workspaceId)
        .eq("record_id", recordId)
        .order("created_at", { ascending: false })
        .limit(200);
      history = (activities ?? []).map((row) => ({
        id: String((row as { id: unknown }).id),
        type: String((row as { type: unknown }).type),
        subject: (row as { subject?: string | null }).subject ?? null,
        body: (row as { body?: string | null }).body ?? null,
        data: (row as { data?: unknown }).data ?? null,
        createdAt: String((row as { created_at: unknown }).created_at),
        authorUserId: (row as { author_user_id?: string | null }).author_user_id ?? null,
        authorAgentId: (row as { author_agent_id?: string | null }).author_agent_id ?? null,
      }));
    }

    return Response.json({ record: mapRecordRow(record as Record<string, unknown>), history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch record.";
    return Response.json({ error: message }, { status: 400 });
  }
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
    const { data: existingRecord, error: existingRecordError } = await supabase
      .from("records")
      .select("id, object_id, data, deleted_at")
      .eq("id", recordId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingRecordError) {
      throw new Error(existingRecordError.message);
    }

    if (!existingRecord) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    const { data: updatedRecord, error } = await supabase
      .from("records")
      .update({ data: body.data })
      .eq("id", recordId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .is("deleted_at", null)
      .select("id, workspace_id, object_id, data, created_at, updated_at, deleted_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!updatedRecord) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    const previousData =
      existingRecord.data && typeof existingRecord.data === "object" && !Array.isArray(existingRecord.data)
        ? (existingRecord.data as Record<string, unknown>)
        : {};
    const nextData =
      updatedRecord.data && typeof updatedRecord.data === "object" && !Array.isArray(updatedRecord.data)
        ? (updatedRecord.data as Record<string, unknown>)
        : {};
    const previousStatus = normalizeStatus(previousData.status);
    const nextStatus = normalizeStatus(nextData.status);

    const diff = computeFieldDiff(previousData, nextData);
    if (diff.length > 0) {
      await logRecordHistory({
        supabase,
        workspaceId: authorization.membership.workspaceId,
        objectId: String(existingRecord.object_id),
        recordId,
        actor: { userId: authorization.user.id },
        type: "record.updated",
        diff,
      });
    }

    if (previousStatus !== "approved" && nextStatus === "approved") {
      try {
        const { data: objectRow } = await supabase
          .from("workspace_objects")
          .select("name")
          .eq("id", String(existingRecord.object_id))
          .eq("workspace_id", authorization.membership.workspaceId)
          .maybeSingle();
        const objectName = String(objectRow?.name ?? "").toLowerCase();
        if (objectName.includes("offer")) {
          const { data: activityAgent } = await supabase
            .from("workspace_agents")
            .select("id")
            .eq("workspace_id", authorization.membership.workspaceId)
            .in("type", ["worker", "copilot"])
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (activityAgent?.id) {
            await supabase.from("agent_activity").insert({
              workspace_id: authorization.membership.workspaceId,
              agent_id: String(activityAgent.id),
              action: "rate_offer.approved",
              details: {
                record_id: recordId,
                offer: extractOfferLabel(nextData),
                approved_by: authorization.user.email ?? authorization.user.id,
                previous_status: previousStatus || null,
                status: nextStatus,
              },
            });
          }
        }
      } catch {
        // Keep record updates resilient even if activity logging fails.
      }
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

    const { data: existingRecord } = await supabase
      .from("records")
      .select("id, object_id")
      .eq("id", recordId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .is("deleted_at", null)
      .maybeSingle();

    const { data: deletedRecord, error } = await supabase
      .from("records")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", recordId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .is("deleted_at", null)
      .select("id, deleted_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!deletedRecord) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    if (existingRecord?.object_id) {
      await logRecordHistory({
        supabase,
        workspaceId: authorization.membership.workspaceId,
        objectId: String(existingRecord.object_id),
        recordId,
        actor: { userId: authorization.user.id },
        type: "record.deleted",
      });
    }

    return Response.json({
      deletedRecordId: deletedRecord.id,
      deletedAt: deletedRecord.deleted_at ? String(deletedRecord.deleted_at) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete record.";
    return Response.json({ error: message }, { status: 400 });
  }
}
