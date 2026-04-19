/**
 * Webhook idempotency helpers backed by the Supabase `processed_webhooks` table.
 *
 * Usage:
 *   const gate = await checkAndRecordIdempotency(client, {
 *     key: `${subscriberId}:${messageId}`,
 *     source: "manychat",
 *     workspaceId,
 *   });
 *   if (gate.alreadyProcessed) {
 *     return ack200();
 *   }
 *
 * The store is keyed on a caller-supplied `idempotency_key` (PRIMARY KEY on the
 * table). A duplicate call is detected by an ON CONFLICT DO NOTHING insert that
 * returns zero rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type IdempotencyCheckArgs = {
  key: string;
  source: string;
  workspaceId?: string | null;
};

export type IdempotencyResult =
  | { alreadyProcessed: true; processedAt: string }
  | { alreadyProcessed: false };

export function buildManychatIdempotencyKey(params: {
  subscriberId: string;
  messageId?: string | null;
  timestamp?: string | number | null;
}): string {
  const pieces = [
    "manychat",
    params.subscriberId,
    params.messageId ?? `t:${params.timestamp ?? ""}`,
  ];
  return pieces.join(":");
}

export async function checkAndRecordIdempotency(
  client: SupabaseClient,
  args: IdempotencyCheckArgs,
): Promise<IdempotencyResult> {
  const insertPayload: Record<string, unknown> = {
    idempotency_key: args.key,
    source: args.source,
  };
  if (args.workspaceId) {
    insertPayload.workspace_id = args.workspaceId;
  }

  const { data: inserted, error: insertError } = await client
    .from("processed_webhooks")
    .insert(insertPayload)
    .select("idempotency_key, processed_at")
    .maybeSingle();

  if (!insertError && inserted) {
    return { alreadyProcessed: false };
  }

  if (insertError && !isUniqueViolation(insertError)) {
    throw new Error(
      `processed_webhooks insert failed: ${insertError.message ?? String(insertError)}`,
    );
  }

  const { data: existing, error: readError } = await client
    .from("processed_webhooks")
    .select("processed_at")
    .eq("idempotency_key", args.key)
    .maybeSingle();

  if (readError) {
    throw new Error(
      `processed_webhooks lookup failed: ${readError.message}`,
    );
  }

  return {
    alreadyProcessed: true,
    processedAt: existing?.processed_at ?? new Date().toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "23505";
}
