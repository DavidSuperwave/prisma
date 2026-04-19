/**
 * Integration recipes — the "remember and recall" layer for 3rd-party APIs.
 *
 * A recipe is a templated HTTP request the agent learned works against a
 * configured integration. Saving a recipe captures method/path/query/body
 * with {{var}} placeholders plus a trimmed sample response. Running a recipe
 * resolves placeholders against caller-supplied vars, issues the request via
 * the integration's provider adapter, and logs the outcome to the outbound
 * audit log (same plumbing as integrations.call).
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getIntegrationById,
  getIntegrationBySlug,
  getIntegrationSecrets,
  logOutboundEvent,
} from "@/lib/integrations/store";
import { getProviderAdapter } from "@/lib/integrations/registry";

export type RecipePublic = {
  id: string;
  workspaceId: string;
  integrationId: string;
  integrationSlug?: string;
  slug: string;
  name: string;
  description: string | null;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathTemplate: string;
  queryTemplate: Record<string, unknown>;
  bodyTemplate: unknown;
  headersTemplate: Record<string, unknown>;
  sampleResponse: unknown;
  successCount: number;
  lastUsedAt: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveRecipeInput = {
  workspaceId: string;
  integrationId: string;
  slug?: string;
  name: string;
  description?: string | null;
  method: string;
  pathTemplate: string;
  queryTemplate?: Record<string, unknown>;
  bodyTemplate?: unknown;
  headersTemplate?: Record<string, unknown>;
  sampleResponse?: unknown;
  createdByAgentId?: string | null;
  createdBy?: string | null;
};

function requireAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "recipe"
  );
}

async function ensureUniqueSlug(
  workspaceId: string,
  integrationId: string,
  base: string,
): Promise<string> {
  const supabase = requireAdmin();
  let candidate = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const { data } = await supabase
      .from("workspace_integration_recipes")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${slugify(base)}-${i + 2}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

function toPublic(row: Record<string, unknown>): RecipePublic {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    integrationId: String(row.integration_id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    method: (String(row.method) as RecipePublic["method"]),
    pathTemplate: String(row.path_template),
    queryTemplate: (row.query_template as Record<string, unknown>) ?? {},
    bodyTemplate: row.body_template ?? null,
    headersTemplate: (row.headers_template as Record<string, unknown>) ?? {},
    sampleResponse: row.sample_response ?? null,
    successCount: Number(row.success_count ?? 0),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    createdByAgentId: row.created_by_agent_id ? String(row.created_by_agent_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveRecipe(input: SaveRecipeInput): Promise<RecipePublic> {
  const supabase = requireAdmin();
  const method = input.method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error(`Invalid method: ${input.method}`);
  }
  if (!input.pathTemplate.startsWith("/")) {
    throw new Error("pathTemplate must start with '/'.");
  }
  const slugBase = input.slug?.trim() || input.name;
  const slug = await ensureUniqueSlug(input.workspaceId, input.integrationId, slugBase);
  const sampleTrimmed = trimSample(input.sampleResponse);

  const { data, error } = await supabase
    .from("workspace_integration_recipes")
    .insert({
      workspace_id: input.workspaceId,
      integration_id: input.integrationId,
      slug,
      name: input.name,
      description: input.description ?? null,
      method,
      path_template: input.pathTemplate,
      query_template: input.queryTemplate ?? {},
      body_template: input.bodyTemplate ?? null,
      headers_template: input.headersTemplate ?? {},
      sample_response: sampleTrimmed,
      created_by_agent_id: input.createdByAgentId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(
      "id, workspace_id, integration_id, slug, name, description, method, path_template, query_template, body_template, headers_template, sample_response, success_count, last_used_at, created_by_agent_id, created_at, updated_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return toPublic(data as Record<string, unknown>);
}

export async function listRecipes(
  workspaceId: string,
  integrationId?: string,
): Promise<RecipePublic[]> {
  const supabase = requireAdmin();
  let q = supabase
    .from("workspace_integration_recipes")
    .select(
      "id, workspace_id, integration_id, slug, name, description, method, path_template, query_template, body_template, headers_template, sample_response, success_count, last_used_at, created_by_agent_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (integrationId) q = q.eq("integration_id", integrationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toPublic(row as Record<string, unknown>));
}

export async function getRecipeBySlug(
  workspaceId: string,
  integrationIdOrSlug: string,
  recipeSlug: string,
): Promise<RecipePublic | null> {
  const supabase = requireAdmin();
  // Accept either an integrationId (uuid) or an integration slug.
  let integrationId = integrationIdOrSlug;
  const isUuidish = /^[0-9a-f-]{32,36}$/i.test(integrationIdOrSlug);
  if (!isUuidish) {
    const integration = await getIntegrationBySlug(workspaceId, integrationIdOrSlug);
    if (!integration) return null;
    integrationId = integration.id;
  }
  const { data, error } = await supabase
    .from("workspace_integration_recipes")
    .select(
      "id, workspace_id, integration_id, slug, name, description, method, path_template, query_template, body_template, headers_template, sample_response, success_count, last_used_at, created_by_agent_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("integration_id", integrationId)
    .eq("slug", recipeSlug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPublic(data as Record<string, unknown>);
}

export async function getRecipeById(
  workspaceId: string,
  recipeId: string,
): Promise<RecipePublic | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_integration_recipes")
    .select(
      "id, workspace_id, integration_id, slug, name, description, method, path_template, query_template, body_template, headers_template, sample_response, success_count, last_used_at, created_by_agent_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", recipeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPublic(data as Record<string, unknown>);
}

export async function deleteRecipe(workspaceId: string, recipeId: string): Promise<boolean> {
  const supabase = requireAdmin();
  const { error } = await supabase
    .from("workspace_integration_recipes")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", recipeId);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Render `{{var}}` placeholders in a string using a flat vars map.
 * Missing keys render as empty strings.
 */
function renderString(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = resolvePath(vars, key);
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolvePath(obj: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Deep-render a JSON structure: strings pass through renderString, objects
 * and arrays recurse, other primitives are returned as-is.
 */
function renderJson<T>(value: T, vars: Record<string, unknown>): T {
  if (typeof value === "string") {
    return renderString(value, vars) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => renderJson(v, vars)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[renderString(k, vars)] = renderJson(v, vars);
    }
    return out as unknown as T;
  }
  return value;
}

function coerceQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (typeof v === "string" && v === "") continue;
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

function trimSample(data: unknown): unknown {
  if (data === null || data === undefined) return null;
  try {
    const json = JSON.stringify(data);
    if (json.length <= 4000) return data;
    // Keep shape visible but truncated.
    return { truncated: true, preview: json.slice(0, 4000) };
  } catch {
    return null;
  }
}

export type RunRecipeResult =
  | { ok: true; status: number; data: unknown; latencyMs: number; url: string }
  | { ok: false; status: number; error: string; data?: unknown; url?: string };

export async function runRecipe(params: {
  workspaceId: string;
  recipeId?: string;
  integrationSlug?: string;
  recipeSlug?: string;
  vars?: Record<string, unknown>;
  createdBy?: string | null;
}): Promise<RunRecipeResult> {
  const vars = params.vars ?? {};
  let recipe: RecipePublic | null = null;
  if (params.recipeId) {
    recipe = await getRecipeById(params.workspaceId, params.recipeId);
  } else if (params.integrationSlug && params.recipeSlug) {
    recipe = await getRecipeBySlug(params.workspaceId, params.integrationSlug, params.recipeSlug);
  }
  if (!recipe) return { ok: false, status: 404, error: "Recipe not found." };

  const integration = await getIntegrationById(params.workspaceId, recipe.integrationId);
  if (!integration) return { ok: false, status: 404, error: "Integration not found." };
  if (integration.status !== "active") {
    return { ok: false, status: 400, error: `Integration ${integration.slug} is ${integration.status}.` };
  }
  const adapter = getProviderAdapter(integration.provider);
  if (!adapter) {
    return { ok: false, status: 400, error: `No adapter for provider ${integration.provider}.` };
  }
  const secrets = await getIntegrationSecrets(integration.id);

  const renderedPath = renderString(recipe.pathTemplate, vars);
  const renderedQuery = coerceQuery(renderJson(recipe.queryTemplate, vars));
  const renderedBody =
    recipe.bodyTemplate === null || recipe.bodyTemplate === undefined
      ? undefined
      : renderJson(recipe.bodyTemplate, vars);
  const renderedHeaders = renderJson(recipe.headersTemplate, vars) as Record<string, string>;

  let built;
  try {
    built = adapter.buildRequest({
      secrets,
      config: integration.config,
      method: recipe.method,
      path: renderedPath,
      query: renderedQuery,
      body: renderedBody,
      headers: renderedHeaders,
    });
  } catch (err) {
    return { ok: false, status: 400, error: err instanceof Error ? err.message : "Bad request" };
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Network error";
    await logOutboundEvent({
      workspaceId: params.workspaceId,
      integrationId: integration.id,
      kind: `recipes.run:${recipe.slug}`,
      targetUrl: built.url,
      requestBody: renderedBody ?? null,
      ok: false,
      error: errorMessage,
      createdBy: params.createdBy ?? null,
    });
    return { ok: false, status: 502, error: errorMessage, url: built.url };
  }
  const latencyMs = Date.now() - startedAt;
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 2000);
  }

  await logOutboundEvent({
    workspaceId: params.workspaceId,
    integrationId: integration.id,
    kind: `recipes.run:${recipe.slug}`,
    targetUrl: built.url,
    requestBody: renderedBody ?? null,
    responseStatus: response.status,
    responseBody: response.ok ? null : (typeof parsed === "object" ? parsed : { preview: String(parsed).slice(0, 500) }),
    ok: response.ok,
    error: response.ok ? null : `HTTP ${response.status}`,
    createdBy: params.createdBy ?? null,
  });

  if (response.ok) {
    await bumpSuccess(recipe.id);
    return { ok: true, status: response.status, data: parsed, latencyMs, url: built.url };
  }
  return {
    ok: false,
    status: response.status,
    error: `HTTP ${response.status}`,
    data: parsed,
    url: built.url,
  };
}

async function bumpSuccess(recipeId: string): Promise<void> {
  const supabase = requireAdmin();
  // Prefer RPC-free atomic bump; fall back to read-modify-write.
  const { data } = await supabase
    .from("workspace_integration_recipes")
    .select("success_count")
    .eq("id", recipeId)
    .maybeSingle();
  const next = Number((data as { success_count?: number } | null)?.success_count ?? 0) + 1;
  await supabase
    .from("workspace_integration_recipes")
    .update({ success_count: next, last_used_at: new Date().toISOString() })
    .eq("id", recipeId);
}
