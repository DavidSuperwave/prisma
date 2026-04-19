import { authorizeCrmWrite, requireSupabaseAdmin } from "../../../crm/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; workflowId: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, workflowId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const supabase = requireSupabaseAdmin();
    const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const { data, error } = await supabase
      .from("workspace_workflow_runs")
      .select("id, workflow_id, workspace_id, record_id, status, current_step, context, error, started_at, completed_at, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return Response.json({ runs: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list runs.";
    return Response.json({ error: message }, { status: 400 });
  }
}
