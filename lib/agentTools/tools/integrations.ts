/**
 * Agent tools for dynamic 3rd-party integrations.
 *
 *   integrations.list       -> list available integrations (no secrets)
 *   integrations.call       -> authenticated HTTP call against a stored integration
 *   integrations.sync_leads -> pull leads from Close/HubSpot and upsert into CRM
 *
 * Tool responses never include secret material. Errors from the remote API
 * flow through as status + error text only.
 */

import { registerTool, type ToolContext } from "../registry";
import { fetchInternalJson } from "../executor";
import {
  createIntegration,
  getIntegrationBySlug,
  getIntegrationSecrets,
  listIntegrations,
  logOutboundEvent,
} from "@/lib/integrations/store";
import { getProviderAdapter } from "@/lib/integrations/registry";
import { signProposal, verifyProposal } from "../confirmToken";
import {
  applyMapping,
  createBinding,
  findCollection,
} from "@/lib/integrations/bindings";
import { listWorkspaceObjects, listWorkspaceRecords } from "@/lib/workspaceStore";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

registerTool({
  name: "integrations.list",
  description: "List 3rd-party integrations configured for this workspace (no secrets returned).",
  args: {},
  handler: async (_args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const rows = await listIntegrations(workspaceId);
    return {
      ok: true,
      data: rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        provider: r.provider,
        authType: r.authType,
        status: r.status,
        hasSecrets: r.hasSecrets,
        config: r.config,
      })),
    };
  },
});

/**
 * Summarize an unknown JSON body so the agent can decide what to do next
 * without us shipping megabytes back through the tool envelope.
 */
function summarizeResponseShape(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) return { kind: "empty" };
  if (typeof data === "string") {
    return { kind: "text", length: data.length, preview: data.slice(0, 400) };
  }
  if (typeof data !== "object") {
    return { kind: typeof data, value: data };
  }
  if (Array.isArray(data)) {
    const sample = data[0];
    return {
      kind: "array",
      length: data.length,
      sampleKeys:
        sample && typeof sample === "object" && !Array.isArray(sample)
          ? Object.keys(sample as Record<string, unknown>).slice(0, 20)
          : [],
      sample: sample ?? null,
    };
  }
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  // Detect common envelope shapes: { data: [...] }, { results: [...] }, { items: [...] }
  const collectionKey = ["data", "results", "items", "records", "objects"].find((k) => Array.isArray(obj[k]));
  if (collectionKey) {
    const arr = obj[collectionKey] as unknown[];
    const sample = arr[0];
    return {
      kind: "envelope",
      topKeys: keys,
      collectionKey,
      length: arr.length,
      sampleKeys:
        sample && typeof sample === "object" && !Array.isArray(sample)
          ? Object.keys(sample as Record<string, unknown>).slice(0, 20)
          : [],
      sample: sample ?? null,
    };
  }
  return { kind: "object", topKeys: keys.slice(0, 20) };
}

registerTool({
  name: "integrations.probe",
  description:
    "Probe a configured integration by hitting a path. Returns HTTP status, response shape summary, top-level keys, and a truncated sample. Use BEFORE saving a recipe so you understand the vendor's response shape. Credentials are injected server-side.",
  args: {
    slug: { type: "string", required: true, description: "Integration slug from integrations.list" },
    method: { type: "string", description: "GET (default) | POST | PUT | PATCH | DELETE" },
    path: { type: "string", required: true, description: "Path on the provider's API (e.g. /lead/ or /crm/v3/objects/contacts)" },
    query: { type: "object", description: "Query string parameters" },
    body: { type: "object", description: "Request JSON body" },
    headers: { type: "object", description: "Optional extra headers" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const slug = String(args.slug ?? "").trim();
    const method = String(args.method ?? "GET").toUpperCase();
    const path = String(args.path ?? "").trim();
    if (!slug || !path) return { ok: false, error: "slug and path are required.", status: 400 };
    const integration = await getIntegrationBySlug(workspaceId, slug);
    if (!integration) return { ok: false, error: `Integration '${slug}' not found.`, status: 404 };
    const adapter = getProviderAdapter(integration.provider);
    if (!adapter) return { ok: false, error: `No adapter for provider ${integration.provider}.`, status: 400 };
    const secrets = await getIntegrationSecrets(integration.id);
    let built;
    try {
      built = adapter.buildRequest({
        secrets,
        config: integration.config,
        method,
        path,
        query: args.query as Record<string, string | number | boolean | undefined> | undefined,
        body: args.body,
        headers: args.headers as Record<string, string> | undefined,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Bad request", status: 400 };
    }
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Network error";
      await logOutboundEvent({
        workspaceId,
        integrationId: integration.id,
        kind: "integrations.probe",
        targetUrl: built.url,
        requestBody: args.body ?? null,
        ok: false,
        error: errorMessage,
      });
      return { ok: false, error: errorMessage, status: 502 };
    }
    const latencyMs = Date.now() - startedAt;
    const text = await response.text();
    let parsed: unknown = null;
    let contentType = response.headers.get("content-type") ?? "";
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text.slice(0, 2000);
    }
    const shape = summarizeResponseShape(parsed);
    await logOutboundEvent({
      workspaceId,
      integrationId: integration.id,
      kind: "integrations.probe",
      targetUrl: built.url,
      requestBody: args.body ?? null,
      responseStatus: response.status,
      responseBody: response.ok ? null : (typeof parsed === "object" ? parsed : { preview: String(parsed).slice(0, 500) }),
      ok: response.ok,
      error: response.ok ? null : `HTTP ${response.status}`,
    });
    return {
      ok: response.ok,
      data: {
        ok: response.ok,
        status: response.status,
        contentType,
        latencyMs,
        method: built.method,
        url: built.url,
        shape,
        // Truncated raw sample so the agent can write a recipe template.
        sample: typeof parsed === "string" ? parsed.slice(0, 400) : parsed,
      },
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    } as unknown as import("../registry").ToolResult;
  },
});

registerTool({
  name: "integrations.call",
  description:
    "Make an authenticated HTTP call to a configured integration's API. Credentials are injected server-side; never include them in args.",
  args: {
    slug: { type: "string", required: true, description: "Integration slug from integrations.list" },
    method: { type: "string", description: "GET (default) | POST | PUT | PATCH | DELETE" },
    path: { type: "string", required: true, description: "Path on the provider's API (e.g. /lead/)" },
    query: { type: "object", description: "Query string parameters" },
    body: { type: "object", description: "Request JSON body" },
    headers: { type: "object", description: "Optional extra headers (auth is added automatically)" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const slug = String(args.slug ?? "").trim();
    const method = String(args.method ?? "GET").toUpperCase();
    const path = String(args.path ?? "").trim();
    if (!slug || !path) return { ok: false, error: "slug and path are required.", status: 400 };
    const integration = await getIntegrationBySlug(workspaceId, slug);
    if (!integration) return { ok: false, error: `Integration '${slug}' not found.`, status: 404 };
    if (integration.status !== "active") {
      return { ok: false, error: `Integration '${slug}' is ${integration.status}.`, status: 400 };
    }
    const adapter = getProviderAdapter(integration.provider);
    if (!adapter) return { ok: false, error: `No adapter for provider ${integration.provider}.`, status: 400 };
    const secrets = await getIntegrationSecrets(integration.id);
    let built;
    try {
      built = adapter.buildRequest({
        secrets,
        config: integration.config,
        method,
        path,
        query: args.query as Record<string, string | number | boolean | undefined> | undefined,
        body: args.body,
        headers: args.headers as Record<string, string> | undefined,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Bad request", status: 400 };
    }
    let response: Response;
    try {
      response = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Network error";
      await logOutboundEvent({
        workspaceId,
        integrationId: integration.id,
        kind: "integrations.call",
        targetUrl: built.url,
        requestBody: args.body ?? null,
        ok: false,
        error: errorMessage,
      });
      return { ok: false, error: errorMessage, status: 502 };
    }
    let data: unknown = null;
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text.slice(0, 2000);
    }
    await logOutboundEvent({
      workspaceId,
      integrationId: integration.id,
      kind: "integrations.call",
      targetUrl: built.url,
      requestBody: args.body ?? null,
      responseStatus: response.status,
      responseBody: response.ok ? null : (typeof data === "object" ? data : { preview: String(data).slice(0, 500) }),
      ok: response.ok,
      error: response.ok ? null : `HTTP ${response.status}`,
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, status: response.status, details: data };
    }
    return { ok: true, data: { status: response.status, data } };
  },
});

/**
 * High-level "pull leads from {provider}" helper. Thin wrapper kept for
 * back-compat: new importers should be expressed as bindings
 * (bindings.create + bindings.run_now), which works for any provider whose
 * response shape the agent knows via integrations.probe — no new tool code
 * required. This handler keeps hardcoded mappings for `close` and `hubspot`
 * so existing skills/docs keep working.
 */
registerTool<Record<string, unknown>, Record<string, unknown>>({
  name: "integrations.sync_leads",
  description:
    "Pull leads from a configured integration (Close, HubSpot) and upsert them into the CRM as people. For any other provider — or any other target object — prefer `bindings.create` + `bindings.run_now` with a JSON mapping; it works without custom tool code.",
  args: {
    slug: { type: "string", required: true },
    limit: { type: "number", description: "Max rows to pull (default 25)" },
    since: { type: "string", description: "ISO date; only fetch leads updated after this" },
    stage: { type: "string", description: "CRM stage to assign (default lead)" },
    source: { type: "string", description: "CRM source label (defaults to provider slug)" },
    dryRun: { type: "boolean" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const slug = String(args.slug ?? "").trim();
    const limit = typeof args.limit === "number" && args.limit > 0 ? Math.min(args.limit, 100) : 25;
    const dryRun = args.dryRun === true;
    const stage = typeof args.stage === "string" && args.stage ? args.stage : "lead";
    const integration = await getIntegrationBySlug(workspaceId, slug);
    if (!integration) return { ok: false, error: `Integration '${slug}' not found.`, status: 404 };
    const adapter = getProviderAdapter(integration.provider);
    if (!adapter) return { ok: false, error: `No adapter for ${integration.provider}.`, status: 400 };
    const secrets = await getIntegrationSecrets(integration.id);

    let mapped: Array<{ fullName: string; email?: string; phone?: string; source: string; stage: string }> = [];
    const sourceLabel = typeof args.source === "string" && args.source ? args.source : integration.provider;

    if (integration.provider === "close") {
      const req = adapter.buildRequest({
        secrets,
        config: integration.config,
        method: "GET",
        path: "/lead/",
        query: { _limit: limit },
      });
      const resp = await fetch(req.url, { method: req.method, headers: req.headers });
      if (!resp.ok) return { ok: false, error: `Close API error ${resp.status}`, status: resp.status };
      const json = (await resp.json()) as { data?: Array<Record<string, unknown>> };
      for (const lead of json.data ?? []) {
        const contacts = Array.isArray(lead.contacts) ? (lead.contacts as Array<Record<string, unknown>>) : [];
        const displayName = typeof lead.display_name === "string" ? lead.display_name : typeof lead.name === "string" ? lead.name : "";
        for (const contact of contacts) {
          const name = typeof contact.name === "string" && contact.name ? contact.name : displayName || "Unknown";
          const emails = Array.isArray(contact.emails) ? (contact.emails as Array<Record<string, unknown>>) : [];
          const phones = Array.isArray(contact.phones) ? (contact.phones as Array<Record<string, unknown>>) : [];
          const email = emails[0] && typeof emails[0].email === "string" ? String(emails[0].email) : undefined;
          const phone = phones[0] && typeof phones[0].phone === "string" ? String(phones[0].phone) : undefined;
          mapped.push({ fullName: name, email, phone, source: sourceLabel, stage });
        }
        if (contacts.length === 0 && displayName) {
          mapped.push({ fullName: displayName, source: sourceLabel, stage });
        }
      }
    } else if (integration.provider === "hubspot") {
      const req = adapter.buildRequest({
        secrets,
        config: integration.config,
        method: "GET",
        path: "/crm/v3/objects/contacts",
        query: { limit, properties: "firstname,lastname,email,phone" },
      });
      const resp = await fetch(req.url, { method: req.method, headers: req.headers });
      if (!resp.ok) return { ok: false, error: `HubSpot API error ${resp.status}`, status: resp.status };
      const json = (await resp.json()) as { results?: Array<{ properties?: Record<string, string> }> };
      for (const row of json.results ?? []) {
        const p = row.properties ?? {};
        const fullName = `${p.firstname ?? ""} ${p.lastname ?? ""}`.trim() || p.email || "Unknown";
        mapped.push({ fullName, email: p.email, phone: p.phone, source: sourceLabel, stage });
      }
    } else {
      return { ok: false, error: `sync_leads does not yet support provider ${integration.provider}.`, status: 400 };
    }

    if (dryRun) {
      return { ok: true, data: { previewCount: mapped.length, preview: mapped.slice(0, 10) } };
    }

    let upserted = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const lead of mapped) {
      const res = await fetchInternalJson(
        ctx,
        `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/crm/people`,
        { method: "POST", body: JSON.stringify(lead) },
      );
      if (res.ok) upserted += 1;
      else {
        failed += 1;
        if (errors.length < 5) errors.push(res.error ?? `HTTP ${res.status}`);
      }
    }
    return {
      ok: true,
      data: { fetched: mapped.length, upserted, failed, errors: errors.slice(0, 5) },
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Generic "import into object" — replacement for per-provider sync code.     */
/* -------------------------------------------------------------------------- */

registerTool({
  name: "integrations.import_to_object",
  description:
    "Generic importer: fetch a path on a configured integration, map each row with the provided JSON mapping, and upsert into the target workspace object's records. Works for any provider (Close, HubSpot, Vercel, generic_http, custom_api) because mapping + matchKey live on the binding row, not in tool code. Call `integrations.probe` first to understand the shape, then pass the mapping here. If `persistAsBinding:true`, a binding row is created so the same import can be scheduled or re-run from the UI.",
  args: {
    integrationSlug: { type: "string", required: true },
    objectSlug: { type: "string", description: "Workspace object slug (preferred)." },
    objectId: { type: "string" },
    method: { type: "string", description: "GET (default)" },
    path: { type: "string", required: true },
    query: { type: "object" },
    mapping: { type: "object", required: true, description: "{ externalPath: localKey } map." },
    matchKey: { type: "string", description: "Local field key used to dedupe (e.g. `email`, `slug`, `external_id`)." },
    persistAsBinding: { type: "boolean", description: "If true, save the import as a binding so it can be rerun/scheduled." },
    label: { type: "string" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const integrationSlug = String(args.integrationSlug ?? "").trim();
    const path = String(args.path ?? "").trim();
    if (!integrationSlug || !path) return { ok: false, error: "integrationSlug and path are required.", status: 400 };

    const integration = await getIntegrationBySlug(workspaceId, integrationSlug);
    if (!integration) return { ok: false, error: `Integration '${integrationSlug}' not found.`, status: 404 };
    const adapter = getProviderAdapter(integration.provider);
    if (!adapter) return { ok: false, error: `No adapter for ${integration.provider}.`, status: 400 };

    const objects = await listWorkspaceObjects(workspaceId);
    const target =
      (typeof args.objectId === "string" && objects.find((o) => o.id === args.objectId)) ||
      (typeof args.objectSlug === "string" && objects.find((o) => o.slug === args.objectSlug)) ||
      null;
    if (!target) return { ok: false, error: "Target object not found.", status: 404 };

    const mapping = (args.mapping as Record<string, unknown>) ?? {};
    if (Object.keys(mapping).length === 0) {
      return { ok: false, error: "mapping must contain at least one externalPath->localKey entry.", status: 400 };
    }

    const secrets = await getIntegrationSecrets(integration.id);
    const request = adapter.buildRequest({
      secrets,
      config: integration.config,
      method: String(args.method ?? "GET"),
      path,
      query: args.query as Record<string, string | number | boolean | undefined> | undefined,
    });

    let response: Response;
    try {
      response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      await logOutboundEvent({
        workspaceId,
        integrationId: integration.id,
        kind: "integrations.import_to_object",
        targetUrl: request.url,
        ok: false,
        error: msg,
      });
      return { ok: false, error: msg, status: 502 };
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
        kind: "integrations.import_to_object",
        targetUrl: request.url,
        responseStatus: response.status,
        ok: false,
        error: `HTTP ${response.status}`,
      });
      return { ok: false, error: `HTTP ${response.status}`, status: response.status, details: parsed };
    }

    const rows = findCollection(parsed);
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin not configured.", status: 500 };

    const matchKey = typeof args.matchKey === "string" && args.matchKey ? args.matchKey : null;
    const existing = matchKey ? await listWorkspaceRecords(workspaceId, target.id) : [];
    const byMatch = new Map<string, (typeof existing)[number]>();
    if (matchKey) {
      for (const rec of existing) {
        const data = (rec.data as Record<string, unknown>) ?? {};
        const val = data[matchKey];
        if (typeof val === "string" && val) byMatch.set(val, rec);
        else if (typeof val === "number") byMatch.set(String(val), rec);
      }
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const mapped = applyMapping(mapping, row);
        if (Object.keys(mapped).length === 0) continue;
        const keyVal = matchKey ? mapped[matchKey] : null;
        const keyStr = typeof keyVal === "string" ? keyVal : typeof keyVal === "number" ? String(keyVal) : null;
        const match = keyStr ? byMatch.get(keyStr) : null;
        if (match) {
          const before = (match.data as Record<string, unknown>) ?? {};
          const merged = { ...before, ...mapped };
          if (JSON.stringify(before) !== JSON.stringify(merged)) {
            await supabase.from("records").update({ data: merged }).eq("id", match.id);
            updated += 1;
          }
        } else {
          await supabase.from("records").insert({
            workspace_id: workspaceId,
            object_id: target.id,
            data: mapped,
          });
          created += 1;
        }
      } catch (err) {
        failed += 1;
        if (errors.length < 5) errors.push(err instanceof Error ? err.message : "Row failed");
      }
    }

    let bindingId: string | null = null;
    if (args.persistAsBinding === true) {
      try {
        const label =
          typeof args.label === "string" && args.label.trim()
            ? args.label.trim()
            : `${target.name} ← ${integration.label}`;
        const mappingWithMeta: Record<string, unknown> = {
          ...mapping,
          __method: String(args.method ?? "GET"),
          __path: path,
        };
        if (args.query && typeof args.query === "object") mappingWithMeta.__query = args.query;
        const b = await createBinding({
          workspaceId,
          objectId: target.id,
          integrationId: integration.id,
          label,
          direction: "pull",
          mode: "on_demand",
          mapping: mappingWithMeta,
          matchKey,
        });
        bindingId = b.id;
      } catch {
        bindingId = null;
      }
    }

    await logOutboundEvent({
      workspaceId,
      integrationId: integration.id,
      kind: "integrations.import_to_object",
      targetUrl: request.url,
      responseStatus: response.status,
      ok: true,
      requestBody: { objectId: target.id, matchKey, created, updated, failed },
    });

    return {
      ok: true,
      data: {
        objectId: target.id,
        objectSlug: target.slug,
        fetched: rows.length,
        created,
        updated,
        failed,
        errors,
        bindingId,
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/* MCP onboarding from chat                                                    */
/* -------------------------------------------------------------------------- */

registerTool({
  name: "integrations.connect_mcp",
  description:
    "Register an MCP (Model Context Protocol) server in this workspace so Hermes picks it up on the next bootstrap. Defaults to dryRun:true and returns a confirmToken — re-issue with dryRun:false and the token to commit. Once active, the server's tools are listed by the /agents/:id/mcp-config endpoint Hermes fetches at bootstrap. See https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp.",
  args: {
    name: { type: "string", required: true, description: "Human label, e.g. 'close-mcp'." },
    url: { type: "string", required: true, description: "Full https URL of the MCP server." },
    bearer: { type: "string", description: "Optional bearer token stored as the 'bearer' secret." },
    authHeader: { type: "string", description: "Override for the Authorization header name." },
    extraHeaders: { type: "object", description: "Optional static headers forwarded by the MCP config." },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const name = String(args.name ?? "").trim();
    const url = String(args.url ?? "").trim();
    if (!name || !url) return { ok: false, error: "name and url are required.", status: 400 };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        return { ok: false, error: "MCP url must use https.", status: 400 };
      }
    } catch {
      return { ok: false, error: "Invalid url.", status: 400 };
    }

    const dryRun = args.dryRun !== false;
    const config: Record<string, unknown> = { url };
    if (typeof args.authHeader === "string" && args.authHeader) config.authHeader = args.authHeader;
    if (args.extraHeaders && typeof args.extraHeaders === "object") config.extraHeaders = args.extraHeaders;

    if (dryRun) {
      const proposal = {
        action: "integrations.connect_mcp",
        summary: `Connect MCP server “${name}” at ${url}. Active after next agent bootstrap.`,
        targets: [],
        count: 1,
        diff: [{ id: null, before: null, after: { name, url, hasBearer: typeof args.bearer === "string" && args.bearer.length > 0 } }],
      };
      const token = signProposal(proposal);
      return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
    }
    if (typeof args.confirmToken !== "string" || !verifyProposal(args.confirmToken).ok) {
      return { ok: false, error: "Invalid or expired confirmToken.", status: 400 };
    }

    const secrets: Record<string, string> = {};
    if (typeof args.bearer === "string" && args.bearer) secrets.bearer = args.bearer;

    const integration = await createIntegration({
      workspaceId,
      slug: name,
      label: name,
      provider: "generic_http",
      authType: "mcp",
      config,
      secrets,
    });

    // Nudge the agent-bootstrap endpoint. We do this best-effort — the MCP
    // block is re-read on the agent's next turn even if this fetch fails,
    // but triggering the admin route refreshes knowledge_scope immediately
    // when the caller has access.
    let refreshed = false;
    try {
      const res = await fetchInternalJson(ctx, `/api/admin/workspaces/${workspaceId}/bootstrap-agent`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      refreshed = res.ok;
    } catch {
      refreshed = false;
    }

    return {
      ok: true,
      data: {
        integrationId: integration.id,
        slug: integration.slug,
        url,
        refreshed,
      },
    };
  },
});
