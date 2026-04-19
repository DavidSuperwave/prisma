export const runtime = "nodejs";

/**
 * GET   /api/inbox/conversations/:id         Load a single conversation + lead + recent messages
 * PATCH /api/inbox/conversations/:id         Update status (archive/unarchive) or metadata
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import {
  CRM_CONVERSATIONS_COLUMNS,
  CRM_MESSAGES_COLUMNS,
  LEADS_COLUMNS,
} from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

type ConversationStatus = "active" | "archived" | "closed";

function isStatus(value: unknown): value is ConversationStatus {
  return value === "active" || value === "archived" || value === "closed";
}

async function authorize(workspaceId: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { data: conversation, error } = await supabase
    .from("crm_conversations")
    .select(CRM_CONVERSATIONS_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const auth = await authorize(conversation.workspace_id as string);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("messagesLimit") ?? "100");
  const messagesLimit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100), 500);

  const [{ data: lead }, { data: messages }] = await Promise.all([
    supabase.from("leads").select(LEADS_COLUMNS).eq("id", conversation.lead_id as string).maybeSingle(),
    supabase
      .from("crm_messages")
      .select(CRM_MESSAGES_COLUMNS)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(messagesLimit),
  ]);

  return NextResponse.json({
    conversation,
    lead: lead ?? null,
    messages: (messages ?? []).reverse(),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { data: conversation, error: readErr } = await supabase
    .from("crm_conversations")
    .select("id, workspace_id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const auth = await authorize(conversation.workspace_id as string);
  if ("error" in auth) return auth.error;

  let body: { status?: unknown; metadata?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!isStatus(body.status)) {
      return NextResponse.json(
        { error: "status must be one of: active | archived | closed" },
        { status: 400 },
      );
    }
    update.status = body.status;
  }
  if (body.metadata) update.metadata = body.metadata;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_conversations")
    .update(update)
    .eq("id", id)
    .select(CRM_CONVERSATIONS_COLUMNS)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed." }, { status: 500 });
  }
  return NextResponse.json({ conversation: data });
}
