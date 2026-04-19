export const runtime = "nodejs";

/**
 * POST /api/inbox/draft
 *
 * Request an agent draft for a conversation. Enforces archive state (409 when
 * not active). Falls back gracefully when OpenClaw/Hermes is unreachable: the
 * response contains `degraded: true` and an empty draft so the UI can tell the
 * operator to write a manual reply.
 *
 * Body: { workspaceId, conversationId }
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { requestDraft, hasOpenclawConfig } from "@/lib/openclawClient";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { workspaceId?: string; conversationId?: string };
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

  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!user.memberships.some((m) => m.workspaceId === body.workspaceId) && !user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { data: conversation, error: convErr } = await supabase
    .from("crm_conversations")
    .select("id, status")
    .eq("id", body.conversationId)
    .eq("workspace_id", body.workspaceId)
    .maybeSingle();
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (conversation.status !== "active") {
    return NextResponse.json(
      {
        error: "Cannot draft for a non-active conversation.",
        code: "conversation_archived",
      },
      { status: 409 },
    );
  }

  const { data: latestInbound } = await supabase
    .from("crm_messages")
    .select("content, created_at")
    .eq("conversation_id", body.conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inboundText = latestInbound?.content ?? "";

  if (!hasOpenclawConfig()) {
    return NextResponse.json({
      draft: "",
      degraded: true,
      reason: "openclaw_unavailable",
      message:
        "Draft generation temporarily unavailable. You can still send a manual reply.",
      retryable: true,
    });
  }

  const result = await requestDraft({
    agent: "leads-inbox",
    conversationId: body.conversationId,
    inbound: inboundText,
    context: { workspaceId: body.workspaceId },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        draft: "",
        degraded: true,
        reason: "openclaw_unavailable",
        classification: result.classification,
        message:
          "Draft generation temporarily unavailable. You can still send a manual reply.",
        retryable: result.retryable,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ draft: result.data.draft, degraded: false, latencyMs: result.latencyMs });
}
