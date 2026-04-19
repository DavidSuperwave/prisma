import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { tick as tickSequences } from "@/lib/sequences/engine";
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
    const result = await tickSequences({ supabase, maxBatch: 200 });
    const elapsedMs = Date.now() - startedAt;
    console.log("[cron] sequence-tick", { ...result, elapsedMs });
    return Response.json({ ok: true, ...result, elapsedMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sequence tick failed";
    console.error("[cron] sequence-tick failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
