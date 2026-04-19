export const runtime = "nodejs";

/**
 * GET /api/inbox/replies
 *
 * Query params:
 *   - workspaceId (required)
 *   - conversationId (optional) filter by conversation
 *   - phone (optional)          filter by lead phone (joins leads)
 *   - status (optional)         pending | approved | sent | failed | cancelled
 *   - limit (optional)          default 50, max 200
 *
 * POST /api/inbox/replies
 *   Create a pending reply row (agent-drafted or operator-drafted).
 *   Body: { workspaceId, conversationId, agentDraft?, operatorEdit?, agentId? }
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { CRM_REPLIES_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

async function requireMembership(workspaceId: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  const member = user.memberships.some((m) => m.workspaceId === workspaceId);
  if (!member && !user.isPlatformAdmin) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
  }
  const auth = await requireMembership(workspaceId);
  if ("error" in auth) return auth.error;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const status = url.searchParams.get("status");
  const conversationId = url.searchParams.get("conversationId");
  const phone = url.searchParams.get("phone");
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);

  let query = supabase
    .from("crm_replies")
    .select(CRM_REPLIES_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (conversationId) query = query.eq("conversation_id", conversationId);

  if (phone) {
    const { data: leadRows, error: leadErr } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", phone);
    if (leadErr) {
      return NextResponse.json({ error: leadErr.message }, { status: 500 });
    }
    const leadIds = (leadRows ?? []).map((row) => row.id as string);
    if (leadIds.length === 0) {
      return NextResponse.json({ replies: [] });
    }
    const { data: convRows, error: convErr } = await supabase
      .from("crm_conversations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("lead_id", leadIds);
    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }
    const convIds = (convRows ?? []).map((row) => row.id as string);
    if (convIds.length === 0) {
      return NextResponse.json({ replies: [] });
    }
    query = query.in("conversation_id", convIds);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ replies: data ?? [] });
}

export async function POST(request: Request) {
  let body: {
    workspaceId?: string;
    conversationId?: string;
    agentDraft?: string;
    operatorEdit?: string;
    agentId?: string;
    messageId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.workspaceId || !body.conversationId) {
    return NextResponse.json(
      { error: "workspaceId and conversationId are required." },
      { status: 400 },
    );
  }
  const auth = await requireMembership(body.workspaceId);
  if ("error" in auth) return auth.error;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { data: conversation, error: convErr } = await supabase
    .from("crm_conversations")
    .select("id, status, workspace_id")
    .eq("id", body.conversationId)
    .eq("workspace_id", body.workspaceId)
    .maybeSingle();
  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (conversation.status !== "active") {
    return NextResponse.json(
      { error: "Conversation is not active.", code: "conversation_archived" },
      { status: 409 },
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("crm_replies")
    .insert({
      workspace_id: body.workspaceId,
      conversation_id: body.conversationId,
      message_id: body.messageId ?? null,
      agent_id: body.agentId ?? null,
      agent_draft: body.agentDraft ?? null,
      operator_edit: body.operatorEdit ?? null,
      status: "pending",
    })
    .select(CRM_REPLIES_COLUMNS)
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Insert failed." },
      { status: 500 },
    );
  }
  return NextResponse.json({ reply: inserted }, { status: 201 });
}
