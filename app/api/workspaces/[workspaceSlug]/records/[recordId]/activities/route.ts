import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type CreateActivityRequest = {
  type?: string;
  subject?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  isPinned?: boolean;
  activityTypeId?: string | null;
  occurredAt?: string;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function authorize(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  return { user, membership };
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    recordId: String(row.record_id),
    objectId: String(row.object_id),
    type: String(row.type),
    activityTypeId: row.activity_type_id ? String(row.activity_type_id) : null,
    authorUserId: row.author_user_id ? String(row.author_user_id) : null,
    authorAgentId: row.author_agent_id ? String(row.author_agent_id) : null,
    subject: row.subject ? String(row.subject) : null,
    body: row.body ? String(row.body) : null,
    data: (row.data as Record<string, unknown>) ?? {},
    isPinned: Boolean(row.is_pinned),
    occurredAt: String(row.occurred_at ?? row.created_at),
    createdAt: String(row.created_at),
  };
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const pinnedOnly = url.searchParams.get("pinned") === "true";
    const search = url.searchParams.get("q");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");

    const supabase = requireSupabaseAdmin();
    let query = supabase
      .from("record_activities")
      .select(
        "id, workspace_id, record_id, object_id, type, activity_type_id, author_user_id, author_agent_id, subject, body, data, is_pinned, occurred_at, created_at",
      )
      .eq("workspace_id", auth.membership.workspaceId)
      .eq("record_id", recordId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (type) query = query.eq("type", type);
    if (pinnedOnly) query = query.eq("is_pinned", true);
    if (sinceParam) query = query.gte("occurred_at", sinceParam);
    if (untilParam) query = query.lte("occurred_at", untilParam);
    if (search) query = query.or(`subject.ilike.%${search}%,body.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return Response.json({ activities: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load activities.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.membership.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "Viewers cannot create activities." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as CreateActivityRequest;
    const type = (payload.type ?? "note").trim();
    if (!type) {
      return Response.json({ error: "type is required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: recordRow, error: recordError } = await supabase
      .from("records")
      .select("id, object_id")
      .eq("id", recordId)
      .eq("workspace_id", auth.membership.workspaceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (recordError) throw new Error(recordError.message);
    if (!recordRow) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("record_activities")
      .insert({
        workspace_id: auth.membership.workspaceId,
        record_id: recordId,
        object_id: String(recordRow.object_id),
        type,
        subject: payload.subject ?? null,
        body: payload.body ?? null,
        data: payload.data ?? {},
        is_pinned: Boolean(payload.isPinned),
        activity_type_id: payload.activityTypeId ?? null,
        author_user_id: auth.user.id,
        occurred_at: payload.occurredAt ?? new Date().toISOString(),
      })
      .select(
        "id, workspace_id, record_id, object_id, type, activity_type_id, author_user_id, author_agent_id, subject, body, data, is_pinned, occurred_at, created_at",
      )
      .single();

    if (insertError) {
      if (insertError.message.includes("Max 5 pinned")) {
        return Response.json({ error: insertError.message }, { status: 409 });
      }
      throw new Error(insertError.message);
    }

    return Response.json({ activity: mapRow(inserted as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create activity.";
    return Response.json({ error: message }, { status: 400 });
  }
}
