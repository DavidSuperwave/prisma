export const runtime = "nodejs";

/**
 * POST /api/inbox/cases/:leadId/reject
 *
 * Moves the lead to pipeline_stage='rejected' with a reason and records the
 * decision in Supermemory under `prismaalalegal_shared` for calibration.
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { storeMemory } from "@/lib/supermemory";
import { LEADS_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: { reason?: string; keyFactors?: string[]; force?: boolean };
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "`reason` is required." }, { status: 400 });
  }

  const { data: lead, error: readErr } = await supabase
    .from("leads")
    .select("id, workspace_id, phone, pipeline_stage")
    .eq("id", leadId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const workspaceId = lead.workspace_id as string;
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!body.force && (lead.pipeline_stage === "accepted" || lead.pipeline_stage === "rejected")) {
    return NextResponse.json(
      {
        error: `Lead already in pipeline_stage "${lead.pipeline_stage}". Use /casereview to reset.`,
        code: "already_decided",
      },
      { status: 409 },
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("leads")
    .update({ pipeline_stage: "rejected" })
    .eq("id", leadId)
    .select(LEADS_COLUMNS)
    .single();
  if (updateErr || !updated) {
    return NextResponse.json({ error: updateErr?.message ?? "Update failed." }, { status: 500 });
  }

  try {
    const memoryResult = await storeMemory({
      content: `Rejected case for lead ${lead.phone ?? leadId}. Reason: ${reason}`,
      containerTags: ["prismaalalegal_shared"],
      metadata: {
        type: "case_decision",
        decision: "rejected",
        lead_id: leadId,
        phone: lead.phone ?? null,
        workspace_id: workspaceId,
        reason,
        key_factors: body.keyFactors ?? [],
      },
    });
    if (!memoryResult.ok) {
      console.warn("[cases.reject] supermemory write failed", memoryResult.error);
    }
  } catch (error) {
    console.warn("[cases.reject] supermemory exception", error);
  }

  return NextResponse.json({ lead: updated });
}
