import type { SupabaseClient } from "@supabase/supabase-js";
import { executeStep, type WorkflowStep } from "@/lib/workflows/engine";
import { evaluateFilter, type Filter } from "@/lib/workflows/filter";

type SequenceStep =
  | { type: "email" | "sms" | "whatsapp"; templateId: string; to?: string }
  | { type: "wait"; days?: number; hours?: number; minutes?: number }
  | { type: "branch"; if: Filter; then: SequenceStep[]; else?: SequenceStep[] }
  | { type: "exit"; reason?: string };

type SequenceRow = {
  id: string;
  workspace_id: string;
  name: string;
  enabled: boolean;
  steps: SequenceStep[] | null;
};

type EnrollmentRow = {
  id: string;
  workspace_id: string;
  sequence_id: string;
  record_id: string;
  status: "active" | "paused" | "completed" | "exited";
  current_step: number;
  next_run_at: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSteps(input: unknown): SequenceStep[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (step): step is SequenceStep => !!step && typeof step === "object" && typeof (step as { type?: unknown }).type === "string",
  );
}

function computeStepDelayMs(step: SequenceStep): number {
  if (step.type !== "wait") return 0;
  const minutes = (step.minutes ?? 0) + (step.hours ?? 0) * 60 + (step.days ?? 0) * 24 * 60;
  return Math.max(minutes, 0) * 60 * 1000;
}

function flattenSteps(steps: SequenceStep[], context: Record<string, unknown>): SequenceStep[] {
  const out: SequenceStep[] = [];
  for (const step of steps) {
    if (step.type === "branch") {
      const matched = evaluateFilter(step.if, context);
      const branch = matched ? step.then : (step.else ?? []);
      out.push(...flattenSteps(branch ?? [], context));
    } else {
      out.push(step);
    }
  }
  return out;
}

function toWorkflowStep(step: SequenceStep): WorkflowStep | null {
  if (step.type === "email") {
    return { type: "send_email", templateId: step.templateId, to: step.to };
  }
  if (step.type === "sms") {
    return { type: "send_sms", templateId: step.templateId, to: step.to };
  }
  if (step.type === "whatsapp") {
    return { type: "send_whatsapp", templateId: step.templateId, to: step.to };
  }
  return null;
}

async function fetchSequence(supabase: SupabaseClient, sequenceId: string): Promise<SequenceRow | null> {
  const { data, error } = await supabase
    .from("workspace_sequences")
    .select("id, workspace_id, name, enabled, steps")
    .eq("id", sequenceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as SequenceRow;
}

function delayForFirstStep(steps: SequenceStep[]): string {
  if (steps.length === 0) return nowIso();
  const first = steps[0];
  if (first.type === "wait") {
    return new Date(Date.now() + computeStepDelayMs(first)).toISOString();
  }
  return nowIso();
}

export async function enrollRecord(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  sequenceId: string;
  recordId: string;
  enrolledBy?: string | null;
}): Promise<{ enrollmentId: string | null; error?: string }> {
  const { supabase, workspaceId, sequenceId, recordId, enrolledBy } = input;
  const sequence = await fetchSequence(supabase, sequenceId);
  if (!sequence || sequence.workspace_id !== workspaceId) {
    return { enrollmentId: null, error: "sequence not found" };
  }
  if (!sequence.enabled) {
    return { enrollmentId: null, error: "sequence disabled" };
  }
  const steps = normalizeSteps(sequence.steps);
  const nextRunAt = delayForFirstStep(steps);
  const { data, error } = await supabase
    .from("workspace_sequence_enrollments")
    .upsert(
      {
        workspace_id: workspaceId,
        sequence_id: sequenceId,
        record_id: recordId,
        status: "active",
        current_step: 0,
        next_run_at: nextRunAt,
        enrolled_by: enrolledBy ?? null,
      },
      { onConflict: "sequence_id,record_id" },
    )
    .select("id")
    .single();
  if (error) {
    return { enrollmentId: null, error: error.message };
  }
  return { enrollmentId: String(data.id) };
}

export async function tick(input: {
  supabase: SupabaseClient;
  workspaceId?: string;
  maxBatch?: number;
}): Promise<{ processed: number }> {
  const { supabase, workspaceId, maxBatch = 100 } = input;
  let query = supabase
    .from("workspace_sequence_enrollments")
    .select("id, workspace_id, sequence_id, record_id, status, current_step, next_run_at")
    .eq("status", "active")
    .lte("next_run_at", nowIso())
    .limit(maxBatch);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  if (error) {
    console.error("[sequences] tick query failed", error.message);
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of (data ?? []) as EnrollmentRow[]) {
    try {
      await advanceEnrollment(supabase, row);
      processed += 1;
    } catch (err) {
      console.error("[sequences] tick step failed", err instanceof Error ? err.message : err);
    }
  }
  return { processed };
}

async function advanceEnrollment(supabase: SupabaseClient, enrollment: EnrollmentRow): Promise<void> {
  const sequence = await fetchSequence(supabase, enrollment.sequence_id);
  if (!sequence || !sequence.enabled) {
    await supabase
      .from("workspace_sequence_enrollments")
      .update({ status: "exited" })
      .eq("id", enrollment.id);
    return;
  }

  const rawSteps = normalizeSteps(sequence.steps);
  const { data: recordRow } = await supabase
    .from("records")
    .select("data")
    .eq("id", enrollment.record_id)
    .maybeSingle();
  const context: Record<string, unknown> = {
    record: (recordRow?.data as Record<string, unknown>) ?? {},
    data: (recordRow?.data as Record<string, unknown>) ?? {},
  };
  const steps = flattenSteps(rawSteps, context);

  let index = enrollment.current_step;
  while (index < steps.length) {
    const step = steps[index];
    if (step.type === "exit") {
      await supabase
        .from("workspace_sequence_enrollments")
        .update({
          status: "exited",
          current_step: index + 1,
          next_run_at: null,
        })
        .eq("id", enrollment.id);
      return;
    }
    if (step.type === "wait") {
      const resumeAt = new Date(Date.now() + computeStepDelayMs(step)).toISOString();
      await supabase
        .from("workspace_sequence_enrollments")
        .update({
          current_step: index + 1,
          next_run_at: resumeAt,
        })
        .eq("id", enrollment.id);
      return;
    }
    const workflowStep = toWorkflowStep(step);
    if (workflowStep) {
      const result = await executeStep(supabase, {
        workspaceId: enrollment.workspace_id,
        step: workflowStep,
        recordId: enrollment.record_id,
        context,
      });
      if (result.kind === "error") {
        console.error("[sequences] step failed", result.message);
      }
    }
    index += 1;
  }

  await supabase
    .from("workspace_sequence_enrollments")
    .update({
      status: "completed",
      current_step: index,
      next_run_at: null,
    })
    .eq("id", enrollment.id);
}

export async function pauseEnrollment(supabase: SupabaseClient, enrollmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("workspace_sequence_enrollments")
    .update({ status: "paused" })
    .eq("id", enrollmentId);
  return !error;
}

export async function resumeEnrollment(supabase: SupabaseClient, enrollmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("workspace_sequence_enrollments")
    .update({ status: "active", next_run_at: nowIso() })
    .eq("id", enrollmentId);
  return !error;
}

export async function exitEnrollment(supabase: SupabaseClient, enrollmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("workspace_sequence_enrollments")
    .update({ status: "exited", next_run_at: null })
    .eq("id", enrollmentId);
  return !error;
}
