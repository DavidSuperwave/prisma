import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared helpers for logging record lifecycle events (create/update/delete)
 * to both `record_activities` (rich, per-record timeline) and `agent_events`
 * (lightweight, object-wide activity feed).
 *
 * All writes are best-effort: failures are caught and surfaced as console warnings
 * so they never break the underlying record mutation.
 */

export type RecordHistoryActor = {
  userId: string | null;
  agentId?: string | null;
};

export type FieldDiffEntry = {
  field: string;
  from: unknown;
  to: unknown;
};

const SENSITIVE_KEY_REGEX = /(password|secret|token|api[_-]?key|private[_-]?key|credential)/i;
const MAX_STRING_LEN = 400;

function truncateValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > MAX_STRING_LEN ? `${serialized.slice(0, MAX_STRING_LEN)}…` : serialized;
  } catch {
    return String(value);
  }
}

function redact(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_REGEX.test(key)) {
    return value === null || value === undefined || value === "" ? value : "[redacted]";
  }
  return truncateValue(value);
}

export function computeFieldDiff(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): FieldDiffEntry[] {
  const keys = new Set<string>([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]);
  const diff: FieldDiffEntry[] = [];
  for (const key of keys) {
    const prev = previous?.[key];
    const curr = next?.[key];
    if (JSON.stringify(prev) === JSON.stringify(curr)) continue;
    diff.push({
      field: key,
      from: redact(key, prev),
      to: redact(key, curr),
    });
  }
  return diff;
}

type LogArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  objectId: string;
  recordId: string;
  actor: RecordHistoryActor;
  type: "record.created" | "record.updated" | "record.deleted";
  diff?: FieldDiffEntry[];
  subject?: string;
};

/**
 * Write a history row to BOTH `record_activities` and `agent_events`.
 * Both writes are independently wrapped to avoid cascading failures.
 */
export async function logRecordHistory(args: LogArgs): Promise<void> {
  const { supabase, workspaceId, objectId, recordId, actor, type, diff, subject } = args;

  const subjectText =
    subject ??
    (type === "record.created"
      ? "Registro creado"
      : type === "record.deleted"
        ? "Registro eliminado"
        : diff && diff.length > 0
          ? `${diff.length} ${diff.length === 1 ? "campo modificado" : "campos modificados"}`
          : "Registro actualizado");

  const bodyPayload = diff && diff.length > 0 ? JSON.stringify({ diff }) : null;

  try {
    await supabase.from("record_activities").insert({
      workspace_id: workspaceId,
      object_id: objectId,
      record_id: recordId,
      type,
      subject: subjectText,
      body: bodyPayload,
      data: diff ? { diff } : {},
      author_user_id: actor.userId,
      author_agent_id: actor.agentId ?? null,
    });
  } catch (error) {
    console.warn("[recordHistory] record_activities insert failed", error);
  }

  try {
    await supabase.from("agent_events").insert({
      workspace_id: workspaceId,
      source_agent_id: actor.agentId ?? null,
      event_type: type,
      payload: {
        object_id: objectId,
        record_id: recordId,
        actor_user_id: actor.userId,
        diff: diff ?? [],
      },
    });
  } catch (error) {
    console.warn("[recordHistory] agent_events insert failed", error);
  }
}
