import { authorizeCrmWrite, requireSupabaseAdmin } from "../../../crm/_shared";
import { enrollRecord } from "@/lib/sequences/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; sequenceId: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, sequenceId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_sequence_enrollments")
      .select("id, workspace_id, sequence_id, record_id, status, current_step, next_run_at, enrolled_by, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .eq("sequence_id", sequenceId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return Response.json({ enrollments: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list enrollments.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, sequenceId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const recordId = typeof payload.recordId === "string" ? payload.recordId : null;
    if (!recordId) return Response.json({ error: "recordId is required." }, { status: 400 });
    const supabase = requireSupabaseAdmin();
    const result = await enrollRecord({
      supabase,
      workspaceId: authorization.workspaceId,
      sequenceId,
      recordId,
      enrolledBy: authorization.user.id,
    });
    if (!result.enrollmentId) {
      return Response.json({ error: result.error ?? "Unable to enroll." }, { status: 400 });
    }
    return Response.json({ enrollmentId: result.enrollmentId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enroll record.";
    return Response.json({ error: message }, { status: 400 });
  }
}
