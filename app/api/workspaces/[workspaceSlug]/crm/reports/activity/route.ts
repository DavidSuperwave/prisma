import {
  authorizeReportsRead,
  requireSupabaseAdminReports,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

function toUtcDateKey(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeReportsRead(workspaceSlug);
    if ("error" in auth) return auth.error;

    const searchParams = new URL(request.url).searchParams;
    const daysParam = Number(searchParams.get("days") ?? "30");
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 180) : 30;

    const supabase = requireSupabaseAdminReports();
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);

    const { data, error } = await supabase
      .from("record_activities")
      .select("type, occurred_at, author_user_id, author_agent_id")
      .eq("workspace_id", auth.workspaceId)
      .is("deleted_at", null)
      .gte("occurred_at", cutoff.toISOString())
      .limit(5000);
    if (error) throw new Error(error.message);

    type Bucket = { date: string; user_id: string; type: string; count: number };
    const map = new Map<string, Bucket>();
    const typeTotals = new Map<string, number>();

    for (const row of data ?? []) {
      const occurred = new Date(String((row as { occurred_at?: string }).occurred_at));
      if (Number.isNaN(occurred.getTime())) continue;
      const dateKey = toUtcDateKey(occurred);
      const type = String((row as { type?: string }).type ?? "note");
      const authorUser = (row as { author_user_id?: string | null }).author_user_id;
      const authorAgent = (row as { author_agent_id?: string | null }).author_agent_id;
      const userId =
        typeof authorUser === "string" && authorUser.length > 0
          ? authorUser
          : typeof authorAgent === "string" && authorAgent.length > 0
            ? `agent:${authorAgent}`
            : "system";
      const key = `${dateKey}::${userId}::${type}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { date: dateKey, user_id: userId, type, count: 1 });
      }
      typeTotals.set(type, (typeTotals.get(type) ?? 0) + 1);
    }

    const days_entries = Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.user_id !== b.user_id) return a.user_id.localeCompare(b.user_id);
      return a.type.localeCompare(b.type);
    });
    const byType = Array.from(typeTotals.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return Response.json({
      days: days_entries,
      byType,
      total: (data ?? []).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load activity report.";
    return Response.json({ error: message }, { status: 400 });
  }
}
