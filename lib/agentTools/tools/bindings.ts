/**
 * Agent tools for object <-> data-source bindings.
 *
 * Bindings are the generic glue between a workspace object (vehicles,
 * people, projects, …) and a configured integration (Close, HubSpot,
 * Vercel, gb_automotriz_cms, …). The agent creates them in chat; the
 * scheduler honors `mode:'scheduled'` ones; `bindings.run_now` executes
 * a one-off pull/push against the bound integration using the binding's
 * JSON mapping — no per-provider tool code required.
 */

import { registerTool, type ToolContext, type ToolResult } from "../registry";
import { signProposal, verifyProposal } from "../confirmToken";
import {
  applyMapping,
  createBinding,
  deleteBinding,
  findCollection,
  getBinding,
  listBindings,
  markBindingRun,
  updateBinding,
  type Binding,
  type BindingDirection,
  type BindingMode,
} from "@/lib/integrations/bindings";
import {
  getIntegrationById,
  getIntegrationBySlug,
  getIntegrationSecrets,
  logOutboundEvent,
} from "@/lib/integrations/store";
import { getProviderAdapter } from "@/lib/integrations/registry";
import { listWorkspaceObjects, listWorkspaceRecords } from "@/lib/workspaceStore";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function resolveWorkspaceId(ctx: ToolContext): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

async function resolveObject(workspaceId: string, ref: { objectId?: unknown; objectSlug?: unknown }) {
  const objects = await listWorkspaceObjects(workspaceId);
  if (typeof ref.objectId === "string" && ref.objectId) {
    return objects.find((o) => o.id === ref.objectId) ?? null;
  }
  if (typeof ref.objectSlug === "string" && ref.objectSlug) {
    return objects.find((o) => o.slug === ref.objectSlug) ?? null;
  }
  return null;
}

function publicBinding(b: Binding) {
  return {
    id: b.id,
    objectId: b.objectId,
    integrationId: b.integrationId,
    recipeId: b.recipeId,
    label: b.label,
    direction: b.direction,
    mode: b.mode,
    cadence: b.cadence,
    mapping: b.mapping,
    matchKey: b.matchKey,
    status: b.status,
    lastRunAt: b.lastRunAt,
    lastStatus: b.lastStatus,
    lastError: b.lastError,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* list / create / update / delete                                            */
/* -------------------------------------------------------------------------- */

registerTool({
  name: "bindings.list",
  description:
    "List object<->integration bindings in this workspace, optionally filtered to a single object. Returns mapping, cadence, last_run_at, and status for each binding.",
  args: {
    objectId: { type: "string" },
    objectSlug: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    let objectId: string | undefined;
    if (typeof args.objectId === "string" || typeof args.objectSlug === "string") {
      const obj = await resolveObject(workspaceId, args);
      if (!obj) return { ok: false, error: "Object not found.", status: 404 };
      objectId = obj.id;
    }
    const rows = await listBindings(workspaceId, objectId);
    return { ok: true, data: { bindings: rows.map(publicBinding) } };
  },
});

registerTool({
  name: "bindings.create",
  description:
    "Bind a workspace object to a configured integration so the agent can pull from or push to it without custom per-provider code. `mapping` is `{ externalPath: localKey }`, where externalPath is a dotted JSONPath-lite into the external row (e.g. `contacts[0].emails[0].email`) and localKey is the destination key on `records.data`. Use `matchKey` (a local field key like `slug` or `email`) to dedupe on pull. Returns the created binding.",
  args: {
    objectSlug: { type: "string", description: "Workspace object slug (preferred)." },
    objectId: { type: "string" },
    integrationSlug: { type: "string", description: "Integration slug from integrations.list (preferred)." },
    integrationId: { type: "string" },
    direction: { type: "string", required: true, description: "pull | push | two_way" },
    mode: { type: "string", required: true, description: "manual | on_demand | scheduled" },
    cadence: { type: "string", description: "Cron expression (5-field) when mode=scheduled." },
    mapping: { type: "object", required: true, description: "{ externalPath: localKey } map." },
    matchKey: { type: "string", description: "Local field key used to dedupe on pull." },
    label: { type: "string" },
    recipeSlug: { type: "string", description: "Optional integration_recipes slug to reuse." },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };

    const direction = String(args.direction ?? "").trim() as BindingDirection;
    const mode = String(args.mode ?? "").trim() as BindingMode;
    if (!["pull", "push", "two_way"].includes(direction)) {
      return { ok: false, error: "direction must be pull|push|two_way.", status: 400 };
    }
    if (!["manual", "on_demand", "scheduled"].includes(mode)) {
      return { ok: false, error: "mode must be manual|on_demand|scheduled.", status: 400 };
    }
    if (mode === "scheduled" && !args.cadence) {
      return { ok: false, error: "cadence (cron expression) is required when mode=scheduled.", status: 400 };
    }
    const mapping = (args.mapping as Record<string, unknown>) ?? {};
    if (!mapping || typeof mapping !== "object" || Object.keys(mapping).length === 0) {
      return { ok: false, error: "mapping must be a non-empty object.", status: 400 };
    }

    const obj = await resolveObject(workspaceId, args);
    if (!obj) return { ok: false, error: "Object not found.", status: 404 };

    let integration = null as Awaited<ReturnType<typeof getIntegrationBySlug>>;
    if (typeof args.integrationSlug === "string" && args.integrationSlug) {
      integration = await getIntegrationBySlug(workspaceId, args.integrationSlug);
    } else if (typeof args.integrationId === "string" && args.integrationId) {
      integration = await getIntegrationById(workspaceId, args.integrationId);
    }
    if (!integration) return { ok: false, error: "Integration not found.", status: 404 };

    let recipeId: string | null = null;
    if (typeof args.recipeSlug === "string" && args.recipeSlug) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data } = await supabase
          .from("workspace_integration_recipes")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("integration_id", integration.id)
          .eq("slug", args.recipeSlug)
          .maybeSingle();
        recipeId = data ? String(data.id) : null;
      }
    }

    const label =
      typeof args.label === "string" && args.label.trim().length > 0
        ? args.label.trim()
        : `${obj.name} ← ${integration.label}`;

    const binding = await createBinding({
      workspaceId,
      objectId: obj.id,
      integrationId: integration.id,
      recipeId,
      label,
      direction,
      mode,
      cadence: typeof args.cadence === "string" ? args.cadence : null,
      mapping,
      matchKey: typeof args.matchKey === "string" ? args.matchKey : null,
    });

    return { ok: true, data: publicBinding(binding) };
  },
});

registerTool({
  name: "bindings.update",
  description: "Patch an existing binding (label, mapping, mode, cadence, matchKey, status, direction, recipeId).",
  args: {
    bindingId: { type: "string", required: true },
    label: { type: "string" },
    direction: { type: "string" },
    mode: { type: "string" },
    cadence: { type: "string" },
    mapping: { type: "object" },
    matchKey: { type: "string" },
    status: { type: "string" },
    recipeId: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const bindingId = String(args.bindingId ?? "");
    if (!bindingId) return { ok: false, error: "bindingId is required.", status: 400 };
    const patch: Record<string, unknown> = {};
    if (typeof args.label === "string") patch.label = args.label;
    if (typeof args.direction === "string") patch.direction = args.direction;
    if (typeof args.mode === "string") patch.mode = args.mode;
    if ("cadence" in args) patch.cadence = typeof args.cadence === "string" ? args.cadence : null;
    if (args.mapping && typeof args.mapping === "object") patch.mapping = args.mapping;
    if ("matchKey" in args) patch.matchKey = typeof args.matchKey === "string" ? args.matchKey : null;
    if (typeof args.status === "string") patch.status = args.status;
    if ("recipeId" in args) patch.recipeId = typeof args.recipeId === "string" ? args.recipeId : null;
    const updated = await updateBinding(workspaceId, bindingId, patch);
    if (!updated) return { ok: false, error: "Binding not found.", status: 404 };
    return { ok: true, data: publicBinding(updated) };
  },
});

registerTool({
  name: "bindings.delete",
  description:
    "Delete a binding. Defaults to dryRun:true and returns a confirmToken. Re-issue with dryRun:false and the token to commit.",
  args: {
    bindingId: { type: "string", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const bindingId = String(args.bindingId ?? "");
    const binding = await getBinding(workspaceId, bindingId);
    if (!binding) return { ok: false, error: "Binding not found.", status: 404 };
    const dryRun = args.dryRun !== false;
    if (dryRun) {
      const proposal = {
        action: "bindings.delete",
        bindingId,
        summary: `Delete binding “${binding.label}” (${binding.direction}).`,
        targets: [bindingId],
        diff: [{ id: bindingId, before: publicBinding(binding), after: null }],
        count: 1,
      };
      const token = signProposal(proposal);
      return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
    }
    if (typeof args.confirmToken !== "string" || !verifyProposal(args.confirmToken).ok) {
      return { ok: false, error: "Invalid or expired confirmToken.", status: 400 };
    }
    await deleteBinding(workspaceId, bindingId);
    return { ok: true, data: { bindingId, deleted: true } };
  },
});

/* -------------------------------------------------------------------------- */
/* run_now                                                                     */
/* -------------------------------------------------------------------------- */

type RunReport = {
  direction: BindingDirection;
  fetched: number;
  upserted: number;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
};

async function runPull(
  workspaceId: string,
  binding: Binding,
): Promise<{ ok: boolean; report: RunReport; error?: string }> {
  const integration = await getIntegrationById(workspaceId, binding.integrationId);
  if (!integration) {
    return { ok: false, report: emptyReport("pull"), error: "Integration missing." };
  }
  const adapter = getProviderAdapter(integration.provider);
  if (!adapter) {
    return { ok: false, report: emptyReport("pull"), error: `No adapter for ${integration.provider}.` };
  }
  const secrets = await getIntegrationSecrets(integration.id);

  let method = "GET";
  let path = "/";
  let query: Record<string, string | number | boolean | undefined> | undefined;
  let body: unknown;

  if (binding.recipeId) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("workspace_integration_recipes")
        .select("method, path_template, query_template, body_template")
        .eq("id", binding.recipeId)
        .maybeSingle();
      if (data) {
        method = String(data.method ?? "GET");
        path = String(data.path_template ?? "/");
        query = (data.query_template as Record<string, string | number | boolean | undefined>) ?? undefined;
        body = data.body_template ?? undefined;
      }
    }
  } else {
    const metaPath = typeof binding.mapping.__path === "string" ? (binding.mapping.__path as string) : null;
    const metaMethod = typeof binding.mapping.__method === "string" ? (binding.mapping.__method as string) : null;
    const metaQuery =
      binding.mapping.__query && typeof binding.mapping.__query === "object"
        ? (binding.mapping.__query as Record<string, string | number | boolean | undefined>)
        : undefined;
    if (metaPath) path = metaPath;
    if (metaMethod) method = metaMethod;
    if (metaQuery) query = metaQuery;
  }

  let request;
  try {
    request = adapter.buildRequest({
      secrets,
      config: integration.config,
      method,
      path,
      query,
      body,
    });
  } catch (err) {
    return { ok: false, report: emptyReport("pull"), error: err instanceof Error ? err.message : "Build failed." };
  }

  let response: Response;
  try {
    response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    await logOutboundEvent({
      workspaceId,
      integrationId: integration.id,
      kind: "bindings.run_now",
      targetUrl: request.url,
      ok: false,
      error: msg,
    });
    return { ok: false, report: emptyReport("pull"), error: msg };
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    await logOutboundEvent({
      workspaceId,
      integrationId: integration.id,
      kind: "bindings.run_now",
      targetUrl: request.url,
      responseStatus: response.status,
      responseBody: typeof parsed === "object" ? (parsed as Record<string, unknown>) : null,
      ok: false,
      error: `HTTP ${response.status}`,
    });
    return {
      ok: false,
      report: emptyReport("pull"),
      error: `HTTP ${response.status}`,
    };
  }

  const rows = findCollection(parsed);

  // Strip internal "__" mapping metadata (method/path/query hints) so only
  // real external->local keys remain for the mapper.
  const cleanMapping: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(binding.mapping)) {
    if (k.startsWith("__")) continue;
    cleanMapping[k] = v;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, report: emptyReport("pull"), error: "Supabase admin not configured." };
  }
  const existing = await listWorkspaceRecords(workspaceId, binding.objectId);
  const matchKey = binding.matchKey ?? "id";
  const byMatch = new Map<string, typeof existing[number]>();
  for (const rec of existing) {
    const data = (rec.data as Record<string, unknown>) ?? {};
    const val = data[matchKey];
    if (typeof val === "string" && val) byMatch.set(val, rec);
    else if (typeof val === "number") byMatch.set(String(val), rec);
  }

  const report: RunReport = {
    direction: "pull",
    fetched: rows.length,
    upserted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const mapped = applyMapping(cleanMapping, row);
      const key = mapped[matchKey];
      const keyStr = typeof key === "string" ? key : typeof key === "number" ? String(key) : null;
      const match = keyStr ? byMatch.get(keyStr) : null;
      if (match) {
        const before = (match.data as Record<string, unknown>) ?? {};
        const merged = { ...before, ...mapped };
        if (JSON.stringify(before) !== JSON.stringify(merged)) {
          await supabase.from("records").update({ data: merged }).eq("id", match.id);
          report.updated += 1;
          report.upserted += 1;
        }
      } else {
        await supabase.from("records").insert({
          workspace_id: workspaceId,
          object_id: binding.objectId,
          data: mapped,
        });
        report.created += 1;
        report.upserted += 1;
      }
    } catch (err) {
      report.failed += 1;
      if (report.errors.length < 5) {
        report.errors.push(err instanceof Error ? err.message : "Row failed.");
      }
    }
  }

  await logOutboundEvent({
    workspaceId,
    integrationId: integration.id,
    kind: "bindings.run_now",
    targetUrl: request.url,
    responseStatus: response.status,
    ok: true,
    requestBody: { bindingId: binding.id, matchKey, fetched: rows.length },
  });
  return { ok: true, report };
}

async function runPush(
  workspaceId: string,
  binding: Binding,
): Promise<{ ok: boolean; report: RunReport; error?: string }> {
  const integration = await getIntegrationById(workspaceId, binding.integrationId);
  if (!integration) {
    return { ok: false, report: emptyReport("push"), error: "Integration missing." };
  }
  const adapter = getProviderAdapter(integration.provider);
  if (!adapter) {
    return { ok: false, report: emptyReport("push"), error: `No adapter for ${integration.provider}.` };
  }
  const secrets = await getIntegrationSecrets(integration.id);

  // For pushes, treat the mapping as `{ localKey: externalKey }` — reverse of pull.
  const reverseMapping: Record<string, string> = {};
  for (const [src, destRaw] of Object.entries(binding.mapping)) {
    if (src.startsWith("__")) continue;
    if (typeof destRaw !== "string" || !destRaw) continue;
    reverseMapping[destRaw] = src;
  }

  const metaPath = typeof binding.mapping.__path === "string" ? (binding.mapping.__path as string) : "/";
  const metaMethod = typeof binding.mapping.__method === "string" ? (binding.mapping.__method as string) : "POST";

  const records = await listWorkspaceRecords(workspaceId, binding.objectId);
  const report: RunReport = {
    direction: "push",
    fetched: records.length,
    upserted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const rec of records) {
    const data = (rec.data as Record<string, unknown>) ?? {};
    const external: Record<string, unknown> = {};
    for (const [localKey, externalKey] of Object.entries(reverseMapping)) {
      if (data[localKey] !== undefined) external[externalKey] = data[localKey];
    }
    if (Object.keys(external).length === 0) continue;
    try {
      const req = adapter.buildRequest({
        secrets,
        config: integration.config,
        method: metaMethod,
        path: metaPath,
        body: external,
      });
      const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
      if (resp.ok) report.upserted += 1;
      else {
        report.failed += 1;
        if (report.errors.length < 5) report.errors.push(`HTTP ${resp.status} on ${rec.id}`);
      }
    } catch (err) {
      report.failed += 1;
      if (report.errors.length < 5) report.errors.push(err instanceof Error ? err.message : "Push failed");
    }
  }

  await logOutboundEvent({
    workspaceId,
    integrationId: integration.id,
    kind: "bindings.run_now",
    targetUrl: `${integration.provider}:${metaPath}`,
    ok: report.failed === 0,
    requestBody: { bindingId: binding.id, attempted: records.length },
  });
  return { ok: report.failed === 0, report };
}

function emptyReport(direction: BindingDirection): RunReport {
  return { direction, fetched: 0, upserted: 0, created: 0, updated: 0, failed: 0, errors: [] };
}

registerTool({
  name: "bindings.run_now",
  description:
    "Execute a binding immediately. Pull bindings fetch the integration and upsert mapped rows into the bound object's records. Push bindings read records and post to the integration. For push/two_way bindings, defaults to dryRun:true and returns a confirmToken; re-issue with dryRun:false and the token to commit.",
  args: {
    bindingId: { type: "string", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const bindingId = String(args.bindingId ?? "");
    const binding = await getBinding(workspaceId, bindingId);
    if (!binding) return { ok: false, error: "Binding not found.", status: 404 };

    const needsConfirm = binding.direction === "push" || binding.direction === "two_way";
    const dryRun = args.dryRun !== false;

    if (needsConfirm && dryRun) {
      const proposal = {
        action: "bindings.run_now",
        bindingId,
        summary: `Run binding “${binding.label}” (${binding.direction}).`,
        targets: [bindingId],
        count: 1,
      };
      const token = signProposal(proposal);
      return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
    }
    if (needsConfirm && !dryRun) {
      if (typeof args.confirmToken !== "string" || !verifyProposal(args.confirmToken).ok) {
        return { ok: false, error: "Invalid or expired confirmToken.", status: 400 };
      }
    }

    let outcome: { ok: boolean; report: RunReport; error?: string };
    if (binding.direction === "pull") {
      outcome = await runPull(workspaceId, binding);
    } else if (binding.direction === "push") {
      outcome = await runPush(workspaceId, binding);
    } else {
      const pull = await runPull(workspaceId, binding);
      const push = await runPush(workspaceId, binding);
      outcome = {
        ok: pull.ok && push.ok,
        report: {
          direction: "two_way",
          fetched: pull.report.fetched + push.report.fetched,
          upserted: pull.report.upserted + push.report.upserted,
          created: pull.report.created,
          updated: pull.report.updated,
          failed: pull.report.failed + push.report.failed,
          errors: [...pull.report.errors, ...push.report.errors].slice(0, 5),
        },
        error: pull.error ?? push.error,
      };
    }

    await markBindingRun(binding.id, outcome.ok ? "ok" : "error", outcome.error ?? null);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error ?? "Run failed.", status: 502, details: outcome.report };
    }
    return { ok: true, data: { bindingId, ...outcome.report } };
  },
});
