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
    const { from, to } = parseDateRange(searchParams);

    const supabase = requireSupabaseAdminReports();
    const dealsObjectId = await resolveCrmObjectId(supabase, auth.workspaceId, "crm_deals");
    if (!dealsObjectId) {
      return Response.json({
        overall: { won: 0, lost: 0, rate: 0 },
        byOwner: [],
      });
    }

    const { data: stagesData, error: stagesError } = await supabase
      .from("workspace_pipeline_stages")
      .select("id, stage_type")
      .eq("workspace_id", auth.workspaceId);
    if (stagesError) throw new Error(stagesError.message);
    const stageTypeById = new Map<string, string>();
    for (const row of stagesData ?? []) {
      stageTypeById.set(String(row.id), String(row.stage_type));
    }

    let query = supabase
      .from("records")
      .select("id, data, updated_at")
      .eq("workspace_id", auth.workspaceId)
      .eq("object_id", dealsObjectId)
      .is("deleted_at", null);
    if (from) query = query.gte("updated_at", from.toISOString());
    if (to) query = query.lte("updated_at", to.toISOString());

    const { data: deals, error: dealsError } = await query;
    if (dealsError) throw new Error(dealsError.message);

    type OwnerAgg = { won: number; lost: number; total_won_amount: number };
    const byOwner = new Map<string, OwnerAgg>();
    let won = 0;
    let lost = 0;

    for (const row of deals ?? []) {
      const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const stageId = typeof data.stage_id === "string" ? data.stage_id : null;
      if (!stageId) continue;
      const stageType = stageTypeById.get(stageId);
      if (stageType !== "won" && stageType !== "lost") continue;

      const ownerId =
        typeof data.owner_user_id === "string" && data.owner_user_id.length > 0
          ? data.owner_user_id
          : "unassigned";
      const agg = byOwner.get(ownerId) ?? { won: 0, lost: 0, total_won_amount: 0 };
      if (stageType === "won") {
        won += 1;
        agg.won += 1;
        const amount = typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0);
        if (Number.isFinite(amount)) agg.total_won_amount += amount;
      } else {
        lost += 1;
        agg.lost += 1;
      }
      byOwner.set(ownerId, agg);
    }

    const totalClosed = won + lost;
    const overall = {
      won,
      lost,
      rate: totalClosed > 0 ? Math.round((won / totalClosed) * 1000) / 10 : 0,
    };

    const byOwnerResult = Array.from(byOwner.entries())
      .map(([ownerId, agg]) => ({
        owner_user_id: ownerId,
        won: agg.won,
        lost: agg.lost,
        rate:
          agg.won + agg.lost > 0
            ? Math.round((agg.won / (agg.won + agg.lost)) * 1000) / 10
            : 0,
        total_won_amount: Math.round(agg.total_won_amount * 100) / 100,
      }))
      .sort((a, b) => b.won - a.won);

    return Response.json({ overall, byOwner: byOwnerResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load win rate report.";
    return Response.json({ error: message }, { status: 400 });
  }
}
