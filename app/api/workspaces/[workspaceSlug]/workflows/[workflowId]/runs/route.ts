import { authorizeCrmWrite, requireSupabaseAdmin } from "../../../crm/_shared";
import { processRun } from "@/lib/workflows/engine";

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

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, workflowId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (!authorization.user.isPlatformAdmin && authorization.membership.role !== "admin") {
      return Response.json({ error: "Admin role required." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as { recordId?: string | null };
    const supabase = requireSupabaseAdmin();
    const { data: workflow, error: workflowError } = await supabase
      .from("workspace_workflows")
      .select("id")
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", workflowId)
      .maybeSingle();
    if (workflowError) throw new Error(workflowError.message);
    if (!workflow) return Response.json({ error: "Workflow not found." }, { status: 404 });

    const { data: inserted, error: insertError } = await supabase
      .from("workspace_workflow_runs")
      .insert({
        workflow_id: workflowId,
        workspace_id: authorization.workspaceId,
        record_id: typeof payload.recordId === "string" && payload.recordId.trim().length > 0 ? payload.recordId.trim() : null,
        status: "pending",
        current_step: 0,
        context: {
          event_type: "manual",
          source: "workspace.workflow_runs.post",
          enqueued_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const runId = String((inserted as { id: string }).id);
    const result = await processRun(supabase, runId);
    return Response.json({
      runId,
      status: result?.status ?? "unknown",
      error: result?.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute run.";
    return Response.json({ error: message }, { status: 400 });
  }
}
