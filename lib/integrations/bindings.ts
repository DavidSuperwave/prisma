/**
 * Object <-> integration bindings.
 *
 * A binding says "this workspace object is sourced from (pull) or published
 * to (push) this integration, using this mapping and cadence." The agent
 * creates bindings via the `bindings.*` tools; the UI Data Sources panel
 * edits them; the scheduler ticks scheduled pulls.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type BindingDirection = "pull" | "push" | "two_way";
export type BindingMode = "manual" | "on_demand" | "scheduled";
export type BindingStatus = "active" | "paused" | "error";

export type Binding = {
  id: string;
  workspaceId: string;
  objectId: string;
  integrationId: string;
  recipeId: string | null;
  label: string;
  direction: BindingDirection;
  mode: BindingMode;
  cadence: string | null;
  mapping: Record<string, unknown>;
  matchKey: string | null;
  status: BindingStatus;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  createdBy: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBindingInput = {
  workspaceId: string;
  objectId: string;
  integrationId: string;
  recipeId?: string | null;
  label: string;
  direction: BindingDirection;
  mode: BindingMode;
  cadence?: string | null;
  mapping: Record<string, unknown>;
  matchKey?: string | null;
  createdBy?: string | null;
  createdByAgentId?: string | null;
};

export type UpdateBindingInput = Partial<{
  label: string;
  direction: BindingDirection;
  mode: BindingMode;
  cadence: string | null;
  mapping: Record<string, unknown>;
  matchKey: string | null;
  status: BindingStatus;
  recipeId: string | null;
}>;

function requireAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

function mapBinding(row: Record<string, unknown>): Binding {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    integrationId: String(row.integration_id),
    recipeId: row.recipe_id ? String(row.recipe_id) : null,
    label: String(row.label),
    direction: String(row.direction) as BindingDirection,
    mode: String(row.mode) as BindingMode,
    cadence: row.cadence ? String(row.cadence) : null,
    mapping: (row.mapping as Record<string, unknown>) ?? {},
    matchKey: row.match_key ? String(row.match_key) : null,
    status: String(row.status ?? "active") as BindingStatus,
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    lastStatus: row.last_status ? String(row.last_status) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdByAgentId: row.created_by_agent_id ? String(row.created_by_agent_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const SELECT_COLS =
  "id, workspace_id, object_id, integration_id, recipe_id, label, direction, mode, cadence, mapping, match_key, status, last_run_at, last_status, last_error, created_by, created_by_agent_id, created_at, updated_at";

export async function listBindings(workspaceId: string, objectId?: string): Promise<Binding[]> {
  const supabase = requireAdmin();
  let q = supabase
    .from("workspace_object_bindings")
    .select(SELECT_COLS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (objectId) q = q.eq("object_id", objectId);
  const { data, error } = await q;
  if (error) {
    if (error.message.includes("workspace_object_bindings")) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapBinding(row as Record<string, unknown>));
}

export async function getBinding(workspaceId: string, bindingId: string): Promise<Binding | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_object_bindings")
    .select(SELECT_COLS)
    .eq("workspace_id", workspaceId)
    .eq("id", bindingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBinding(data as Record<string, unknown>) : null;
}

export async function createBinding(input: CreateBindingInput): Promise<Binding> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_object_bindings")
    .insert({
      workspace_id: input.workspaceId,
      object_id: input.objectId,
      integration_id: input.integrationId,
      recipe_id: input.recipeId ?? null,
      label: input.label,
      direction: input.direction,
      mode: input.mode,
      cadence: input.cadence ?? null,
      mapping: input.mapping,
      match_key: input.matchKey ?? null,
      created_by: input.createdBy ?? null,
      created_by_agent_id: input.createdByAgentId ?? null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapBinding(data as Record<string, unknown>);
}

export async function updateBinding(
  workspaceId: string,
  bindingId: string,
  patch: UpdateBindingInput,
): Promise<Binding | null> {
  const supabase = requireAdmin();
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.direction !== undefined) update.direction = patch.direction;
  if (patch.mode !== undefined) update.mode = patch.mode;
  if (patch.cadence !== undefined) update.cadence = patch.cadence;
  if (patch.mapping !== undefined) update.mapping = patch.mapping;
  if (patch.matchKey !== undefined) update.match_key = patch.matchKey;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.recipeId !== undefined) update.recipe_id = patch.recipeId;
  if (Object.keys(update).length === 0) return getBinding(workspaceId, bindingId);
  const { error } = await supabase
    .from("workspace_object_bindings")
    .update(update)
    .eq("workspace_id", workspaceId)
    .eq("id", bindingId);
  if (error) throw new Error(error.message);
  return getBinding(workspaceId, bindingId);
}

export async function deleteBinding(workspaceId: string, bindingId: string): Promise<boolean> {
  const supabase = requireAdmin();
  const { error } = await supabase
    .from("workspace_object_bindings")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", bindingId);
  if (error) throw new Error(error.message);
  return true;
}

export async function markBindingRun(
  bindingId: string,
  status: string,
  error: string | null,
): Promise<void> {
  const supabase = requireAdmin();
  await supabase
    .from("workspace_object_bindings")
    .update({
      last_run_at: new Date().toISOString(),
      last_status: status,
      last_error: error,
    })
    .eq("id", bindingId);
}

/**
 * Read one value out of a possibly nested object using a dotted path that can
 * include `[N]` indexes. Used to apply a binding's `mapping` on pull.
 *
 *   readPath({ contacts: [{ emails: [{ email: "x@y.z" }] }] }, "contacts[0].emails[0].email")
 *     -> "x@y.z"
 */
export function readPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((p) => p.length > 0);
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const idx = Number(part);
      if (!Number.isInteger(idx)) return undefined;
      cursor = cursor[idx];
      continue;
    }
    if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return cursor;
}

/**
 * Apply a mapping JSON to a raw external row. The mapping shape is
 * `{ "<externalPath>": "<localKey>" }`; each key is a JSONPath-lite into
 * `row`, each value is the destination key on the produced record.data.
 */
export function applyMapping(mapping: Record<string, unknown>, row: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [src, destRaw] of Object.entries(mapping)) {
    if (typeof destRaw !== "string" || !destRaw) continue;
    const value = readPath(row, src);
    if (value === undefined) continue;
    out[destRaw] = value;
  }
  return out;
}

/**
 * Pick out the array of rows from an arbitrary API response. Recognizes
 * common envelope keys (data, results, items, records, objects, vehicles,
 * deployments, ...) and falls back to the top-level array if the response
 * itself is an array.
 */
export function findCollection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const keys = [
    "data",
    "results",
    "items",
    "records",
    "objects",
    "vehicles",
    "deployments",
    "projects",
    "rows",
    "list",
  ];
  for (const k of keys) {
    if (Array.isArray(obj[k])) return obj[k] as unknown[];
  }
  return [];
}
