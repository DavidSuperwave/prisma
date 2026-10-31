import { registerTool, type ToolResult } from "../registry";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type DelegateArgs = {
  target_agent_id?: string;
  targetAgentId?: string;
  source_agent_id?: string;
  sourceAgentId?: string;
  goal?: string;
  context?: Record<string, unknown>;
  deadline?: string;
  depth?: number;
  parent_task_id?: string;
  parentTaskId?: string;
};

async function resolveWorkspaceId(workspaceSlug: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

async function resolveDefaultTaskListId(workspaceId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspace_task_lists")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.id) return String(data.id);

  const fallback = await supabase
    .from("workspace_task_lists")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return fallback.data?.id ? String(fallback.data.id) : null;
}

registerTool({
  name: "peer.list_agents",
  description:
    "List the workspace agents available for peer_delegate. Use this BEFORE peer_delegate to disambiguate which operator should own a task. Returns id, name, role, isActive, and a short summary so you can match the user's intent.",
  args: {},
  handler: async (_args, ctx): Promise<ToolResult> => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const workspaceId = await resolveWorkspaceId(ctx.workspaceSlug);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };

    const { data, error } = await supabase
      .from("workspace_agents")
      .select("id, name, type, status, description, soul_md, skills_scope")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: error.message, status: 400 };

    const agents = (data ?? []).map((row) => {
      const soul = typeof row.soul_md === "string" ? row.soul_md.trim() : "";
      const summaryFromSoul = soul ? soul.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 240) : null;
      const summary = summaryFromSoul ?? (typeof row.description === "string" ? row.description : null);
      const skillsScope = Array.isArray(row.skills_scope)
        ? (row.skills_scope as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : [];
      return {
        id: String(row.id),
        name: typeof row.name === "string" ? row.name : "",
        type: typeof row.type === "string" ? row.type : "",
        status: typeof row.status === "string" ? row.status : "",
        isActive: row.status === "active",
        skillsScope,
        summary,
      };
    });

    return { ok: true, data: { agents } };
  },
});

registerTool({
  name: "peer_delegate",
  description:
    "Delegate work to another workspace agent. Creates a workspace_tasks row and optionally forwards the delegation to the Hermes shim.",
  args: {
    target_agent_id: { type: "string", description: "Target agent id (preferred)." },
    targetAgentId: { type: "string", description: "camelCase alias for target agent id." },
    goal: { type: "string", required: true },
    context: { type: "object" },
    deadline: { type: "string", description: "Optional due-at timestamp for the delegated task." },
    depth: { type: "number", description: "Delegation chain depth. Must be <= 2." },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as DelegateArgs;
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };

    const workspaceId = await resolveWorkspaceId(ctx.workspaceSlug);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const defaultListId = await resolveDefaultTaskListId(workspaceId);

    const targetAgentId = String(args.target_agent_id ?? args.targetAgentId ?? "").trim();
    const sourceAgentId = String(args.source_agent_id ?? args.sourceAgentId ?? "").trim() || null;
    const goal = String(args.goal ?? "").trim();
    const contextPayload =
      args.context && typeof args.context === "object" && !Array.isArray(args.context)
        ? args.context
        : {};
    const depthFromArgs = Number.isFinite(args.depth as number) ? Number(args.depth) : 0;
    const depthFromContext =
      Number.isFinite((contextPayload as { delegation_depth?: number }).delegation_depth as number)
        ? Number((contextPayload as { delegation_depth?: number }).delegation_depth)
        : 0;
    const depth = Math.max(0, Math.max(depthFromArgs, depthFromContext));
    const parentTaskId = String(args.parent_task_id ?? args.parentTaskId ?? "").trim() || null;
    if (!targetAgentId) return { ok: false, error: "target_agent_id is required.", status: 400 };
    if (!goal) return { ok: false, error: "goal is required.", status: 400 };
    if (depth >= 2) {
      return {
        ok: false,
        error: "Delegation depth-limit-2 exceeded. Refusing peer-of-peer delegation.",
        status: 409,
      };
    }

    const dueAt =
      typeof args.deadline === "string" && args.deadline.trim().length > 0
        ? args.deadline.trim()
        : null;

    const { data: inserted, error: insertError } = await supabase
      .from("workspace_tasks")
      .insert({
        workspace_id: workspaceId,
        list_id: defaultListId,
        type: "peer_delegate",
        title: goal.slice(0, 160),
        description: goal,
        owner_agent_id: targetAgentId,
        status: "pending",
        priority: "normal",
        due_at: dueAt,
        metadata: {
          delegated_by_tool: true,
          depth: depth + 1,
          source_agent_id: sourceAgentId,
          parent_task_id: parentTaskId,
          context: contextPayload,
        },
        custom_data: {},
      })
      .select("id, owner_agent_id, status, due_at")
      .single();

    if (insertError) {
      return { ok: false, error: insertError.message, status: 400 };
    }

    let shimResult: Record<string, unknown> | null = null;
    let summary: string | null = null;
    const shimUrl = process.env.PRISMA_HERMES_SHIM_URL?.trim();
    const shimDelegateEnabled = process.env.PRISMA_ENABLE_SHIM_DELEGATE === "true";
    if (shimUrl && shimDelegateEnabled) {
      try {
        const response = await fetch(`${shimUrl.replace(/\/$/, "")}/delegate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(process.env.PRISMA_HERMES_SHIM_SHARED_SECRET
              ? { "x-prisma-shim-secret": process.env.PRISMA_HERMES_SHIM_SHARED_SECRET }
              : {}),
          },
          body: JSON.stringify({
            workspaceId,
            sourceAgentId,
            targetAgentId,
            goal,
            context: contextPayload,
          }),
        });
        shimResult = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        summary =
          typeof shimResult.summary === "string" && shimResult.summary.trim().length > 0
            ? shimResult.summary.trim()
            : null;
      } catch (error) {
        shimResult = {
          ok: false,
          error: error instanceof Error ? error.message : "Shim delegate call failed.",
        };
      }
    } else if (shimUrl && !shimDelegateEnabled) {
      shimResult = {
        ok: false,
        error:
          "Shim delegation is disabled (PRISMA_ENABLE_SHIM_DELEGATE!=true). Task was created but not dispatched to shim.",
      };
    }

    const autoCompleteEnabled = process.env.PRISMA_ENABLE_DELEGATION_AUTOCOMPLETE === "true";
    if (summary && autoCompleteEnabled) {
      const taskId = String((inserted as { id: string }).id);
      const { data: existingTask } = await supabase
        .from("workspace_tasks")
        .select("metadata")
        .eq("id", taskId)
        .maybeSingle();
      const existingMetadata =
        existingTask?.metadata &&
        typeof existingTask.metadata === "object" &&
        !Array.isArray(existingTask.metadata)
          ? (existingTask.metadata as Record<string, unknown>)
          : {};
      await supabase
        .from("workspace_tasks")
        .update({
          status: "done",
          metadata: {
            ...existingMetadata,
            summary,
            summary_at: new Date().toISOString(),
          },
        })
        .eq("id", taskId);

      const sourceRecordId =
        typeof contextPayload.sourceRecordId === "string" ? contextPayload.sourceRecordId : null;
      const sourceObjectId =
        typeof contextPayload.sourceObjectId === "string" ? contextPayload.sourceObjectId : null;
      if (sourceRecordId && sourceObjectId) {
        await supabase.from("record_activities").insert({
          workspace_id: workspaceId,
          record_id: sourceRecordId,
          object_id: sourceObjectId,
          type: "peer_delegate_summary",
          author_agent_id: targetAgentId,
          subject: "Delegated task completed",
          body: summary,
          data: {
            task_id: taskId,
            target_agent_id: targetAgentId,
          },
        });
      }
    }

    return {
      ok: true,
      data: {
        taskId: String((inserted as { id: string }).id),
        targetAgentId: String((inserted as { owner_agent_id: string }).owner_agent_id),
        status: String((inserted as { status: string }).status),
        dueAt: (inserted as { due_at?: string | null }).due_at ?? null,
        delegationDepth: depth + 1,
        shim: shimResult,
      },
    };
  },
});
