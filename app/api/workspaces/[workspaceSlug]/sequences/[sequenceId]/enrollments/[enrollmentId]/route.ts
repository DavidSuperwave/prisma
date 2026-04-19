import { authorizeCrmWrite, requireSupabaseAdmin } from "../../../../crm/_shared";
import {
  exitEnrollment,
  pauseEnrollment,
  resumeEnrollment,
} from "@/lib/sequences/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; sequenceId: string; enrollmentId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, sequenceId, enrollmentId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const payload = (await request.json().catch(() => ({}))) as { action?: string };
    const supabase = requireSupabaseAdmin();

    const { data: existing, error } = await supabase
      .from("workspace_sequence_enrollments")
      .select("id")
      .eq("id", enrollmentId)
      .eq("sequence_id", sequenceId)
      .eq("workspace_id", authorization.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) return Response.json({ error: "Enrollment not found." }, { status: 404 });

    let ok = false;
    if (payload.action === "pause") ok = await pauseEnrollment(supabase, enrollmentId);
    else if (payload.action === "resume") ok = await resumeEnrollment(supabase, enrollmentId);
    else if (payload.action === "exit") ok = await exitEnrollment(supabase, enrollmentId);
    else return Response.json({ error: "Unknown action." }, { status: 400 });

    if (!ok) return Response.json({ error: "Action failed." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update enrollment.";
    return Response.json({ error: message }, { status: 400 });
  }
}
