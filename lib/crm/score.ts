import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadPersonLike = {
  data: Record<string, unknown>;
};

const STAGES_WITH_POINTS = new Set(["qualified", "opportunity", "customer"]);

/**
 * Pure function. Scores a person record from 0..100 based on the M12 rubric:
 *   +20 has email
 *   +15 has phone
 *   +15 has company_id
 *   +20 stage in qualified/opportunity/customer
 *   +30 activity within last 7 days
 */
export function computeLeadScore(person: LeadPersonLike, recentActivityAt?: string | Date | null): number {
  if (!person || typeof person.data !== "object" || person.data === null) return 0;
  const data = person.data;
  let score = 0;

  if (typeof data.email === "string" && data.email.trim().length > 0) score += 20;
  if (typeof data.phone === "string" && data.phone.trim().length > 0) score += 15;
  if (typeof data.company_id === "string" && data.company_id.trim().length > 0) score += 15;

  const stage = typeof data.stage === "string" ? data.stage.toLowerCase() : "";
  if (STAGES_WITH_POINTS.has(stage)) score += 20;

  if (recentActivityAt) {
    const date = recentActivityAt instanceof Date ? recentActivityAt : new Date(recentActivityAt);
    if (!Number.isNaN(date.getTime())) {
      const diffMs = Date.now() - date.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (diffMs <= sevenDaysMs && diffMs >= 0) {
        score += 30;
      }
    }
  }

  return Math.min(100, Math.max(0, score));
}

export async function recomputePersonScore(
  supabase: SupabaseClient,
  workspaceId: string,
  recordId: string,
): Promise<number | null> {
  const { data: record, error } = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("id", recordId)
    .maybeSingle();
  if (error || !record) return null;

  const { data: lastActivity } = await supabase
    .from("record_activities")
    .select("occurred_at")
    .eq("workspace_id", workspaceId)
    .eq("record_id", recordId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const score = computeLeadScore(
    { data: (record.data as Record<string, unknown>) ?? {} },
    (lastActivity as { occurred_at?: string } | null)?.occurred_at ?? null,
  );

  const mergedData = {
    ...((record.data as Record<string, unknown>) ?? {}),
    score,
  };
  await supabase
    .from("records")
    .update({ data: mergedData, updated_at: new Date().toISOString() })
    .eq("id", recordId);
  return score;
}

export async function safeRecomputePersonScore(
  supabase: SupabaseClient,
  workspaceId: string,
  recordId: string,
): Promise<void> {
  try {
    await recomputePersonScore(supabase, workspaceId, recordId);
  } catch (error) {
    console.error("[lead-score] recompute failed", error instanceof Error ? error.message : error);
  }
}
