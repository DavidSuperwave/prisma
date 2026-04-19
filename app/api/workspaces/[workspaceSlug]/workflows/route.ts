import { authorizeCrmWrite, requireSupabaseAdmin } from "../crm/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: unknown;
  steps: unknown;
  created_at: string;
  updated_at: string;
};

type WorkflowPayload = {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  trigger?: unknown;
  steps?: unknown;
};

function mapWorkflow(row: WorkflowRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? null,
    enabled: Boolean(row.enabled),
    trigger: row.trigger ?? {},
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
      .from("workspace_workflows")
      .select("id, workspace_id, name, description, enabled, trigger, steps, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ workflows: ((data ?? []) as WorkflowRow[]).map(mapWorkflow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list workflows.";
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
    const payload = (await request.json().catch(() => ({}))) as WorkflowPayload;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) return Response.json({ error: "name is required." }, { status: 400 });
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_workflows")
      .insert({
        workspace_id: authorization.workspaceId,
        name,
        description: typeof payload.description === "string" ? payload.description : null,
        enabled: payload.enabled ?? true,
        trigger: payload.trigger ?? {},
        steps: Array.isArray(payload.steps) ? payload.steps : [],
      })
      .select("id, workspace_id, name, description, enabled, trigger, steps, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ workflow: mapWorkflow(data as WorkflowRow) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create workflow.";
    return Response.json({ error: message }, { status: 400 });
  }
}
