import { authorizeCrmWrite, requireSupabaseAdmin } from "../../crm/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; sequenceId: string }>;
};

type SequenceRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: unknown;
  created_at: string;
  updated_at: string;
};

function mapSequence(row: SequenceRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? null,
    enabled: Boolean(row.enabled),
    steps: Array.isArray(row.steps) ? row.steps : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireAdmin(auth: Awaited<ReturnType<typeof authorizeCrmWrite>>) {
  if ("error" in auth) return auth.error;
  if (!auth.user.isPlatformAdmin && auth.membership.role !== "admin") {
    return Response.json({ error: "Admin role required." }, { status: 403 });
  }
  return null;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, sequenceId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_sequences")
      .select("id, workspace_id, name, description, enabled, steps, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", sequenceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Sequence not found." }, { status: 404 });
    return Response.json({ sequence: mapSequence(data as SequenceRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load sequence.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, sequenceId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    const adminCheck = await requireAdmin(authorization);
    if (adminCheck) return adminCheck;
    if ("error" in authorization) return authorization.error;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (typeof payload.name === "string" && payload.name.trim()) updates.name = payload.name.trim();
    if ("description" in payload) updates.description = typeof payload.description === "string" ? payload.description : null;
    if (typeof payload.enabled === "boolean") updates.enabled = payload.enabled;
    if (Array.isArray(payload.steps)) updates.steps = payload.steps;
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updates provided." }, { status: 400 });
    }
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_sequences")
      .update(updates)
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", sequenceId)
      .select("id, workspace_id, name, description, enabled, steps, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Sequence not found." }, { status: 404 });
    return Response.json({ sequence: mapSequence(data as SequenceRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update sequence.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, sequenceId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    const adminCheck = await requireAdmin(authorization);
    if (adminCheck) return adminCheck;
    if ("error" in authorization) return authorization.error;
    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("workspace_sequences")
      .delete()
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", sequenceId);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete sequence.";
    return Response.json({ error: message }, { status: 400 });
  }
}
