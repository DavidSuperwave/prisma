export const runtime = "nodejs";

/**
 * POST /api/inbox/replies/:id/approve
 *
 * Operator-triggered (web UI button or leads-inbox agent `/replyapprove`).
 * - Resolves final_text = operator_edit ?? agent_draft
 * - Verifies conversation is active; 409 if archived
 * - Sends via ManyChat (best-effort)
 * - Updates crm_replies row: status, approved_at, sent_at (or error + failed)
 * - Inserts an outbound crm_messages row on success
 * - Writes an "approved_reply" memory to Supermemory (best-effort)
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { sendViaManychat } from "@/lib/crm/manychatSend";
import { storeMemory } from "@/lib/supermemory";
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
    .select("id, workspace_id, conversation_id, agent_draft, operator_edit, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!reply) return NextResponse.json({ error: "Reply not found." }, { status: 404 });

  const workspaceId = reply.workspace_id as string;
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (reply.status !== "pending") {
    return NextResponse.json(
      { error: `Reply is in status "${reply.status}".`, code: "not_pending" },
      { status: 409 },
    );
  }

  const finalText =
    (typeof reply.operator_edit === "string" && reply.operator_edit.trim()) ||
    (typeof reply.agent_draft === "string" && reply.agent_draft.trim()) ||
    "";
  if (!finalText) {
    return NextResponse.json({ error: "Reply has no draft or operator edit." }, { status: 400 });
  }

  const { data: conversation, error: convErr } = await supabase
    .from("crm_conversations")
    .select("id, status, lead_id")
    .eq("id", reply.conversation_id as string)
    .maybeSingle();
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "Conversation missing." }, { status: 404 });
  if (conversation.status !== "active") {
    return NextResponse.json(
      {
        error: "Cannot approve a reply on a non-active conversation.",
        code: "conversation_archived",
      },
      { status: 409 },
    );
  }

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, manychat_subscriber_id, phone")
    .eq("id", conversation.lead_id as string)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead?.manychat_subscriber_id) {
    return NextResponse.json(
      { error: "Lead has no ManyChat subscriber id." },
      { status: 409 },
    );
  }

  const approvedAt = new Date().toISOString();
  await supabase
    .from("crm_replies")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: approvedAt,
      final_text: finalText,
    })
    .eq("id", id);

  const sendResult = await sendViaManychat({
    subscriberId: lead.manychat_subscriber_id as string,
    text: finalText,
  });

  if (!sendResult.ok) {
    await supabase
      .from("crm_replies")
      .update({ status: "failed", error: sendResult.error })
      .eq("id", id);
    return NextResponse.json(
      { error: sendResult.error, code: "manychat_send_failed" },
      { status: 502 },
    );
  }

  const sentAt = new Date().toISOString();

  const { data: outboundMessage } = await supabase
    .from("crm_messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: reply.conversation_id,
      direction: "outbound",
      sender_type: typeof reply.operator_edit === "string" && reply.operator_edit.trim() ? "operator" : "agent",
      content: finalText,
      manychat_message_id: sendResult.providerMessageId ?? null,
    })
    .select("id")
    .single();

  await supabase
    .from("crm_conversations")
    .update({ last_outbound_at: sentAt })
    .eq("id", reply.conversation_id as string);

  const { data: updated } = await supabase
    .from("crm_replies")
    .update({
      status: "sent",
      sent_at: sentAt,
      message_id: outboundMessage?.id ?? null,
    })
    .eq("id", id)
    .select(CRM_REPLIES_COLUMNS)
    .single();

  try {
    const memoryResult = await storeMemory({
      content: finalText,
      containerTags: ["prismaalalegal_shared"],
      metadata: {
        type: "approved_reply",
        workspace_id: workspaceId,
        conversation_id: reply.conversation_id,
        lead_id: conversation.lead_id,
        phone: lead.phone ?? null,
        operator_edited: Boolean(
          typeof reply.operator_edit === "string" && reply.operator_edit.trim(),
        ),
        agent_draft: reply.agent_draft ?? null,
        final_text: finalText,
      },
    });
    if (!memoryResult.ok) {
      console.warn("[replies.approve] supermemory write failed", memoryResult.error);
    }
  } catch (error) {
    console.warn("[replies.approve] supermemory exception", error);
  }

  return NextResponse.json({ reply: updated });
}
