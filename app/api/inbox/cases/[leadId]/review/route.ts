export const runtime = "nodejs";

/**
 * POST /api/inbox/cases/:leadId/review
 *
 * Resets a previously accepted/rejected lead to pipeline_stage='new_lead' so
 * the qualified-leads agent can re-evaluate it. Keeps Supermemory history
 * intact so the prior decision still informs calibration.
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { LEADS_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: lead, error: readErr } = await supabase
    .from("leads")
    .select("id, workspace_id, pipeline_stage")
    .eq("id", leadId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const workspaceId = lead.workspace_id as string;
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("leads")
    .update({ pipeline_stage: "new_lead" })
    .eq("id", leadId)
    .select(LEADS_COLUMNS)
    .single();
  if (updateErr || !updated) {
    return NextResponse.json({ error: updateErr?.message ?? "Reset failed." }, { status: 500 });
  }
  return NextResponse.json({ lead: updated });
}
