import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTemplateContext } from "@/lib/templates/context";
import { render } from "@/lib/templates/render";
import { evaluateFilter, type Filter } from "@/lib/workflows/filter";

export type WorkflowEventType =
  | "lead.created"
  | "lead.updated"
  | "lead.stage_changed"
  | "lead.qualified"
  | "company.created"
  | "company.updated"
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "task.due"
  | "task.completed"
  | "task.overdue"
  | "form.submitted"
  | "whatsapp.message_received"
  | "meta.lead_received"
  | "activity.custom";

export type WorkflowEventExtra = Record<string, unknown>;

export type WorkflowEventRecord = {
  id: string;
  objectId?: string | null;
  kind?: "crm_people" | "crm_companies" | "crm_deals" | null;
  data?: Record<string, unknown> | null;
} | null;

export type WorkflowEventInput = {
  supabase: SupabaseClient;
  workspaceId: string;
  type: WorkflowEventType;
  record?: WorkflowEventRecord;
  extra?: WorkflowEventExtra;
  actorUserId?: string | null;
  /**
   * Depth of this event inside a self-triggering chain. Used for re-entrancy guard.
   */
  depth?: number;
};

export type WorkflowStepBase = { id?: string };

export type SendTemplateStep = WorkflowStepBase & {
  type: "send_email" | "send_sms" | "send_whatsapp";
  templateId?: string;
  to?: string;
};

export type UpdateRecordStep = WorkflowStepBase & {
  type: "update_record";
  patch: Record<string, unknown>;
};

export type CreateTaskStep = WorkflowStepBase & {
  type: "create_task";
  title: string;
  assignedToUserId?: string | null;
  ownerAgentId?: string | null;
  dueInHours?: number;
  dueInDays?: number;
  taskType?: string;
};

export type CreateDealStep = WorkflowStepBase & {
  type: "create_deal";
  title?: string;
  amount?: number;
  pipelineId?: string;
  stageId?: string;
};

export type CreateNoteStep = WorkflowStepBase & {
  type: "create_note";
  subject?: string;
  body: string;
};

export type AgentHandoffStep = WorkflowStepBase & {
  type: "agent_handoff";
  ownerAgentId: string;
  reason?: string;
  title?: string;
};

export type DelayStep = WorkflowStepBase & {
  type: "delay" | "wait";
  hours?: number;
  days?: number;
  minutes?: number;
};

export type BranchStep = WorkflowStepBase & {
  type: "branch";
  if: Filter;
  then: WorkflowStep[];
  else?: WorkflowStep[];
};

export type EnrollInSequenceStep = WorkflowStepBase & {
  type: "enroll_in_sequence";
  sequenceId: string;
};

/**
 * Execute a saved recipe by (integrationSlug, recipeSlug). Any {{var}}
 * placeholders in the recipe template are resolved from the `vars` object
 * (merged with `context.steps` for chained steps, so step N+1 can reference
 * step N's response via vars like {{steps.<stepKey>.data.foo}}).
 */
export type RunRecipeStep = WorkflowStepBase & {
  type: "run_recipe";
  integrationSlug: string;
  recipeSlug: string;
  /** Optional key under which to stash this step's result on context.steps */
  saveAs?: string;
  /** Static vars; may include {{var}} placeholders that reference prior step outputs */
  vars?: Record<string, unknown>;
};

export type WorkflowStep =
  | SendTemplateStep
  | UpdateRecordStep
  | CreateTaskStep
  | CreateDealStep
  | CreateNoteStep
  | AgentHandoffStep
  | DelayStep
  | BranchStep
  | EnrollInSequenceStep
  | RunRecipeStep;

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  enabled: boolean;
  trigger: { type?: string; filter?: Filter } | null;
  steps: WorkflowStep[] | null;
};

type RunRow = {
  id: string;
  workflow_id: string;
  workspace_id: string;
  record_id: string | null;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  current_step: number;
  context: Record<string, unknown> | null;
  error: string | null;
};

export const MAX_WORKFLOW_DEPTH = 5;

function nowIso(): string {
  return new Date().toISOString();
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeSteps(steps: unknown): WorkflowStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter((step): step is WorkflowStep => !!step && typeof step === "object" && "type" in step);
}

function flattenSteps(steps: WorkflowStep[], context: Record<string, unknown>): WorkflowStep[] {
  const out: WorkflowStep[] = [];
  for (const step of steps) {
    if (step.type === "branch") {
      const matched = evaluateFilter(step.if, context);
      const branch = matched ? toArray(step.then) : toArray(step.else);
      out.push(...flattenSteps(branch, context));
    } else {
      out.push(step);
    }
  }
  return out;
}

async function emitEventRow(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    type: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("agent_events").insert({
      workspace_id: params.workspaceId,
      event_type: params.type,
      payload: params.payload,
    });
  } catch (error) {
    console.error("workflow emitEventRow failed", error instanceof Error ? error.message : error);
  }
}

function triggerMatchesEvent(triggerType: string | undefined, eventType: WorkflowEventType): boolean {
  if (!triggerType) return false;
  if (triggerType === eventType) return true;
  // convenience: lead.qualified is a subclass of lead.stage_changed
  if (eventType === "lead.qualified" && triggerType === "lead.stage_changed") return true;
  return false;
}

export async function emitEvent(input: WorkflowEventInput): Promise<{ runs: string[]; eventPayload: Record<string, unknown> }> {
  const { supabase, workspaceId, type, record, extra } = input;
  const depth = input.depth ?? 0;

  const payload: Record<string, unknown> = {
    type,
    workspace_id: workspaceId,
    record_id: record?.id ?? null,
    record_kind: record?.kind ?? null,
    object_id: record?.objectId ?? null,
    record_data: record?.data ?? null,
    depth,
    ...(extra ?? {}),
  };

  await emitEventRow(supabase, { workspaceId, type: `workflow.${type}`, payload });

  const runs: string[] = [];

  if (depth >= MAX_WORKFLOW_DEPTH) {
    console.warn(`[workflows] skipping workflow enqueue for ${type} at depth ${depth}`);
    return { runs, eventPayload: payload };
  }

  const { data: workflows, error } = await supabase
    .from("workspace_workflows")
    .select("id, workspace_id, name, enabled, trigger, steps")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  if (error) {
    console.error("[workflows] failed to load workflows", error.message);
    return { runs, eventPayload: payload };
  }

  const filterContext: Record<string, unknown> = {
    event: payload,
    record: record?.data ?? {},
    data: record?.data ?? {},
  };

  for (const row of (workflows ?? []) as WorkflowRow[]) {
    const triggerType = row.trigger?.type;
    if (!triggerMatchesEvent(triggerType, type)) continue;
    const filter = row.trigger?.filter as Filter;
    if (!evaluateFilter(filter, filterContext)) continue;

    const { data: inserted, error: insertError } = await supabase
      .from("workspace_workflow_runs")
      .insert({
        workflow_id: row.id,
        workspace_id: workspaceId,
        record_id: record?.id ?? null,
        status: "pending",
        current_step: 0,
        context: {
          event_type: type,
          event_payload: payload,
          depth,
          enqueued_at: nowIso(),
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[workflows] failed to enqueue run", insertError.message);
      continue;
    }
    runs.push(String(inserted.id));
  }

  return { runs, eventPayload: payload };
}

async function fetchRun(supabase: SupabaseClient, runId: string): Promise<RunRow | null> {
  const { data, error } = await supabase
    .from("workspace_workflow_runs")
    .select("id, workflow_id, workspace_id, record_id, status, current_step, context, error")
    .eq("id", runId)
    .maybeSingle();
  if (error || !data) return null;
  return data as RunRow;
}

async function fetchWorkflow(supabase: SupabaseClient, workflowId: string): Promise<WorkflowRow | null> {
  const { data, error } = await supabase
    .from("workspace_workflows")
    .select("id, workspace_id, name, enabled, trigger, steps")
    .eq("id", workflowId)
    .maybeSingle();
  if (error || !data) return null;
  return data as WorkflowRow;
}

type TemplateRow = {
  id: string;
  name: string;
  channel: "email" | "sms" | "whatsapp";
  subject: string | null;
  body: string;
};

async function fetchTemplate(
  supabase: SupabaseClient,
  workspaceId: string,
  templateId: string,
): Promise<TemplateRow | null> {
  const { data, error } = await supabase
    .from("workspace_templates")
    .select("id, name, channel, subject, body")
    .eq("workspace_id", workspaceId)
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TemplateRow;
}

async function resolveFallbackRecipient(
  supabase: SupabaseClient,
  workspaceId: string,
  recordId: string | null,
  channel: "email" | "sms" | "whatsapp",
): Promise<string | null> {
  if (!recordId) return null;
  const { data } = await supabase
    .from("records")
    .select("data")
    .eq("workspace_id", workspaceId)
    .eq("id", recordId)
    .maybeSingle();
  const recordData = (data?.data ?? {}) as Record<string, unknown>;
  if (channel === "email") {
    return typeof recordData.email === "string" ? recordData.email : null;
  }
  const phone = typeof recordData.phone === "string" ? recordData.phone : null;
  return phone;
}

export type ExecuteStepResult =
  | { kind: "ok"; contextPatch?: Record<string, unknown> }
  | { kind: "wait"; resumeAt: string }
  | { kind: "error"; message: string };

/**
 * Render `{{path.to.value}}` placeholders inside an arbitrary JSON value
 * using the current run context. Missing references collapse to "".
 */
function resolveVarPath(ctx: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split(".");
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function renderVarString(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const val = resolveVarPath(ctx, key);
    return val === undefined || val === null ? "" : typeof val === "string" ? val : JSON.stringify(val);
  });
}

function renderVars<T>(value: T, ctx: Record<string, unknown>): T {
  if (typeof value === "string") return renderVarString(value, ctx) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => renderVars(v, ctx)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = renderVars(v, ctx);
    }
    return out as unknown as T;
  }
  return value;
}

export async function executeStep(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    step: WorkflowStep;
    recordId: string | null;
    context: Record<string, unknown>;
  },
): Promise<ExecuteStepResult> {
  const { supabase: _unused, workspaceId, step, recordId } = { supabase, ...params };
  void _unused;
  try {
    switch (step.type) {
      case "send_email":
      case "send_sms":
      case "send_whatsapp": {
        const channel = step.type === "send_email" ? "email" : step.type === "send_sms" ? "sms" : "whatsapp";
        const template = step.templateId
          ? await fetchTemplate(supabase, workspaceId, step.templateId)
          : null;
        const to =
          (typeof step.to === "string" && step.to) ||
          (await resolveFallbackRecipient(supabase, workspaceId, recordId, channel));
        const ctx = recordId
          ? await buildTemplateContext({ supabase, workspaceId, recordId })
          : { user: {}, owner: {}, deal: {}, company: {}, person: {} };
        const rendered = template
          ? {
              subject: template.subject ? render(template.subject, ctx) : null,
              body: render(template.body, ctx),
            }
          : { subject: null, body: "" };
        await emitEventRow(supabase, {
          workspaceId,
          type: `outbound_${channel}_stub`,
          payload: {
            channel,
            to,
            subject: rendered.subject,
            body: rendered.body,
            template_id: step.templateId ?? null,
            record_id: recordId,
          },
        });
        if (recordId) {
          const { data: objData } = await supabase
            .from("records")
            .select("object_id")
            .eq("id", recordId)
            .maybeSingle();
          if (objData) {
            await supabase.from("record_activities").insert({
              workspace_id: workspaceId,
              record_id: recordId,
              object_id: String((objData as { object_id: string }).object_id),
              type: `outbound_${channel}`,
              subject: rendered.subject,
              body: rendered.body,
              data: { to, template_id: step.templateId ?? null },
            });
          }
        }
        return { kind: "ok" };
      }

      case "update_record": {
        if (!recordId) return { kind: "error", message: "update_record requires record context" };
        const patch = step.patch ?? {};
        const { data: existing, error: loadErr } = await supabase
          .from("records")
          .select("id, object_id, data")
          .eq("workspace_id", workspaceId)
          .eq("id", recordId)
          .maybeSingle();
        if (loadErr) return { kind: "error", message: loadErr.message };
        if (!existing) return { kind: "error", message: "record not found" };
        const objectId = String((existing as { object_id: string }).object_id);

        const { data: fields } = await supabase
          .from("workspace_fields")
          .select("key")
          .eq("workspace_id", workspaceId)
          .eq("object_id", objectId);
        const allowed = new Set(
          (fields ?? []).map((row) => String((row as { key: string }).key)),
        );
        const safePatch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (allowed.has(key)) safePatch[key] = value;
        }
        if (Object.keys(safePatch).length === 0) {
          return { kind: "ok" };
        }
        const merged = { ...((existing as { data: Record<string, unknown> }).data ?? {}), ...safePatch };
        const { error: updateErr } = await supabase
          .from("records")
          .update({ data: merged, updated_at: nowIso() })
          .eq("id", recordId);
        if (updateErr) return { kind: "error", message: updateErr.message };
        return { kind: "ok" };
      }

      case "create_task": {
        const dueAt = step.dueInHours || step.dueInDays
          ? new Date(
              Date.now() +
                ((step.dueInDays ?? 0) * 24 * 60 + (step.dueInHours ?? 0) * 60) * 60 * 1000,
            ).toISOString()
          : null;
        await supabase.from("workspace_tasks").insert({
          workspace_id: workspaceId,
          record_id: recordId,
          source_record_id: recordId,
          type: step.taskType ?? "follow_up",
          title: step.title,
          status: "pending",
          priority: "normal",
          assigned_to_user_id: step.assignedToUserId ?? null,
          owner_agent_id: step.ownerAgentId ?? null,
          due_at: dueAt,
          metadata: { source: "workflow" },
        });
        return { kind: "ok" };
      }

      case "create_note": {
        if (!recordId) return { kind: "error", message: "create_note requires record context" };
        const { data: existing } = await supabase
          .from("records")
          .select("object_id")
          .eq("id", recordId)
          .maybeSingle();
        if (!existing) return { kind: "error", message: "record not found" };
        const ctx = await buildTemplateContext({ supabase, workspaceId, recordId });
        await supabase.from("record_activities").insert({
          workspace_id: workspaceId,
          record_id: recordId,
          object_id: String((existing as { object_id: string }).object_id),
          type: "note",
          subject: step.subject ? render(step.subject, ctx) : null,
          body: render(step.body, ctx),
          data: { source: "workflow" },
        });
        return { kind: "ok" };
      }

      case "create_deal": {
        const { data: dealsObj } = await supabase
          .from("workspace_objects")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("kind", "crm_deals")
          .maybeSingle();
        if (!dealsObj) return { kind: "error", message: "CRM deals object not provisioned" };
        const dealData: Record<string, unknown> = {
          title: step.title ?? "Deal",
        };
        if (typeof step.amount === "number") dealData.amount = step.amount;
        if (step.pipelineId) dealData.pipeline_id = step.pipelineId;
        if (step.stageId) dealData.stage_id = step.stageId;
        if (recordId) {
          const { data: sourceRecord } = await supabase
            .from("records")
            .select("object_id, data")
            .eq("id", recordId)
            .maybeSingle();
          const sourceData = (sourceRecord?.data ?? {}) as Record<string, unknown>;
          const { data: objRow } = await supabase
            .from("workspace_objects")
            .select("kind")
            .eq("id", String((sourceRecord as { object_id: string } | null)?.object_id ?? ""))
            .maybeSingle();
          const sourceKind = (objRow as { kind?: string } | null)?.kind ?? null;
          if (sourceKind === "crm_people") {
            dealData.primary_contact_id = recordId;
            if (typeof sourceData.company_id === "string") dealData.company_id = sourceData.company_id;
          } else if (sourceKind === "crm_companies") {
            dealData.company_id = recordId;
          }
        }
        await supabase.from("records").insert({
          workspace_id: workspaceId,
          object_id: String((dealsObj as { id: string }).id),
          data: dealData,
        });
        return { kind: "ok" };
      }

      case "agent_handoff": {
        await supabase.from("workspace_tasks").insert({
          workspace_id: workspaceId,
          record_id: recordId,
          source_record_id: recordId,
          type: "agent_handoff",
          title: step.title ?? "Agent handoff",
          status: "pending",
          priority: "high",
          owner_agent_id: step.ownerAgentId,
          metadata: { reason: step.reason ?? null, source: "workflow" },
        });
        return { kind: "ok" };
      }

      case "delay":
      case "wait": {
        const minutes =
          (step.minutes ?? 0) + (step.hours ?? 0) * 60 + (step.days ?? 0) * 24 * 60;
        const resumeAt = new Date(Date.now() + Math.max(minutes, 0) * 60 * 1000).toISOString();
        return { kind: "wait", resumeAt };
      }

      case "enroll_in_sequence": {
        if (!recordId) return { kind: "error", message: "enroll_in_sequence requires a record" };
        await supabase
          .from("workspace_sequence_enrollments")
          .insert({
            workspace_id: workspaceId,
            sequence_id: step.sequenceId,
            record_id: recordId,
            status: "active",
            current_step: 0,
            next_run_at: nowIso(),
          })
          .select("id");
        return { kind: "ok" };
      }

      case "run_recipe": {
        // Lazy import to avoid pulling recipe deps into every engine consumer.
        const { runRecipe } = await import("@/lib/integrations/recipes");
        const integrationSlug = step.integrationSlug;
        const recipeSlug = step.recipeSlug;
        if (!integrationSlug || !recipeSlug) {
          return { kind: "error", message: "run_recipe requires integrationSlug and recipeSlug" };
        }
        const resolvedVars = renderVars(step.vars ?? {}, params.context) as Record<string, unknown>;
        const result = await runRecipe({
          workspaceId,
          integrationSlug,
          recipeSlug,
          vars: resolvedVars,
        });
        const saveAs = step.saveAs ?? recipeSlug;
        const stepsCtx = (params.context.steps as Record<string, unknown> | undefined) ?? {};
        const nextStepsCtx: Record<string, unknown> = {
          ...stepsCtx,
          [saveAs]: {
            ok: result.ok,
            status: result.status,
            data: "data" in result ? result.data : null,
            error: "error" in result ? result.error : null,
          },
        };
        if (!result.ok) {
          // Surface as step error so the run is marked failed — the agent will
          // see this in workspace_outbound_events and can decide to retry.
          return { kind: "error", message: `recipe ${recipeSlug} failed: ${result.error}` };
        }
        return { kind: "ok", contextPatch: { steps: nextStepsCtx } };
      }

      case "branch":
        // handled by flatten
        return { kind: "ok" };

      default:
        return { kind: "ok" };
    }
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "step execution failed" };
  }
}

export async function processRun(supabase: SupabaseClient, runId: string): Promise<RunRow | null> {
  const run = await fetchRun(supabase, runId);
  if (!run) return null;
  if (run.status === "succeeded" || run.status === "failed" || run.status === "skipped") {
    return run;
  }

  const workflow = await fetchWorkflow(supabase, run.workflow_id);
  if (!workflow) {
    await supabase
      .from("workspace_workflow_runs")
      .update({ status: "failed", error: "workflow missing", completed_at: nowIso() })
      .eq("id", runId);
    return run;
  }

  const rawSteps = normalizeSteps(workflow.steps);
  const context: Record<string, unknown> = {
    ...(run.context ?? {}),
    record_id: run.record_id,
    workspace_id: run.workspace_id,
  };
  const steps = flattenSteps(rawSteps, context);

  await supabase
    .from("workspace_workflow_runs")
    .update({ status: "running", started_at: nowIso() })
    .eq("id", runId);

  let stepIndex = run.current_step ?? 0;

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    const result = await executeStep(supabase, {
      workspaceId: run.workspace_id,
      step,
      recordId: run.record_id,
      context,
    });
    if (result.kind === "error") {
      await supabase
        .from("workspace_workflow_runs")
        .update({
          status: "failed",
          error: result.message,
          current_step: stepIndex,
          completed_at: nowIso(),
        })
        .eq("id", runId);
      return { ...run, status: "failed", error: result.message, current_step: stepIndex };
    }
    if (result.kind === "wait") {
      await supabase
        .from("workspace_workflow_runs")
        .update({
          status: "pending",
          current_step: stepIndex + 1,
          context: { ...context, resume_at: result.resumeAt },
        })
        .eq("id", runId);
      return { ...run, status: "pending", current_step: stepIndex + 1 };
    }
    if (result.contextPatch) {
      for (const [k, v] of Object.entries(result.contextPatch)) {
        context[k] = v;
      }
    }
    stepIndex += 1;
    await supabase
      .from("workspace_workflow_runs")
      .update({ current_step: stepIndex, context })
      .eq("id", runId);
  }

  await supabase
    .from("workspace_workflow_runs")
    .update({ status: "succeeded", current_step: stepIndex, completed_at: nowIso() })
    .eq("id", runId);
  return { ...run, status: "succeeded", current_step: stepIndex };
}

export async function tickPendingRuns(input: {
  supabase: SupabaseClient;
  workspaceId?: string;
  maxBatch?: number;
}): Promise<{ processed: number; runs: string[] }> {
  const { supabase, workspaceId, maxBatch = 50 } = input;
  let query = supabase
    .from("workspace_workflow_runs")
    .select("id, workspace_id, status, current_step, context")
    .eq("status", "pending")
    .limit(maxBatch);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) {
    console.error("[workflows] tickPendingRuns failed", error.message);
    return { processed: 0, runs: [] };
  }

  const processed: string[] = [];
  const now = Date.now();
  for (const row of (data ?? []) as Array<{ id: string; context: Record<string, unknown> | null }>) {
    const resumeAt = row.context?.resume_at as string | undefined;
    if (resumeAt && new Date(resumeAt).getTime() > now) continue;
    await processRun(supabase, String(row.id));
    processed.push(String(row.id));
  }
  return { processed: processed.length, runs: processed };
}

export async function safeEmitEvent(input: WorkflowEventInput): Promise<void> {
  try {
    await emitEvent(input);
  } catch (error) {
    console.error(
      `[workflows] safeEmitEvent failed for ${input.type}`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Minimal 5-field cron matcher: checks whether `date` matches `expr`.
 * Supports *, numeric ranges (M-N), step values (* / N), and comma lists.
 * Day-of-week is Sun=0..Sat=6. We only check month-minute-granularity; ticks
 * coarser than minutes are not representable here anyway.
 */
function cronMatches(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay();
  return (
    fieldMatches(parts[0], minute, 0, 59) &&
    fieldMatches(parts[1], hour, 0, 23) &&
    fieldMatches(parts[2], dayOfMonth, 1, 31) &&
    fieldMatches(parts[3], month, 1, 12) &&
    fieldMatches(parts[4], dayOfWeek, 0, 6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  for (const token of field.split(",")) {
    if (tokenMatches(token, value, min, max)) return true;
  }
  return false;
}

function tokenMatches(token: string, value: number, min: number, max: number): boolean {
  let stepStr: string | undefined;
  let rangeStr = token;
  if (token.includes("/")) {
    const [r, s] = token.split("/");
    rangeStr = r;
    stepStr = s;
  }
  let rangeMin = min;
  let rangeMax = max;
  if (rangeStr !== "*") {
    if (rangeStr.includes("-")) {
      const [a, b] = rangeStr.split("-").map(Number);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      rangeMin = a;
      rangeMax = b;
    } else {
      const n = Number(rangeStr);
      if (Number.isNaN(n)) return false;
      if (stepStr === undefined) return value === n;
      rangeMin = n;
      rangeMax = max;
    }
  }
  if (value < rangeMin || value > rangeMax) return false;
  const step = stepStr ? Number(stepStr) : 1;
  if (Number.isNaN(step) || step <= 0) return false;
  return (value - rangeMin) % step === 0;
}

/**
 * Granularity cushion: any cron workflow that fired within this many minutes
 * will NOT be re-fired in the current tick. Matches the 5-minute
 * workflow-tick cadence configured in vercel.json.
 */
const CRON_DEBOUNCE_MINUTES = 4;

/**
 * Enqueue runs for any cron-triggered workflow whose schedule matches "now"
 * and hasn't already fired within the debounce window. Returns counts for
 * observability.
 */
export async function tickCronWorkflows(input: {
  supabase: SupabaseClient;
  workspaceId?: string;
  now?: Date;
}): Promise<{ enqueued: number; runs: string[] }> {
  const { supabase, workspaceId } = input;
  const now = input.now ?? new Date();
  let query = supabase
    .from("workspace_workflows")
    .select("id, workspace_id, name, enabled, trigger, steps, last_run_at")
    .eq("enabled", true);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) {
    console.error("[workflows] tickCronWorkflows load failed", error.message);
    return { enqueued: 0, runs: [] };
  }
  const runs: string[] = [];
  const debounceMs = CRON_DEBOUNCE_MINUTES * 60 * 1000;
  for (const row of (data ?? []) as Array<{
    id: string;
    workspace_id: string;
    name: string;
    trigger: { type?: string; schedule?: string } | null;
    last_run_at: string | null;
  }>) {
    const trigger = row.trigger ?? {};
    if (trigger.type !== "cron") continue;
    const schedule = trigger.schedule;
    if (typeof schedule !== "string" || !schedule) continue;
    if (!cronMatches(schedule, now)) continue;
    if (row.last_run_at) {
      const last = new Date(row.last_run_at).getTime();
      if (now.getTime() - last < debounceMs) continue;
    }
    const { data: inserted, error: insertError } = await supabase
      .from("workspace_workflow_runs")
      .insert({
        workflow_id: row.id,
        workspace_id: row.workspace_id,
        record_id: null,
        status: "pending",
        current_step: 0,
        context: {
          event_type: "cron",
          schedule,
          enqueued_at: now.toISOString(),
        },
      })
      .select("id")
      .single();
    if (insertError) {
      console.error("[workflows] tickCronWorkflows enqueue failed", insertError.message);
      continue;
    }
    await supabase
      .from("workspace_workflows")
      .update({ last_run_at: now.toISOString() })
      .eq("id", row.id);
    runs.push(String(inserted.id));
  }
  return { enqueued: runs.length, runs };
}
