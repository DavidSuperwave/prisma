import {
  authorizeReportsRead,
  formatMonthKey,
  requireSupabaseAdminReports,
  resolveCrmObjectId,
  startOfMonthUtc,
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
      return Response.json({ months: [], total_weighted: 0 });
    }

    const { data: stagesData, error: stagesError } = await supabase
      .from("workspace_pipeline_stages")
      .select("id, stage_type, probability")
      .eq("workspace_id", auth.workspaceId);
    if (stagesError) throw new Error(stagesError.message);
    const stageInfo = new Map<string, { stageType: string; probability: number }>();
    for (const row of stagesData ?? []) {
      stageInfo.set(String(row.id), {
        stageType: String(row.stage_type),
        probability: Number(row.probability ?? 0),
      });
    }

    const { data: deals, error: dealsError } = await supabase
      .from("records")
      .select("id, data")
      .eq("workspace_id", auth.workspaceId)
      .eq("object_id", dealsObjectId)
      .is("deleted_at", null);
    if (dealsError) throw new Error(dealsError.message);

    const now = new Date();
    const monthsWindow: { key: string; start: Date }[] = [];
    for (let i = 0; i < 6; i += 1) {
      const start = startOfMonthUtc(now.getUTCFullYear(), now.getUTCMonth() + i);
      monthsWindow.push({ key: formatMonthKey(start), start });
    }
    const windowKeys = new Set(monthsWindow.map((entry) => entry.key));

    const agg = new Map<string, { weighted_amount: number; count: number; total_amount: number }>();
    for (const entry of monthsWindow) {
      agg.set(entry.key, { weighted_amount: 0, count: 0, total_amount: 0 });
    }

    let totalWeighted = 0;

    for (const row of deals ?? []) {
      const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const stageId = typeof data.stage_id === "string" ? data.stage_id : null;
      const stage = stageId ? stageInfo.get(stageId) : null;
      if (!stage || stage.stageType !== "active") continue;

      const closeRaw =
        typeof data.expected_close_date === "string"
          ? data.expected_close_date
          : typeof data.close_date === "string"
            ? data.close_date
            : null;
      if (!closeRaw) continue;
      const closeDate = new Date(closeRaw);
      if (Number.isNaN(closeDate.getTime())) continue;

      const key = formatMonthKey(
        new Date(Date.UTC(closeDate.getUTCFullYear(), closeDate.getUTCMonth(), 1)),
      );
      if (!windowKeys.has(key)) continue;

      const amount = typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0);
      if (!Number.isFinite(amount)) continue;
      const confidenceRaw =
        typeof data.confidence === "number"
          ? data.confidence
          : Number(data.confidence ?? stage.probability ?? 0);
      const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : 0;
      const weighted = amount * (confidence / 100);

      const bucket = agg.get(key)!;
      bucket.count += 1;
      bucket.total_amount += amount;
      bucket.weighted_amount += weighted;
      totalWeighted += weighted;
    }

    const months = monthsWindow.map((entry) => {
      const bucket = agg.get(entry.key)!;
      return {
        month: entry.key,
        count: bucket.count,
        total_amount: Math.round(bucket.total_amount * 100) / 100,
        weighted_amount: Math.round(bucket.weighted_amount * 100) / 100,
      };
    });

    return Response.json({
      months,
      total_weighted: Math.round(totalWeighted * 100) / 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load forecast report.";
    return Response.json({ error: message }, { status: 400 });
  }
}
