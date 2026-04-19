import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

type RecurrenceMeta = {
  frequency?: "daily" | "weekly" | "monthly" | "yearly" | string;
  interval?: number;
  nextRun?: string | null;
  endAt?: string | null;
  byWeekday?: number[];
  template?: boolean;
};

type TaskRow = {
  id: string;
  workspace_id: string;
  list_id: string | null;
  type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  assigned_to_user_id: string | null;
  owner_agent_id: string | null;
  record_id: string | null;
  custom_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  due_at: string | null;
  reminder_at: string | null;
  sort_order: number | null;
};

function addInterval(baseIso: string, frequency: string, interval: number): string {
  const base = new Date(baseIso);
  const next = new Date(base.getTime());
  const n = Math.max(1, Math.round(interval || 1));
  switch (frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + n);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7 * n);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + n);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + n);
      break;
    default:
      next.setUTCDate(next.getUTCDate() + n);
  }
  return next.toISOString();
}

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data, error } = await supabase
      .from("workspace_tasks")
      .select(
        "id, workspace_id, list_id, type, title, description, priority, status, assigned_to_user_id, owner_agent_id, record_id, custom_data, metadata, due_at, reminder_at, sort_order",
      )
      .not("metadata->recurrence", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as TaskRow[];
    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
      const metadata = (row.metadata as Record<string, unknown>) ?? {};
      const recurrence = (metadata.recurrence as RecurrenceMeta) ?? null;
      if (!recurrence || !recurrence.frequency) {
        skipped += 1;
        continue;
      }

      const nextRun = recurrence.nextRun ?? row.due_at;
      if (!nextRun) {
        skipped += 1;
        continue;
      }
      if (new Date(nextRun).getTime() > now.getTime()) {
        skipped += 1;
        continue;
      }
      if (recurrence.endAt && new Date(recurrence.endAt).getTime() < now.getTime()) {
        skipped += 1;
        continue;
      }

      const insertPayload = {
        workspace_id: row.workspace_id,
        list_id: row.list_id,
        type: row.type,
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: "pending",
        assigned_to_user_id: row.assigned_to_user_id,
        owner_agent_id: row.owner_agent_id,
        record_id: row.record_id,
        custom_data: row.custom_data,
        metadata: {
          ...metadata,
          recurrence: null,
          sourceRecurringTaskId: row.id,
          createdBy: "cron:tasks-recurring",
        },
        due_at: nextRun,
        reminder_at: row.reminder_at
          ? addInterval(row.reminder_at, recurrence.frequency, recurrence.interval ?? 1)
          : null,
        sort_order: row.sort_order ?? 0,
      };

      const { error: insertError } = await supabase
        .from("workspace_tasks")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertError) {
        console.error("tasks-recurring insert", insertError);
        continue;
      }

      const nextRunIso = addInterval(nextRun, recurrence.frequency, recurrence.interval ?? 1);
      const updatedMetadata = {
        ...metadata,
        recurrence: { ...recurrence, nextRun: nextRunIso },
      };
      const { error: updateError } = await supabase
        .from("workspace_tasks")
        .update({ metadata: updatedMetadata })
        .eq("id", row.id);
      if (updateError) {
        console.error("tasks-recurring update", updateError);
        continue;
      }

      await supabase.from("agent_events").insert({
        workspace_id: row.workspace_id,
        source_agent_id: row.owner_agent_id,
        event_type: "task.recurring_cloned",
        payload: {
          taskId: row.id,
          nextRun: nextRunIso,
          frequency: recurrence.frequency,
        },
      });

      processed += 1;
    }

    return Response.json({ ok: true, processed, skipped, total: rows.length, at: nowIso });
  } catch (error) {
    const message = error instanceof Error ? error.message : "tasks-recurring tick failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
