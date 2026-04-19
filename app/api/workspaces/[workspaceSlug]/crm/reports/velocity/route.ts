import {
  authorizeReportsRead,
  daysBetween,
  formatMonthKey,
  requireSupabaseAdminReports,
  resolveCrmObjectId,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeReportsRead(workspaceSlug);
    if ("error" in auth) return auth.error;

    const supabase = requireSupabaseAdminReports();
    const dealsObjectId = await resolveCrmObjectId(supabase, auth.workspaceId, "crm_deals");
    if (!dealsObjectId) {
      return Response.json({ avg_days_to_close: 0, sample_size: 0, sparkline: [] });
    }

    const { data: stagesData, error: stagesError } = await supabase
      .from("workspace_pipeline_stages")
      .select("id, stage_type")
      .eq("workspace_id", auth.workspaceId);
    if (stagesError) throw new Error(stagesError.message);
    const wonStageIds = new Set<string>(
      (stagesData ?? [])
        .filter((row) => String(row.stage_type) === "won")
        .map((row) => String(row.id)),
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const { data: deals, error: dealsError } = await supabase
      .from("records")
      .select("id, data, created_at, updated_at")
      .eq("workspace_id", auth.workspaceId)
      .eq("object_id", dealsObjectId)
      .is("deleted_at", null)
      .gte("updated_at", cutoff.toISOString());
    if (dealsError) throw new Error(dealsError.message);

    const monthlyDays = new Map<string, { total: number; count: number }>();
    const allDurations: number[] = [];

    for (const row of deals ?? []) {
      const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const stageId = typeof data.stage_id === "string" ? data.stage_id : null;
      if (!stageId || !wonStageIds.has(stageId)) continue;

      const createdRaw = (row as { created_at?: string }).created_at;
      const closedRaw =
        typeof data.won_at === "string" && data.won_at.length > 0
          ? data.won_at
          : (row as { updated_at?: string }).updated_at;
      if (!createdRaw || !closedRaw) continue;

      const createdAt = new Date(createdRaw);
      const closedAt = new Date(closedRaw);
      if (Number.isNaN(createdAt.getTime()) || Number.isNaN(closedAt.getTime())) continue;

      const days = daysBetween(createdAt, closedAt);
      allDurations.push(days);

      const key = formatMonthKey(
        new Date(Date.UTC(closedAt.getUTCFullYear(), closedAt.getUTCMonth(), 1)),
      );
      const agg = monthlyDays.get(key) ?? { total: 0, count: 0 };
      agg.total += days;
      agg.count += 1;
      monthlyDays.set(key, agg);
    }

    const avg =
      allDurations.length > 0
        ? allDurations.reduce((sum, v) => sum + v, 0) / allDurations.length
        : 0;

    const sparkline = Array.from(monthlyDays.entries())
      .map(([month, agg]) => ({
        month,
        avg_days: Math.round((agg.total / agg.count) * 10) / 10,
        count: agg.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return Response.json({
      avg_days_to_close: Math.round(avg * 10) / 10,
      sample_size: allDurations.length,
      sparkline,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load velocity report.";
    return Response.json({ error: message }, { status: 400 });
  }
}
