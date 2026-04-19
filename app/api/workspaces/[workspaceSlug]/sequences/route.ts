import { authorizeCrmWrite, requireSupabaseAdmin } from "../crm/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
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

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_sequences")
      .select("id, workspace_id, name, description, enabled, steps, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ sequences: ((data ?? []) as SequenceRow[]).map(mapSequence) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list sequences.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (!authorization.user.isPlatformAdmin && authorization.membership.role !== "admin") {
      return Response.json({ error: "Admin role required." }, { status: 403 });
    }
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) return Response.json({ error: "name is required." }, { status: 400 });

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_sequences")
      .insert({
        workspace_id: authorization.workspaceId,
        name,
        description: typeof payload.description === "string" ? payload.description : null,
        enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
        steps: Array.isArray(payload.steps) ? payload.steps : [],
      })
      .select("id, workspace_id, name, description, enabled, steps, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ sequence: mapSequence(data as SequenceRow) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create sequence.";
    return Response.json({ error: message }, { status: 400 });
  }
}
