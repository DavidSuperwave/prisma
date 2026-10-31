/**
 * Agent tools for chat-authored automations.
 *
 * These materialize rows in workspace_workflows (which already has an engine
 * + 5-minute cron tick in app/api/cron/workflow-tick/route.ts). Adding a
 * trigger.type = "cron" is the novel piece — the engine is extended to honor
 * it and to understand a new `run_recipe` step kind.
 *
 *   automations.create    -> new scheduled workflow (cron or event trigger)
 *   automations.list      -> list workflows with next_run / last_run hints
 *   automations.update    -> edit an existing workflow (trigger, steps, enabled)
 *   automations.disable   -> disable a workflow
 *   automations.run_now   -> enqueue a one-off run and execute it immediately
 */

import { registerTool, type ToolContext } from "../registry";
import { processRun } from "@/lib/workflows/engine";

const KNOWN_TRIGGER_TYPES = new Set([
  "record.created",
  "record.updated",
  "record.deleted",
  "cron",
  "lead.created",
  "lead.updated",
  "lead.stage_changed",
  "lead.qualified",
  "company.created",
  "company.updated",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "task.due",
  "task.completed",
  "task.overdue",
  "form.submitted",
  "whatsapp.message_received",
  "meta.lead_received",
  "activity.custom",
]);

// Minimum cron granularity we support given a 5-minute tick cadence.
const MIN_CRON_MINUTES = 5;

async function resolveWorkspaceId(ctx: ToolContext): Promise<string | null> {
  const mod = await import("@/lib/supabaseAdmin");
  const supabase = mod.getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

// Very small cron-like validator. Accepts 5 space-separated fields of the
// standard crontab form (digits, ranges, step values, comma lists, wildcard).
// We do not evaluate here; tick-time evaluation lives in the engine.
function isValidCronExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldRe = /^(\*|\*\/\d+|\d+(-\d+)?(\/\d+)?|\d+(,\d+)+)$/;
  return parts.every((p) => fieldRe.test(p));
}

registerTool({
  name: "automations.create",
  description:
    "Create a scheduled or event-driven automation (materialized as a workspace_workflows row). For recurring checks use trigger.type='cron' with a schedule like '*/30 * * * *'. Steps may include { type: 'run_recipe', integrationSlug, recipeSlug, vars }, { type: 'create_extraction_review_item', fieldId, reason, proposedValue, currentValue, confidence }, { type: 'run_workflow', workflowId|workflowName, waitForCompletion }, plus existing engine steps (send_email, send_whatsapp, update_record, create_task, wait, branch, enroll_in_sequence).",
  args: {
    name: { type: "string", required: true },
    description: { type: "string" },
    enabled: { type: "boolean", description: "Default true" },
    trigger: {
      type: "object",
      required: true,
      description: "{ type: 'cron' | <event>, schedule?: '*/30 * * * *', filter?: <Filter> }",
    },
    steps: { type: "array", required: true, description: "Workflow step array" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const trigger = (args.trigger as Record<string, unknown>) ?? {};
    const triggerType = String(trigger.type ?? "").trim();
    if (!triggerType) return { ok: false, error: "trigger.type is required.", status: 400 };
    if (!KNOWN_TRIGGER_TYPES.has(triggerType)) {
      return { ok: false, error: `Unknown trigger.type '${triggerType}'.`, status: 400 };
    }
    if (triggerType === "cron") {
      const schedule = typeof trigger.schedule === "string" ? trigger.schedule : "";
      if (!isValidCronExpression(schedule)) {
        return { ok: false, error: "trigger.schedule must be a 5-field cron expression.", status: 400 };
      }
    }
    const steps = Array.isArray(args.steps) ? args.steps : [];
    if (steps.length === 0) return { ok: false, error: "At least one step is required.", status: 400 };

    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };

    const { data, error } = await supabase
      .from("workspace_workflows")
      .insert({
        workspace_id: workspaceId,
        name: String(args.name),
        description: typeof args.description === "string" ? args.description : null,
        enabled: typeof args.enabled === "boolean" ? args.enabled : true,
        trigger,
        steps,
      })
      .select("id, name, enabled, trigger, steps, description, created_at, updated_at")
      .single();
    if (error) return { ok: false, error: error.message, status: 400 };
    return {
      ok: true,
      data: {
        id: String((data as { id: string }).id),
        name: String((data as { name: string }).name),
        enabled: Boolean((data as { enabled: boolean }).enabled),
        trigger: (data as { trigger: unknown }).trigger,
        stepCount: steps.length,
      },
    };
  },
});

registerTool({
  name: "automations.list",
  description: "List automations (workflows) for the workspace.",
  args: {
    triggerType: { type: "string", description: "Optional filter, e.g. 'cron'" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const { data, error } = await supabase
      .from("workspace_workflows")
      .select("id, name, description, enabled, trigger, steps, last_run_at, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) return { ok: false, error: error.message, status: 500 };
    const filterType = typeof args.triggerType === "string" ? args.triggerType : null;
    const rows = (data ?? []).filter((row) => {
      if (!filterType) return true;
      const tt = (row as { trigger?: { type?: string } }).trigger?.type ?? null;
      return tt === filterType;
    });
    return {
      ok: true,
      data: rows.map((row) => {
        const r = row as {
          id: string;
          name: string;
          description: string | null;
          enabled: boolean;
          trigger: Record<string, unknown> | null;
          steps: unknown[] | null;
          last_run_at: string | null;
          created_at: string;
          updated_at: string;
        };
        return {
          id: String(r.id),
          name: r.name,
          description: r.description,
          enabled: r.enabled,
          triggerType: (r.trigger?.type as string) ?? null,
          schedule: (r.trigger?.schedule as string | undefined) ?? null,
          stepCount: Array.isArray(r.steps) ? r.steps.length : 0,
          lastRunAt: r.last_run_at,
          updatedAt: r.updated_at,
        };
      }),
    };
  },
});

registerTool({
  name: "automations.update",
  description: "Patch an existing automation. Any provided field overwrites.",
  args: {
    workflowId: { type: "string", required: true },
    name: { type: "string" },
    description: { type: "string" },
    enabled: { type: "boolean" },
    trigger: { type: "object" },
    steps: { type: "array" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const patch: Record<string, unknown> = {};
    if (typeof args.name === "string") patch.name = args.name;
    if (typeof args.description === "string") patch.description = args.description;
    if (typeof args.enabled === "boolean") patch.enabled = args.enabled;
    if (args.trigger && typeof args.trigger === "object") {
      const trigger = args.trigger as Record<string, unknown>;
      const tt = String(trigger.type ?? "").trim();
      if (!KNOWN_TRIGGER_TYPES.has(tt)) {
        return { ok: false, error: `Unknown trigger.type '${tt}'.`, status: 400 };
      }
      if (tt === "cron") {
        const schedule = typeof trigger.schedule === "string" ? trigger.schedule : "";
        if (!isValidCronExpression(schedule)) {
          return { ok: false, error: "trigger.schedule must be a 5-field cron expression.", status: 400 };
        }
      }
      patch.trigger = trigger;
    }
    if (Array.isArray(args.steps)) patch.steps = args.steps;
    if (Object.keys(patch).length === 0) {
      return { ok: false, error: "Nothing to update.", status: 400 };
    }
    const { data, error } = await supabase
      .from("workspace_workflows")
      .update(patch)
      .eq("workspace_id", workspaceId)
      .eq("id", String(args.workflowId))
      .select("id, name, enabled, trigger")
      .maybeSingle();
    if (error) return { ok: false, error: error.message, status: 400 };
    if (!data) return { ok: false, error: "Workflow not found.", status: 404 };
    return { ok: true, data };
  },
});

registerTool({
  name: "automations.disable",
  description: "Disable an automation (sets enabled=false). Use automations.update to re-enable.",
  args: {
    workflowId: { type: "string", required: true },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const { error } = await supabase
      .from("workspace_workflows")
      .update({ enabled: false })
      .eq("workspace_id", workspaceId)
      .eq("id", String(args.workflowId));
    if (error) return { ok: false, error: error.message, status: 400 };
    return { ok: true, data: { disabled: true } };
  },
});

registerTool({
  name: "automations.run_now",
  description:
    "Enqueue and immediately execute a one-off run of an automation (bypasses the cron schedule). Useful for 'try it' flows from chat.",
  args: {
    workflowId: { type: "string", required: true },
    recordId: { type: "string", description: "Optional record context for the run" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const { data: workflow, error: loadErr } = await supabase
      .from("workspace_workflows")
      .select("id, workspace_id, trigger")
      .eq("workspace_id", workspaceId)
      .eq("id", String(args.workflowId))
      .maybeSingle();
    if (loadErr) return { ok: false, error: loadErr.message, status: 500 };
    if (!workflow) return { ok: false, error: "Workflow not found.", status: 404 };

    const { data: inserted, error: insertErr } = await supabase
      .from("workspace_workflow_runs")
      .insert({
        workflow_id: String((workflow as { id: string }).id),
        workspace_id: workspaceId,
        record_id: typeof args.recordId === "string" ? args.recordId : null,
        status: "pending",
        current_step: 0,
        context: {
          event_type: "manual",
          enqueued_at: new Date().toISOString(),
          source: "automations.run_now",
        },
      })
      .select("id")
      .single();
    if (insertErr) return { ok: false, error: insertErr.message, status: 500 };

    const runId = String((inserted as { id: string }).id);
    const result = await processRun(supabase, runId);
    return {
      ok: true,
      data: {
        runId,
        status: result?.status ?? "unknown",
        error: result?.error ?? null,
      },
    };
  },
});

registerTool({
  name: "automation_schedule",
  description:
    "Schedule an agent automation using cron syntax. Persists a workspace_workflows row and, when configured, provisions a Hermes cron job through the shim.",
  args: {
    prompt: { type: "string", required: true },
    cron: { type: "string", required: true },
    target_agent_id: { type: "string" },
    targetAgentId: { type: "string" },
    attached_skills: { type: "array" },
    attachedSkills: { type: "array" },
    deliver_to: { type: "string" },
    deliverTo: { type: "string" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };

    const prompt = String(args.prompt ?? "").trim();
    const cron = String(args.cron ?? "").trim();
    if (!prompt) return { ok: false, error: "prompt is required.", status: 400 };
    if (!cron || !isValidCronExpression(cron)) {
      return { ok: false, error: "cron must be a valid 5-field expression.", status: 400 };
    }
    const targetAgentId = String(args.target_agent_id ?? args.targetAgentId ?? "").trim();
    if (!targetAgentId) {
      return { ok: false, error: "target_agent_id is required.", status: 400 };
    }
    const attachedSkillsRaw = Array.isArray(args.attached_skills)
      ? args.attached_skills
      : Array.isArray(args.attachedSkills)
        ? args.attachedSkills
        : [];
    const attachedSkills = attachedSkillsRaw.map((entry) => String(entry)).filter((entry) => entry.length > 0);
    const deliverTo = String(args.deliver_to ?? args.deliverTo ?? "").trim() || null;

    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };

    const { data: workflow, error: workflowError } = await supabase
      .from("workspace_workflows")
      .insert({
        workspace_id: workspaceId,
        name: `Automation · ${prompt.slice(0, 72)}`,
        description: `Scheduled by automation_schedule for agent ${targetAgentId}.`,
        enabled: true,
        trigger: {
          type: "cron",
          schedule: cron,
        },
        steps: [
          {
            type: "agent_prompt",
            target_agent_id: targetAgentId,
            prompt,
            attached_skills: attachedSkills,
            deliver_to: deliverTo,
          },
        ],
      })
      .select("id, name, trigger, enabled")
      .single();
    if (workflowError) return { ok: false, error: workflowError.message, status: 400 };

    let shim: Record<string, unknown> | null = null;
    const shimUrl = process.env.PRISMA_HERMES_SHIM_URL?.trim();
    const shimCronEnabled = process.env.PRISMA_ENABLE_SHIM_CRON === "true";
    if (shimUrl && shimCronEnabled) {
      try {
        const response = await fetch(`${shimUrl.replace(/\/$/, "")}/cronjob/create`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(process.env.PRISMA_HERMES_SHIM_SHARED_SECRET
              ? { "x-prisma-shim-secret": process.env.PRISMA_HERMES_SHIM_SHARED_SECRET }
              : {}),
          },
          body: JSON.stringify({
            workspaceId,
            targetAgentId,
            prompt,
            cron,
            attachedSkills,
            deliverTo,
          }),
        });
        shim = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      } catch (error) {
        shim = {
          ok: false,
          error: error instanceof Error ? error.message : "Shim cron creation failed.",
        };
      }
    } else if (shimUrl && !shimCronEnabled) {
      shim = {
        ok: false,
        error:
          "Shim cron dispatch is disabled (PRISMA_ENABLE_SHIM_CRON!=true). Workflow schedule is persisted in Prisma only.",
      };
    }

    return {
      ok: true,
      data: {
        workflowId: String((workflow as { id: string }).id),
        name: String((workflow as { name: string }).name),
        cron,
        targetAgentId,
        attachedSkills,
        deliverTo,
        shim,
      },
    };
  },
});

export const __automationsInternal = { MIN_CRON_MINUTES };
