/**
 * CMS sync tools. First (and so far only) target is gb-automotriz-web which
 * exposes:
 *   GET  {baseUrl}/api/inventory        (public)
 *   POST {baseUrl}/api/inventory/upsert (HMAC-signed, operator-only)
 *
 * Credentials (baseUrl + sharedSecret) live in the integrations vault under
 * provider=gb_automotriz_cms.
 */

import { registerTool, type ToolContext, type ToolResult } from "../registry";
import {
  getIntegrationBySlug,
  getIntegrationSecrets,
  logOutboundEvent,
} from "@/lib/integrations/store";
import { getProviderAdapter } from "@/lib/integrations/registry";
import { validateVehicle, type Vehicle } from "@/lib/integrations/providers/gbAutomotrizCms";
import { signProposal, verifyProposal } from "../confirmToken";
import { generateUniqueObjectSlug } from "@/lib/objectSlug";
import { listWorkspaceFields, listWorkspaceObjects, listWorkspaceRecords } from "@/lib/workspaceStore";

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
  name: "cms.list_inventory",
  description: "Fetch the current vehicle inventory published on the external site (via a gb_automotriz_cms integration slug).",
  args: {
    slug: { type: "string", required: true, description: "Integration slug" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const slug = String(args.slug ?? "").trim();
    const integration = await getIntegrationBySlug(workspaceId, slug);
    if (!integration) return { ok: false, error: `Integration '${slug}' not found.`, status: 404 };
    if (integration.provider !== "gb_automotriz_cms") {
      return { ok: false, error: "Integration is not a gb_automotriz_cms integration.", status: 400 };
    }
    const adapter = getProviderAdapter("gb_automotriz_cms");
    if (!adapter) return { ok: false, error: "Adapter missing.", status: 500 };
    const secrets = await getIntegrationSecrets(integration.id);
    const req = adapter.buildRequest({
      secrets,
      config: integration.config,
      method: "GET",
      path: "/api/inventory",
    });
    try {
      const resp = await fetch(req.url, { method: req.method, headers: req.headers });
      const text = await resp.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text.slice(0, 500);
      }
      if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}`, status: resp.status, details: data };
      }
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Fetch failed.", status: 502 };
    }
  },
});

type PushArgs = {
  slug?: string;
  op?: "upsert" | "delete";
  vehicles?: unknown;
  recordIds?: unknown;
  slugs?: unknown;
  all?: boolean;
  dryRun?: boolean;
  confirmToken?: string;
};

/**
 * Map a workspace record's `data` JSON to the external Vehicle shape expected
 * by gb-automotriz-web. Only the fields the site accepts are copied — extra
 * workspace-only fields are dropped so the push stays faithful to the contract.
 */
function recordToVehicle(data: Record<string, unknown>): Vehicle | null {
  const d = data ?? {};
  const slug = typeof d.slug === "string" ? d.slug.trim() : "";
  const brand = typeof d.brand === "string" ? d.brand.trim() : "";
  const model = typeof d.model === "string" ? d.model.trim() : "";
  const price = typeof d.price === "string" ? d.price.trim() : "";
  const yearRaw = d.year;
  const year = typeof yearRaw === "number" ? yearRaw : Number.isFinite(Number(yearRaw)) ? Number(yearRaw) : NaN;
  if (!slug || !brand || !model || !price || !Number.isFinite(year)) return null;

  const out: Vehicle = { slug, brand, model, year, price };
  if (typeof d.image === "string" && d.image) out.image = d.image;
  if (typeof d.location === "string" && d.location) out.location = d.location;
  if (typeof d.description === "string" && d.description) out.description = d.description;
  if (Array.isArray(d.features)) {
    out.features = (d.features as unknown[]).filter((f): f is string => typeof f === "string");
  }
  if (d.specs && typeof d.specs === "object" && !Array.isArray(d.specs)) {
    const specs: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.specs as Record<string, unknown>)) {
      if (typeof v === "string") specs[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") specs[k] = String(v);
    }
    out.specs = specs;
  }
  if (d.status === "available" || d.status === "sold" || d.status === "reserved") {
    out.status = d.status;
  }
  return out;
}

/**
 * Resolve the set of Vehicles to push from workspace records. Used when the
 * caller passes `recordIds`, `slugs`, or `all:true` instead of a free-form
 * `vehicles[]` array. Keeps "records are source of truth" invariant.
 */
async function resolveVehiclesFromRecords(
  workspaceId: string,
  filter: { recordIds?: string[]; slugs?: string[]; all?: boolean },
): Promise<{ vehicles: Vehicle[]; skipped: Array<{ recordId?: string; slug?: string; reason: string }> }> {
  const objects = await listWorkspaceObjects(workspaceId);
  const vehiclesObj = objects.find((o) => o.slug === "vehicles" || (o as { kind?: string }).kind === "vehicle");
  if (!vehiclesObj) return { vehicles: [], skipped: [{ reason: "No vehicles object found. Run cms.bootstrap_vehicles first." }] };

  const all = await listWorkspaceRecords(workspaceId, vehiclesObj.id);
  const wantIds = Array.isArray(filter.recordIds) ? new Set(filter.recordIds) : null;
  const wantSlugs = Array.isArray(filter.slugs) ? new Set(filter.slugs) : null;

  const vehicles: Vehicle[] = [];
  const skipped: Array<{ recordId?: string; slug?: string; reason: string }> = [];
  for (const rec of all) {
    const data = (rec.data as Record<string, unknown>) ?? {};
    const slug = typeof data.slug === "string" ? data.slug : "";
    if (filter.all !== true) {
      const idMatch = wantIds && wantIds.has(rec.id);
      const slugMatch = wantSlugs && slug && wantSlugs.has(slug);
      if (!idMatch && !slugMatch) continue;
    }
    const vehicle = recordToVehicle(data);
    if (vehicle) vehicles.push(vehicle);
    else skipped.push({ recordId: rec.id, slug: slug || undefined, reason: "Record missing required fields (slug/brand/model/year/price)" });
  }
  return { vehicles, skipped };
}

registerTool({
  name: "cms.push_inventory",
  description:
    "Upsert or delete vehicles on the external gb-automotriz site. Prefer passing `recordIds`, `slugs`, or `all:true` to serialize from workspace `vehicles` records (source of truth); `vehicles[]` stays for ad-hoc pushes. Defaults to dryRun:true — returns a proposal and a confirmToken. Re-issue with dryRun:false and the confirmToken to commit (HMAC-signed server-side).",
  args: {
    slug: { type: "string", required: true, description: "Integration slug" },
    op: { type: "string", description: "upsert (default) | delete" },
    vehicles: { type: "array", description: "Array of Vehicle objects (slug, brand, model, year, price required). Mutually exclusive with recordIds/slugs/all." },
    recordIds: { type: "array", description: "Workspace record ids (in the vehicles object) to serialize and push." },
    slugs: { type: "array", description: "Vehicle slugs (from records.data.slug) to push." },
    all: { type: "boolean", description: "If true, push every record in the workspace vehicles object." },
    dryRun: { type: "boolean", description: "If true (default), return a proposal with confirmToken instead of pushing." },
    confirmToken: { type: "string", description: "Token from the prior dryRun proposal; required to commit." },
  },
  handler: async (args: PushArgs, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const slug = String(args.slug ?? "").trim();
    const op = args.op === "delete" ? "delete" : "upsert";

    const hasRecordRefs =
      (Array.isArray(args.recordIds) && args.recordIds.length > 0) ||
      (Array.isArray(args.slugs) && args.slugs.length > 0) ||
      args.all === true;
    const hasInlineVehicles = Array.isArray(args.vehicles) && args.vehicles.length > 0;
    if (!hasRecordRefs && !hasInlineVehicles) {
      return { ok: false, error: "Provide `recordIds`, `slugs`, `all:true`, or `vehicles[]`.", status: 400 };
    }

    const valid: Vehicle[] = [];
    const invalid: Array<{ index?: number; recordId?: string; slug?: string; reason: string }> = [];

    if (hasRecordRefs) {
      const recordIds = Array.isArray(args.recordIds)
        ? (args.recordIds as unknown[]).filter((v): v is string => typeof v === "string")
        : undefined;
      const slugs = Array.isArray(args.slugs)
        ? (args.slugs as unknown[]).filter((v): v is string => typeof v === "string")
        : undefined;
      const resolved = await resolveVehiclesFromRecords(workspaceId, {
        recordIds,
        slugs,
        all: args.all === true,
      });
      valid.push(...resolved.vehicles);
      invalid.push(...resolved.skipped);
    } else {
      const vehiclesIn = Array.isArray(args.vehicles) ? args.vehicles : [];
      vehiclesIn.forEach((entry, index) => {
        if (validateVehicle(entry)) valid.push(entry);
        else invalid.push({ index, reason: "Missing required fields (slug, brand, model, year, price)" });
      });
    }
    if (valid.length === 0) return { ok: false, error: "No valid vehicles.", status: 400, details: invalid };

    const dryRun = args.dryRun !== false;
    if (dryRun) {
      const proposal = {
        action: "cms.push_inventory",
        integrationSlug: slug,
        op,
        targets: valid.map((v) => v.slug),
        diff: valid.map((v) => ({ slug: v.slug, after: op === "delete" ? null : v })),
        summary:
          op === "delete"
            ? `Delete ${valid.length} vehicle${valid.length === 1 ? "" : "s"} from '${slug}'.`
            : `Upsert ${valid.length} vehicle${valid.length === 1 ? "" : "s"} to '${slug}'.`,
        count: valid.length,
        skipped: invalid,
      };
      const token = signProposal(proposal);
      return {
        ok: true,
        data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true },
      };
    }

    const commitProposal = {
      action: "cms.push_inventory",
      integrationSlug: slug,
      op,
      targets: valid.map((v) => v.slug),
      diff: valid.map((v) => ({ slug: v.slug, after: op === "delete" ? null : v })),
      summary:
        op === "delete"
          ? `Delete ${valid.length} vehicle${valid.length === 1 ? "" : "s"} from '${slug}'.`
          : `Upsert ${valid.length} vehicle${valid.length === 1 ? "" : "s"} to '${slug}'.`,
      count: valid.length,
      skipped: invalid,
    };
    const verification = verifyProposal(args.confirmToken, commitProposal);
    if (!verification.ok) {
      return {
        ok: false,
        error: `Confirmation token invalid (${verification.reason}). Re-run with dryRun:true to get a fresh token.`,
        status: 409,
      };
    }

    const integration = await getIntegrationBySlug(workspaceId, slug);
    if (!integration) return { ok: false, error: `Integration '${slug}' not found.`, status: 404 };
    if (integration.provider !== "gb_automotriz_cms") {
      return { ok: false, error: "Integration is not a gb_automotriz_cms integration.", status: 400 };
    }
    const adapter = getProviderAdapter("gb_automotriz_cms");
    if (!adapter) return { ok: false, error: "Adapter missing.", status: 500 };
    const secrets = await getIntegrationSecrets(integration.id);
    const body = { op, vehicles: valid };
    const req = adapter.buildRequest({
      secrets,
      config: integration.config,
      method: "POST",
      path: "/api/inventory/upsert",
      body,
    });

    let lastError: string | null = null;
    let lastStatus = 0;
    let lastData: unknown = null;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
        lastStatus = resp.status;
        const text = await resp.text();
        try {
          lastData = text ? JSON.parse(text) : null;
        } catch {
          lastData = text.slice(0, 500);
        }
        if (resp.ok) {
          await logOutboundEvent({
            workspaceId,
            integrationId: integration.id,
            kind: "cms.push_inventory",
            targetUrl: req.url,
            requestBody: { op, count: valid.length },
            responseStatus: resp.status,
            responseBody: typeof lastData === "object" ? (lastData as Record<string, unknown>) : null,
            ok: true,
          });
          return {
            ok: true,
            data: {
              attempts: attempt,
              status: resp.status,
              count: valid.length,
              skipped: invalid,
              response: lastData,
            },
          };
        }
        lastError = `HTTP ${resp.status}`;
        if (resp.status >= 400 && resp.status < 500) break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Network error";
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
      }
    }
    await logOutboundEvent({
      workspaceId,
      integrationId: integration.id,
      kind: "cms.push_inventory",
      targetUrl: req.url,
      requestBody: { op, count: valid.length },
      responseStatus: lastStatus,
      responseBody: typeof lastData === "object" ? (lastData as Record<string, unknown>) : null,
      ok: false,
      error: lastError,
    });
    return {
      ok: false,
      error: lastError ?? "Failed to push inventory.",
      status: lastStatus || 502,
      details: { response: lastData, skipped: invalid },
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Bootstrap + pull — makes records the source of truth for the gb site.       */
/* -------------------------------------------------------------------------- */

type VehicleFieldSeed = {
  name: string;
  key: string;
  type: "text" | "number" | "status" | "file";
  required?: boolean;
  options?: Record<string, unknown>;
  sortOrder: number;
};

const VEHICLE_FIELD_SEEDS: VehicleFieldSeed[] = [
  { name: "Slug", key: "slug", type: "text", required: true, sortOrder: 0 },
  { name: "Marca", key: "brand", type: "text", required: true, sortOrder: 10 },
  { name: "Modelo", key: "model", type: "text", required: true, sortOrder: 20 },
  { name: "Año", key: "year", type: "number", required: true, sortOrder: 30 },
  { name: "Precio", key: "price", type: "text", required: true, sortOrder: 40 },
  { name: "Imagen", key: "image", type: "file", sortOrder: 50 },
  { name: "Ubicación", key: "location", type: "text", sortOrder: 60 },
  { name: "Descripción", key: "description", type: "text", sortOrder: 70 },
  {
    name: "Estado",
    key: "status",
    type: "status",
    options: { values: ["available", "sold", "reserved"] },
    sortOrder: 80,
  },
];

registerTool({
  name: "cms.bootstrap_vehicles",
  description:
    "Create (or patch) the workspace `vehicles` object + fields that mirror the gb-automotriz site schema. Idempotent — safe to call on an existing workspace. Returns { objectId, objectSlug, createdFields, reusedFields }.",
  args: {
    integrationSlug: {
      type: "string",
      description: "Optional gb_automotriz_cms integration slug; only used to validate the site is reachable.",
    },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };

    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin not configured.", status: 500 };

    const existing = await listWorkspaceObjects(workspaceId);
    let objectRow = existing.find(
      (o) => o.slug === "vehicles" || (o as { kind?: string | null }).kind === "vehicle",
    );

    let created = false;
    if (!objectRow) {
      const newSlug = await generateUniqueObjectSlug(workspaceId, "Vehicles");
      const insertPayload: Record<string, unknown> = {
        workspace_id: workspaceId,
        name: "Vehicles",
        singular_name: "Vehículo",
        plural_name: "Vehículos",
        description: "Inventario de vehículos sincronizado con el sitio público.",
        icon: "car",
        kind: "vehicle",
        is_system: false,
        slug: newSlug,
      };
      let insert = await supabase.from("workspace_objects").insert(insertPayload).select("id").single();
      if (insert.error && insert.error.message.includes("slug")) {
        delete insertPayload.slug;
        insert = await supabase.from("workspace_objects").insert(insertPayload).select("id").single();
      }
      if (insert.error || !insert.data) {
        return { ok: false, error: insert.error?.message ?? "Failed to create vehicles object.", status: 500 };
      }
      objectRow = {
        id: String(insert.data.id),
        workspaceId,
        name: "Vehicles",
        slug: newSlug,
        singularName: "Vehículo",
        pluralName: "Vehículos",
        description: null,
        icon: "car",
        createdAt: new Date().toISOString(),
      } as typeof existing[number];
      created = true;
    }

    const allFields = await listWorkspaceFields(workspaceId);
    const existingKeys = new Set(
      allFields.filter((f) => f.objectId === objectRow!.id).map((f) => f.key),
    );
    const createdFields: string[] = [];
    const reusedFields: string[] = [];
    for (const field of VEHICLE_FIELD_SEEDS) {
      if (existingKeys.has(field.key)) {
        reusedFields.push(field.key);
        continue;
      }
      const { error } = await supabase.from("workspace_fields").insert({
        workspace_id: workspaceId,
        object_id: objectRow.id,
        name: field.name,
        key: field.key,
        type: field.type,
        required: Boolean(field.required),
        options: field.options ?? {},
        sort_order: field.sortOrder,
        is_locked: false,
      });
      if (!error) createdFields.push(field.key);
    }

    let integrationReachable: boolean | null = null;
    if (typeof args.integrationSlug === "string" && args.integrationSlug.trim()) {
      const integration = await getIntegrationBySlug(workspaceId, args.integrationSlug.trim());
      integrationReachable = Boolean(integration && integration.provider === "gb_automotriz_cms");
    }

    return {
      ok: true,
      data: {
        objectId: objectRow.id,
        objectSlug: objectRow.slug,
        created,
        createdFields,
        reusedFields,
        integrationReachable,
      },
    };
  },
});

registerTool({
  name: "cms.sync_inventory",
  description:
    "Pull the current inventory from the external gb-automotriz site and upsert each vehicle into the workspace `vehicles` records (matched on data.slug). Read-only on the site; writes only to workspace records. Idempotent.",
  args: {
    slug: { type: "string", required: true, description: "gb_automotriz_cms integration slug." },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const integrationSlug = String(args.slug ?? "").trim();
    if (!integrationSlug) return { ok: false, error: "`slug` is required.", status: 400 };

    const integration = await getIntegrationBySlug(workspaceId, integrationSlug);
    if (!integration) return { ok: false, error: `Integration '${integrationSlug}' not found.`, status: 404 };
    if (integration.provider !== "gb_automotriz_cms") {
      return { ok: false, error: "Integration is not a gb_automotriz_cms integration.", status: 400 };
    }
    const adapter = getProviderAdapter("gb_automotriz_cms");
    if (!adapter) return { ok: false, error: "Adapter missing.", status: 500 };
    const secrets = await getIntegrationSecrets(integration.id);

    const objects = await listWorkspaceObjects(workspaceId);
    const vehiclesObj = objects.find(
      (o) => o.slug === "vehicles" || (o as { kind?: string | null }).kind === "vehicle",
    );
    if (!vehiclesObj) {
      return {
        ok: false,
        error: "No vehicles object in this workspace. Run cms.bootstrap_vehicles first.",
        status: 409,
      };
    }

    const req = adapter.buildRequest({
      secrets,
      config: integration.config,
      method: "GET",
      path: "/api/inventory",
    });
    let payload: { vehicles?: Vehicle[] } | null = null;
    try {
      const resp = await fetch(req.url, { method: req.method, headers: req.headers });
      const text = await resp.text();
      if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}`, status: resp.status, details: text.slice(0, 500) };
      payload = text ? (JSON.parse(text) as { vehicles?: Vehicle[] }) : null;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Fetch failed.", status: 502 };
    }

    const remote = Array.isArray(payload?.vehicles) ? payload!.vehicles! : [];
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin not configured.", status: 500 };

    const local = await listWorkspaceRecords(workspaceId, vehiclesObj.id);
    const bySlug = new Map<string, (typeof local)[number]>();
    for (const rec of local) {
      const data = (rec.data as Record<string, unknown>) ?? {};
      if (typeof data.slug === "string" && data.slug) bySlug.set(data.slug, rec);
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const v of remote) {
      if (!validateVehicle(v)) continue;
      const existing = bySlug.get(v.slug);
      if (!existing) {
        await supabase.from("records").insert({
          workspace_id: workspaceId,
          object_id: vehiclesObj.id,
          data: v as unknown as Record<string, unknown>,
        });
        created += 1;
      } else {
        const existingData = (existing.data as Record<string, unknown>) ?? {};
        const merged = { ...existingData, ...v };
        const same = JSON.stringify(existingData) === JSON.stringify(merged);
        if (same) {
          unchanged += 1;
        } else {
          await supabase.from("records").update({ data: merged }).eq("id", existing.id);
          updated += 1;
        }
      }
    }

    return {
      ok: true,
      data: {
        objectId: vehiclesObj.id,
        pulled: remote.length,
        created,
        updated,
        unchanged,
      },
    };
  },
});
