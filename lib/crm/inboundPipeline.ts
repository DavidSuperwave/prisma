/**
 * Inbound message pipeline used by the ManyChat webhook.
 *
 * Responsibilities:
 *   1. Upsert the lead row (Postgres / Supabase — authoritative).
 *   2. Open or reuse a `crm_conversations` row.
 *   3. Insert the `crm_messages` row (direction = 'inbound').
 *   4. Best-effort write to Supermemory (logged, non-blocking).
 *   5. Best-effort notify the leads-inbox agent (logged, non-blocking).
 *
 * Postgres is the single source of truth for structured data.
 * Supermemory is used only for semantic search.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { storeMemory } from "@/lib/supermemory";
import { notifyAgent } from "@/lib/openclawClient";

export type InboundPayload = {
  workspaceId: string;
  subscriberId: string;
  messageId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  channel: string;
  content: string;
  receivedAt?: string;
};

export type InboundResult = {
  leadId: string;
  conversationId: string;
  messageId: string;
  supermemoryOk: boolean;
  notifyOk: boolean;
};

export async function processInbound(
  supabase: SupabaseClient,
  payload: InboundPayload,
): Promise<InboundResult> {
  const leadId = await upsertLead(supabase, payload);
  const conversationId = await ensureConversation(supabase, {
    workspaceId: payload.workspaceId,
    leadId,
    channel: payload.channel,
    inboundAt: payload.receivedAt ?? new Date().toISOString(),
  });
  const messageId = await insertMessage(supabase, {
    workspaceId: payload.workspaceId,
    conversationId,
    content: payload.content,
    manychatMessageId: payload.messageId ?? null,
  });

  const supermemoryOk = await writeSupermemoryBestEffort({
    workspaceId: payload.workspaceId,
    leadId,
    conversationId,
    content: payload.content,
    phone: payload.phone,
  });

  const notifyOk = await notifyLeadsInboxBestEffort({
    workspaceId: payload.workspaceId,
    phone: payload.phone ?? payload.subscriberId,
    preview: payload.content.slice(0, 120),
    conversationId,
  });

  return { leadId, conversationId, messageId, supermemoryOk, notifyOk };
}

async function upsertLead(
  supabase: SupabaseClient,
  payload: InboundPayload,
): Promise<string> {
  const { data: existing, error: readError } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", payload.workspaceId)
    .eq("manychat_subscriber_id", payload.subscriberId)
    .maybeSingle();

  if (readError) {
    throw new Error(`leads read failed: ${readError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        first_name: payload.firstName ?? undefined,
        last_name: payload.lastName ?? undefined,
        phone: payload.phone ?? undefined,
        email: payload.email ?? undefined,
        channel: payload.channel,
      })
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`leads update failed: ${updateError.message}`);
    }
    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leads")
    .insert({
      workspace_id: payload.workspaceId,
      manychat_subscriber_id: payload.subscriberId,
      first_name: payload.firstName ?? null,
      last_name: payload.lastName ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      channel: payload.channel,
      pipeline_stage: "new_lead",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`leads insert failed: ${insertError?.message ?? "unknown"}`);
  }
  return inserted.id as string;
}

async function ensureConversation(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    leadId: string;
    channel: string;
    inboundAt: string;
  },
): Promise<string> {
  const { data: active, error: readError } = await supabase
    .from("crm_conversations")
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("lead_id", args.leadId)
    .eq("channel", args.channel)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    throw new Error(`crm_conversations read failed: ${readError.message}`);
  }

  if (active?.id) {
    await supabase
      .from("crm_conversations")
      .update({ last_inbound_at: args.inboundAt })
      .eq("id", active.id);
    return active.id as string;
  }

  const { data: created, error: insertError } = await supabase
    .from("crm_conversations")
    .insert({
      workspace_id: args.workspaceId,
      lead_id: args.leadId,
      channel: args.channel,
      status: "active",
      last_inbound_at: args.inboundAt,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(`crm_conversations insert failed: ${insertError?.message ?? "unknown"}`);
  }
  return created.id as string;
}

async function insertMessage(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    conversationId: string;
    content: string;
    manychatMessageId: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("crm_messages")
    .insert({
      workspace_id: args.workspaceId,
      conversation_id: args.conversationId,
      direction: "inbound",
      sender_type: "client",
      content: args.content,
      manychat_message_id: args.manychatMessageId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`crm_messages insert failed: ${error?.message ?? "unknown"}`);
  }
  return data.id as string;
}

async function writeSupermemoryBestEffort(args: {
  workspaceId: string;
  leadId: string;
  conversationId: string;
  content: string;
  phone?: string | null;
}): Promise<boolean> {
  try {
    const result = await storeMemory({
      content: args.content,
      containerTags: ["prismaalalegal_shared"],
      metadata: {
        type: "conversation_turn",
        direction: "inbound",
        workspace_id: args.workspaceId,
        lead_id: args.leadId,
        conversation_id: args.conversationId,
        phone: args.phone ?? null,
      },
    });
    if (!result.ok) {
      console.warn("[inbound] supermemory write failed", {
        error: result.error,
        retryable: result.retryable,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[inbound] supermemory exception", error);
    return false;
  }
}

async function notifyLeadsInboxBestEffort(args: {
  workspaceId: string;
  phone: string;
  preview: string;
  conversationId: string;
}): Promise<boolean> {
  try {
    const result = await notifyAgent({
      agent: "leads-inbox",
      message: `New inbound from ${args.phone}: ${args.preview}`,
      metadata: {
        workspace_id: args.workspaceId,
        conversation_id: args.conversationId,
      },
    });
    if (!result.ok) {
      console.warn("[inbound] agent notify failed", {
        error: result.error,
        classification: result.classification,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[inbound] agent notify exception", error);
    return false;
  }
}
