import {
  authorizeReportsRead,
  parseDateRange,
  requireSupabaseAdminReports,
  resolveCrmObjectId,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeReportsRead(workspaceSlug);
    if ("error" in auth) return auth.error;

    const searchParams = new URL(request.url).searchParams;
    const pipelineId = searchParams.get("pipelineId");
    const { from, to } = parseDateRange(searchParams);

    const supabase = requireSupabaseAdminReports();
    const dealsObjectId = await resolveCrmObjectId(supabase, auth.workspaceId, "crm_deals");
    if (!dealsObjectId) {
      return Response.json({ stages: [], totals: { count: 0, total_amount: 0, weighted_amount: 0 } });
    }

    const { data: stagesData, error: stagesError } = await supabase
      .from("workspace_pipeline_stages")
      .select("id, pipeline_id, name, stage_type, probability, sort_order")
      .eq("workspace_id", auth.workspaceId)
      .order("sort_order", { ascending: true });
    if (stagesError) throw new Error(stagesError.message);
    const stages = (stagesData ?? []).filter((stage) =>
      pipelineId ? String(stage.pipeline_id) === pipelineId : true,
    );

    let dealsQuery = supabase
      .from("records")
      .select("id, data, created_at, updated_at")
      .eq("workspace_id", auth.workspaceId)
      .eq("object_id", dealsObjectId)
      .is("deleted_at", null);
    if (from) dealsQuery = dealsQuery.gte("created_at", from.toISOString());
    if (to) dealsQuery = dealsQuery.lte("created_at", to.toISOString());

    const { data: deals, error: dealsError } = await dealsQuery;
    if (dealsError) throw new Error(dealsError.message);

    const byStage = new Map<string, { count: number; total_amount: number; weighted_amount: number }>();
    let totalCount = 0;
    let totalAmount = 0;
    let totalWeighted = 0;

    for (const row of deals ?? []) {
      const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const stageId = typeof data.stage_id === "string" ? data.stage_id : null;
      if (!stageId) continue;
      if (pipelineId && data.pipeline_id !== pipelineId) continue;
      const stage = stages.find((entry) => String(entry.id) === stageId);
      if (!stage) continue;

      const amount = typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const confidenceRaw =
        typeof data.confidence === "number" ? data.confidence : Number(data.confidence ?? stage.probability ?? 0);
      const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : 0;
      const weighted = safeAmount * (confidence / 100);

      const agg = byStage.get(stageId) ?? { count: 0, total_amount: 0, weighted_amount: 0 };
      agg.count += 1;
      agg.total_amount += safeAmount;
      agg.weighted_amount += weighted;
      byStage.set(stageId, agg);

      totalCount += 1;
      totalAmount += safeAmount;
      totalWeighted += weighted;
    }

    const result = stages.map((stage) => {
      const agg = byStage.get(String(stage.id)) ?? { count: 0, total_amount: 0, weighted_amount: 0 };
      return {
        stage_id: String(stage.id),
        stage_name: String(stage.name),
        stage_type: String(stage.stage_type) as "active" | "won" | "lost",
        pipeline_id: String(stage.pipeline_id),
        probability: Number(stage.probability ?? 0),
        count: agg.count,
        total_amount: Math.round(agg.total_amount * 100) / 100,
        weighted_amount: Math.round(agg.weighted_amount * 100) / 100,
      };
    });

    return Response.json({
      stages: result,
      totals: {
        count: totalCount,
        total_amount: Math.round(totalAmount * 100) / 100,
        weighted_amount: Math.round(totalWeighted * 100) / 100,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pipeline report.";
    return Response.json({ error: message }, { status: 400 });
  }
}
