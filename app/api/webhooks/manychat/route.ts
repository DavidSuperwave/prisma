/**
 * ManyChat inbound webhook.
 *
 * Flow:
 *   1. Verify shared secret (`MANYCHAT_WEBHOOK_SECRET` header).
 *   2. Parse payload and extract subscriber + workspace.
 *   3. Idempotency gate via `processed_webhooks`.
 *   4. Run the inbound pipeline (leads / conversations / messages / Supermemory / agent notify).
 *   5. Return a ManyChat v2 ack with the configured auto-reply.
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildManychatIdempotencyKey,
  checkAndRecordIdempotency,
} from "@/lib/webhookIdempotency";
import { processInbound } from "@/lib/crm/inboundPipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_AUTO_REPLY =
  "Gracias por tu mensaje. Un asesor te atenderá en breve.";

type ManychatPayload = {
  subscriber?: {
    id?: string | number;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
  message?: {
    id?: string;
    text?: string;
  };
  text?: string;
  workspace_id?: string;
  workspace_slug?: string;
  channel?: string;
  timestamp?: string;
};

function ackResponse() {
  const replyText = process.env.MANYCHAT_AUTO_REPLY?.trim() || DEFAULT_AUTO_REPLY;
  return NextResponse.json({
    version: "v2",
    content: {
      messages: [{ type: "text", text: replyText }],
    },
  });
}

function verifySharedSecret(request: Request): boolean {
  const expected = process.env.MANYCHAT_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return true;
  }
  const header =
    request.headers.get("x-manychat-signature") ??
    request.headers.get("x-webhook-secret") ??
    "";
  return header === expected;
}

async function resolveWorkspaceId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  payload: ManychatPayload,
): Promise<string | null> {
  if (!supabase) return null;
  if (payload.workspace_id) return payload.workspace_id;
  if (payload.workspace_slug) {
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("subdomain", payload.workspace_slug)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const envSlug = process.env.MANYCHAT_DEFAULT_WORKSPACE_SLUG?.trim();
  if (envSlug) {
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("subdomain", envSlug)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

export async function POST(request: Request) {
  if (!verifySharedSecret(request)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: ManychatPayload;
  try {
    payload = (await request.json()) as ManychatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const subscriberId =
    payload.subscriber?.id !== undefined ? String(payload.subscriber.id) : null;
  const content = (payload.message?.text ?? payload.text ?? "").toString();

  if (!subscriberId) {
    return NextResponse.json({ error: "Missing subscriber id." }, { status: 400 });
  }
  if (!content) {
    return ackResponse();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[manychat] Supabase admin unavailable; cannot persist inbound");
    return ackResponse();
  }

  const workspaceId = await resolveWorkspaceId(supabase, payload);
  if (!workspaceId) {
    console.error("[manychat] could not resolve workspace", {
      workspace_id: payload.workspace_id,
      workspace_slug: payload.workspace_slug,
    });
    return ackResponse();
  }

  const idempotencyKey = buildManychatIdempotencyKey({
    subscriberId,
    messageId: payload.message?.id ?? null,
    timestamp: payload.timestamp ?? Date.now(),
  });

  try {
    const gate = await checkAndRecordIdempotency(supabase, {
      key: idempotencyKey,
      source: "manychat",
      workspaceId,
    });
    if (gate.alreadyProcessed) {
      console.log("[manychat] duplicate webhook ignored", { idempotencyKey });
      return ackResponse();
    }
  } catch (error) {
    console.error("[manychat] idempotency check failed", error);
  }

  try {
    const result = await processInbound(supabase, {
      workspaceId,
      subscriberId,
      messageId: payload.message?.id ?? null,
      firstName: payload.subscriber?.first_name ?? null,
      lastName: payload.subscriber?.last_name ?? null,
      phone: payload.subscriber?.phone ?? null,
      email: payload.subscriber?.email ?? null,
      channel: payload.channel ?? "manychat",
      content,
      receivedAt: payload.timestamp,
    });
    console.log("[manychat] inbound processed", {
      leadId: result.leadId,
      conversationId: result.conversationId,
      supermemoryOk: result.supermemoryOk,
      notifyOk: result.notifyOk,
    });
  } catch (error) {
    console.error("[manychat] inbound pipeline failed", error);
  }

  return ackResponse();
}
