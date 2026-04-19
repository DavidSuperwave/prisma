export const runtime = "nodejs";

/**
 * POST /api/inbox/replies/:id/cancel
 *
 * Marks a pending reply as cancelled without sending. Used when the operator
 * decides the agent draft is not worth sending (e.g. spam or a false alarm).
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { CRM_REPLIES_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: reply, error: readErr } = await supabase
    .from("crm_replies")
    .select("id, workspace_id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!reply) return NextResponse.json({ error: "Reply not found." }, { status: 404 });

  if (!user.memberships.some((m) => m.workspaceId === reply.workspace_id) && !user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (reply.status !== "pending") {
    return NextResponse.json(
      { error: `Reply is in status "${reply.status}".`, code: "not_pending" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("crm_replies")
    .update({ status: "cancelled", approved_by: user.id })
    .eq("id", id)
    .select(CRM_REPLIES_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Cancel failed." }, { status: 500 });
  }
  return NextResponse.json({ reply: data });
}
