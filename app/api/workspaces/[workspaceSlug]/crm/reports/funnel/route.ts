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

const STAGE_ORDER = ["new", "qualified", "customer", "lost"];

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeReportsRead(workspaceSlug);
    if ("error" in auth) return auth.error;

    const searchParams = new URL(request.url).searchParams;
    const { from, to } = parseDateRange(searchParams);

    const supabase = requireSupabaseAdminReports();
    const peopleObjectId = await resolveCrmObjectId(supabase, auth.workspaceId, "crm_people");
    if (!peopleObjectId) {
      return Response.json({ stages: [], total: 0 });
    }

    let query = supabase
      .from("records")
      .select("id, data, created_at")
      .eq("workspace_id", auth.workspaceId)
      .eq("object_id", peopleObjectId)
      .is("deleted_at", null);
    if (from) query = query.gte("created_at", from.toISOString());
    if (to) query = query.lte("created_at", to.toISOString());

    const { data: people, error } = await query;
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const row of people ?? []) {
      const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const stage =
        typeof data.stage === "string" && data.stage.length > 0 ? data.stage.toLowerCase() : "new";
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }

    const ordered = [
      ...STAGE_ORDER.map((stage) => ({ stage_name: stage, count: counts.get(stage) ?? 0 })),
    ];
    for (const [stage, count] of counts.entries()) {
      if (!STAGE_ORDER.includes(stage)) {
        ordered.push({ stage_name: stage, count });
      }
    }

    const total = ordered.reduce((sum, entry) => sum + entry.count, 0);

    return Response.json({ stages: ordered, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load funnel report.";
    return Response.json({ error: message }, { status: 400 });
  }
}
