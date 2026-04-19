import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { tickCronWorkflows, tickPendingRuns } from "@/lib/workflows/engine";
import { authorizeCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }
  const startedAt = Date.now();
  try {
    // Evaluate cron-triggered workflows across all workspaces once, then
    // process any pending runs (newly enqueued or previously delayed).
    const cronResult = await tickCronWorkflows({ supabase });

    const { data: workspaces, error } = await supabase.from("workspaces").select("id");
    if (error) throw new Error(error.message);
    let processed = 0;
    for (const row of (workspaces ?? []) as Array<{ id: string }>) {
      const result = await tickPendingRuns({ supabase, workspaceId: String(row.id), maxBatch: 25 });
      processed += result.processed;
    }
    const elapsedMs = Date.now() - startedAt;
    console.log("[cron] workflow-tick", {
      cronEnqueued: cronResult.enqueued,
      processed,
      elapsedMs,
    });
    return Response.json({
      ok: true,
      cronEnqueued: cronResult.enqueued,
      processed,
      elapsedMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "workflow tick failed";
    console.error("[cron] workflow-tick failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
