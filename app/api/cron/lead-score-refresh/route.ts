import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { safeRecomputePersonScore } from "@/lib/crm/score";
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
    const { data: workspaces, error } = await supabase.from("workspaces").select("id");
    if (error) throw new Error(error.message);
    let processed = 0;

    for (const workspaceRow of (workspaces ?? []) as Array<{ id: string }>) {
      const workspaceId = String(workspaceRow.id);
      const { data: peopleObject } = await supabase
        .from("workspace_objects")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("kind", "crm_people")
        .maybeSingle();
      if (!peopleObject) continue;
      const peopleObjectId = String((peopleObject as { id: string }).id);

      let from = 0;
      const batchSize = 500;
      // Iterate in pages of 500 ids.
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from("records")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("object_id", peopleObjectId)
          .is("deleted_at", null)
          .range(from, from + batchSize - 1);
        if (batchError) break;
        const rows = (batch ?? []) as Array<{ id: string }>;
        if (rows.length === 0) break;
        for (const row of rows) {
          await safeRecomputePersonScore(supabase, workspaceId, String(row.id));
          processed += 1;
        }
        if (rows.length < batchSize) break;
        from += batchSize;
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.log("[cron] lead-score-refresh", { processed, elapsedMs });
    return Response.json({ ok: true, processed, elapsedMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "lead score refresh failed";
    console.error("[cron] lead-score-refresh failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
