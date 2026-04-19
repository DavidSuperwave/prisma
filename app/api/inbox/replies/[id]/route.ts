export const runtime = "nodejs";

/**
 * GET  /api/inbox/replies/:id          Read a single reply row
 * PATCH /api/inbox/replies/:id         Attach operator_edit or metadata (not approval)
 *
 * Approval goes through ./approve. This route is for inspection + edit only.
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { CRM_REPLIES_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

async function loadReply(id: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured." }, { status: 500 }) };
  const { data, error } = await supabase
    .from("crm_replies")
    .select(CRM_REPLIES_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "Reply not found." }, { status: 404 }) };
  return { reply: data };
}

async function requireMembership(workspaceId: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadReply(id);
  if ("error" in loaded) return loaded.error;
  const auth = await requireMembership(loaded.reply.workspace_id as string);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ reply: loaded.reply });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadReply(id);
  if ("error" in loaded) return loaded.error;

  const auth = await requireMembership(loaded.reply.workspace_id as string);
  if ("error" in auth) return auth.error;

  let body: { operatorEdit?: string; metadata?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (loaded.reply.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot edit a reply in status "${loaded.reply.status}".`, code: "not_pending" },
      { status: 409 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.operatorEdit === "string") update.operator_edit = body.operatorEdit;
  if (body.metadata) update.metadata = body.metadata;

  const { data, error } = await supabase
    .from("crm_replies")
    .update(update)
    .eq("id", id)
    .select(CRM_REPLIES_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed." }, { status: 500 });
  }
  return NextResponse.json({ reply: data });
}
