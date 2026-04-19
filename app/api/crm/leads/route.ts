export const runtime = "nodejs";

/**
 * GET /api/crm/leads?workspaceId=...
 *
 * Query params:
 *   - workspaceId (required)
 *   - phone       (optional)
 *   - stage       (optional)
 *   - limit       (optional, default 100, max 500)
 *
 * Returns `{ leads: [...], totals: { count, opportunityCents, opportunityDisplay } }`
 * where `opportunityCents` sums non-null `opportunity_value` across the returned page.
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { formatCurrency, sumCents } from "@/lib/crm/currency";
import { LEADS_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
  }
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const phone = url.searchParams.get("phone");
  const stage = url.searchParams.get("stage");
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100), 500);

  let query = supabase
    .from("leads")
    .select(LEADS_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (phone) query = query.eq("phone", phone);
  if (stage) query = query.eq("pipeline_stage", stage);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leads = data ?? [];
  const opportunityCents = sumCents(leads.map((l) => l.opportunity_value as number | null));

  return NextResponse.json({
    leads,
    totals: {
      count: leads.length,
      opportunityCents,
      opportunityDisplay: formatCurrency(opportunityCents),
    },
  });
}
