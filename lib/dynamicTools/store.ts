import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

import {
  dynamicToolNameFromSpec,
  type DynamicToolRow,
  type DynamicToolStatus,
  type LogDynamicToolRunInput,
  type UpsertDynamicToolInput,
} from "./types";

export type { UpsertDynamicToolInput, DynamicToolRow };

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabase;
}

export type ListDynamicToolsOptions = {
  status?: DynamicToolStatus;
  agentId?: string | null;
};

/**
 * List dynamic tool rows for a workspace, optionally filtered by status and/or agent.
 * When `agentId` is provided, includes tools for that agent OR tools with null agent (workspace-wide).
 */
export async function listDynamicTools(
  workspaceId: string,
  options: ListDynamicToolsOptions = {},
): Promise<DynamicToolRow[]> {
  const supabase = requireSupabase();
  let q = supabase
    .from("workspace_dynamic_tools")
    .select(
      "id, workspace_id, agent_id, name, description, args_schema, implementation, status, source_document_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId);
  if (options.status) {
    q = q.eq("status", options.status);
  }
  if (options.agentId !== undefined) {
    if (options.agentId === null) {
      q = q.is("agent_id", null);
    } else {
      q = q.or(`agent_id.is.null,agent_id.eq.${options.agentId}`);
    }
  }
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as DynamicToolRow[];
}

export async function getDynamicTool(
  workspaceId: string,
  toolName: string,
): Promise<DynamicToolRow | null> {
  const supabase = requireSupabase();
  const name = dynamicToolNameFromSpec(toolName);
  if (!name) return null;
  const { data, error } = await supabase
    .from("workspace_dynamic_tools")
    .select(
      "id, workspace_id, agent_id, name, description, args_schema, implementation, status, source_document_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("name", name)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as DynamicToolRow) ?? null;
}

export async function getDynamicToolById(
  workspaceId: string,
  toolId: string,
): Promise<DynamicToolRow | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("workspace_dynamic_tools")
    .select(
      "id, workspace_id, agent_id, name, description, args_schema, implementation, status, source_document_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", toolId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as DynamicToolRow) ?? null;
}

export async function upsertDynamicTool(
  workspaceId: string,
  spec: UpsertDynamicToolInput,
): Promise<DynamicToolRow> {
  const supabase = requireSupabase();
  const name = dynamicToolNameFromSpec(spec.name);
  if (!name) {
    throw new Error("Tool name is required.");
  }
  const row = {
    workspace_id: workspaceId,
    agent_id: spec.agentId ?? null,
    name,
    description: spec.description,
    args_schema: spec.args_schema,
    implementation: spec.implementation,
    status: (spec.status ?? "draft") as DynamicToolStatus,
    source_document_id: spec.sourceDocumentId ?? null,
  };
  const { data, error } = await supabase
    .from("workspace_dynamic_tools")
    .upsert(row, { onConflict: "workspace_id,name" })
    .select(
      "id, workspace_id, agent_id, name, description, args_schema, implementation, status, source_document_id, created_at, updated_at",
    )
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data as DynamicToolRow;
}

export async function setDynamicToolStatus(
  workspaceId: string,
  toolId: string,
  status: DynamicToolStatus,
): Promise<DynamicToolRow> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("workspace_dynamic_tools")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", toolId)
    .select(
      "id, workspace_id, agent_id, name, description, args_schema, implementation, status, source_document_id, created_at, updated_at",
    )
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data as DynamicToolRow;
}

export async function logDynamicToolRun(
  workspaceId: string,
  run: LogDynamicToolRunInput,
): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("workspace_dynamic_tool_runs")
    .insert({
      workspace_id: workspaceId,
      tool_id: run.toolId,
      agent_id: run.agentId ?? null,
      args: run.args,
      result: run.result,
      ok: run.ok,
      duration_ms: run.durationMs,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return String((data as { id: string }).id);
}

export type BatchUpsertInput = UpsertDynamicToolInput[];

export async function batchUpsertDynamicTools(
  workspaceId: string,
  specs: BatchUpsertInput,
): Promise<DynamicToolRow[]> {
  if (specs.length === 0) return [];
  const out: DynamicToolRow[] = [];
  for (const spec of specs) {
    out.push(await upsertDynamicTool(workspaceId, spec));
  }
  return out;
}

/**
 * Count recent tool runs in a time window (for rate limiting).
 */
export async function countDynamicToolRunsSince(
  workspaceId: string,
  since: Date,
): Promise<number> {
  const supabase = requireSupabase();
  const { count, error } = await supabase
    .from("workspace_dynamic_tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", since.toISOString());
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}
