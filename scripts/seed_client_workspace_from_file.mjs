import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DEFAULT_FILE = "data/gb-automotriz-inventory.json";
const OBJECT_SLUG = "vehicles";
const OBJECT_NAME = "Vehicles";
const TEMPLATE_ID = "tmpl_automotive_inventory_base";

const vehicleFields = [
  ["stock_number", "Stock Number", "text", true, 1],
  ["year", "Year", "number", false, 2],
  ["make", "Make", "text", false, 3],
  ["model", "Model", "text", false, 4],
  ["trim", "Trim", "text", false, 5],
  ["vin", "VIN", "text", false, 6],
  ["price", "Price", "currency", false, 7],
  ["currency", "Currency", "text", false, 8],
  ["mileage", "Mileage", "number", false, 9],
  ["status", "Status", "select", false, 10],
  ["exterior_color", "Exterior Color", "text", false, 11],
  ["interior_color", "Interior Color", "text", false, 12],
  ["quantity", "Quantity", "number", false, 13],
  ["branch", "Branch", "text", false, 14],
  ["website_url", "Website URL", "text", false, 15],
  ["hero_image_url", "Hero Image URL", "text", false, 16],
  ["image_urls", "Image URLs", "text", false, 17],
];

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: DEFAULT_FILE,
    resetRecords: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file") {
      options.file = args[index + 1] ?? DEFAULT_FILE;
      index += 1;
    } else if (arg === "--reset-records") {
      options.resetRecords = true;
    }
  }
  return options;
}

function readSeedFile(filePath) {
  const absolutePath = path.resolve(ROOT, filePath);
  const seed = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!seed.client?.name || !seed.client?.workspaceSlug) {
    throw new Error("Seed file must include client.name and client.workspaceSlug.");
  }
  if (!Array.isArray(seed.vehicles) || seed.vehicles.length === 0) {
    throw new Error("Seed file must include at least one vehicle.");
  }
  for (const vehicle of seed.vehicles) {
    if (!vehicle.stock_number) {
      throw new Error("Every vehicle must include stock_number.");
    }
  }
  return { absolutePath, seed };
}

function isoNow() {
  return new Date().toISOString();
}

async function ensureWorkspace(supabase, client) {
  const existing = await supabase
    .from("workspaces")
    .select("id, name, subdomain, metadata")
    .eq("subdomain", client.workspaceSlug)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const metadata = {
    vertical: client.vertical ?? "automotive",
    source: "file_seed",
    githubRepository: client.githubRepository,
    landingSiteSubdomain: client.landingSiteSubdomain,
    inventoryObjectSlug: OBJECT_SLUG,
  };

  if (existing.data) {
    const { data, error } = await supabase
      .from("workspaces")
      .update({
        name: client.name,
        primary_color: client.primaryColor ?? "#0F766E",
        metadata: { ...(existing.data.metadata ?? {}), ...metadata },
        updated_at: isoNow(),
      })
      .eq("id", existing.data.id)
      .select("id, name, subdomain, metadata")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name: client.name,
      subdomain: client.workspaceSlug,
      primary_color: client.primaryColor ?? "#0F766E",
      metadata,
      agent_limit: 3,
      inbound_token: randomUUID().replace(/-/g, ""),
    })
    .select("id, name, subdomain, metadata")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureWorkspaceAgents(supabase, workspaceId, client) {
  const endpoint = process.env.HERMES_API_BASE_URL ?? "";
  const apiKey = process.env.HERMES_API_KEY ?? "";
  const hermesVersion = process.env.HERMES_AGENT_VERSION ?? "v2026.4.30";
  const agents = [
    {
      name: "Main Inventory Agent",
      type: "copilot",
      role: "main",
      description: "Coordinates GB Automotriz workspace updates and inventory review.",
    },
    {
      name: "Inventory Pricing Agent",
      type: "worker",
      role: "agent-2",
      description: "Reviews vehicle records, prices, and status changes before publishing.",
    },
    {
      name: "Landing Sync Agent",
      type: "channel",
      role: "agent-3",
      description: "Monitors landing-site inventory visibility and handoffs.",
    },
  ];

  const results = [];
  for (const agent of agents) {
    const existing = await supabase
      .from("workspace_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("container_name", `hermes-${client.workspaceSlug}-${agent.role}`)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    const payload = {
      workspace_id: workspaceId,
      name: agent.name,
      type: agent.type,
      description: agent.description,
      container_name: `hermes-${client.workspaceSlug}-${agent.role}`,
      api_endpoint: endpoint,
      api_key: apiKey,
      hermes_version: hermesVersion,
      status: "active",
      soul_md: "You operate GB Automotriz inventory workflows. Keep vehicle price and status updates grounded in workspace records.",
      skills: ["prisma-database", "prisma-api-fetch"],
      mcp_tools_include: [
        "schema.catalog",
        "records.query",
        "records.create",
        "records.update",
        "records.bulk_update",
      ],
      skills_scope: ["prisma-database"],
      model_overrides: {},
      knowledge_scope: {
        peer_role: agent.role,
        read: [OBJECT_SLUG],
        write: [OBJECT_SLUG],
        channels: ["workspace_chat", "landing_inventory"],
        model: process.env.HERMES_MODEL ?? "hermes-agent",
      },
      cron_jobs: [],
      channel_config: {},
      memory_limit_mb: 512,
      cpu_limit: 0.5,
      updated_at: isoNow(),
    };

    if (existing.data) {
      const { data, error } = await supabase
        .from("workspace_agents")
        .update(payload)
        .eq("id", existing.data.id)
        .select("id, name, type, status")
        .single();
      if (error) throw new Error(error.message);
      results.push(data);
    } else {
      const { data, error } = await supabase
        .from("workspace_agents")
        .insert(payload)
        .select("id, name, type, status")
        .single();
      if (error) throw new Error(error.message);
      results.push(data);
    }
  }
  return results;
}

async function hasObjectSlug(supabase) {
  const { error } = await supabase.from("workspace_objects").select("slug").limit(1);
  return !error;
}

async function ensureVehiclesObject(supabase, workspaceId) {
  const useSlug = await hasObjectSlug(supabase);
  const query = supabase
    .from("workspace_objects")
    .select(useSlug ? "id, name, slug" : "id, name")
    .eq("workspace_id", workspaceId);
  const existing = await (useSlug ? query.eq("slug", OBJECT_SLUG) : query.eq("name", OBJECT_NAME)).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { ...existing.data, useSlug };

  const payload = {
    workspace_id: workspaceId,
    name: OBJECT_NAME,
    singular_name: "Vehicle",
    plural_name: "Vehicles",
    description: "Client vehicle inventory synced from Prisma workspace records.",
    icon: "car",
    kind: null,
    is_system: false,
  };
  if (useSlug) payload.slug = OBJECT_SLUG;

  const { data, error } = await supabase
    .from("workspace_objects")
    .insert(payload)
    .select(useSlug ? "id, name, slug" : "id, name")
    .single();
  if (error) throw new Error(error.message);
  return { ...data, useSlug };
}

async function ensureFields(supabase, workspaceId, objectId) {
  for (const [key, name, type, required, sortOrder] of vehicleFields) {
    const existing = await supabase
      .from("workspace_fields")
      .select("id")
      .eq("object_id", objectId)
      .eq("key", key)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) continue;

    const options = key === "status" ? { values: ["available", "reserved", "sold", "pending"] } : {};
    const { error } = await supabase.from("workspace_fields").insert({
      workspace_id: workspaceId,
      object_id: objectId,
      key,
      name,
      type,
      required,
      options,
      sort_order: sortOrder,
      is_locked: false,
    });
    if (error) throw new Error(error.message);
  }
}

async function ensureView(supabase, workspaceId, objectId) {
  const existing = await supabase
    .from("workspace_views")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .eq("name", "Available inventory")
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const payload = {
    workspace_id: workspaceId,
    object_id: objectId,
    name: "Available inventory",
    filters: { conditions: [{ field: "status", operator: "eq", value: "available" }] },
    sort_by: "price",
    sort_order: "desc",
    columns: [
      "stock_number",
      "year",
      "make",
      "model",
      "trim",
      "price",
      "status",
      "exterior_color",
      "quantity",
      "branch",
      "hero_image_url",
      "image_urls",
      "website_url",
    ],
  };

  if (existing.data) {
    const { error } = await supabase.from("workspace_views").update(payload).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return existing.data.id;
  }
  const { data, error } = await supabase.from("workspace_views").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function upsertVehicles(supabase, workspaceId, objectId, vehicles, resetRecords) {
  if (resetRecords) {
    const { error } = await supabase
      .from("records")
      .update({ deleted_at: isoNow(), updated_at: isoNow() })
      .eq("workspace_id", workspaceId)
      .eq("object_id", objectId)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
  }

  const existing = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .is("deleted_at", null);
  if (existing.error) throw new Error(existing.error.message);

  const byStockNumber = new Map((existing.data ?? []).map((record) => [record.data?.stock_number, record]));
  let inserted = 0;
  let updated = 0;

  for (const vehicle of vehicles) {
    const match = byStockNumber.get(vehicle.stock_number);
    const data = {
      ...vehicle,
      last_inventory_update: isoNow(),
      source: "gb-automotriz-inventory-file",
    };
    if (match) {
      const { error } = await supabase
        .from("records")
        .update({ data: { ...match.data, ...data }, updated_at: isoNow() })
        .eq("id", match.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      updated += 1;
    } else {
      const { error } = await supabase.from("records").insert({
        workspace_id: workspaceId,
        object_id: objectId,
        data,
      });
      if (error) throw new Error(error.message);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

async function ensureLandingSite(supabase, workspaceId, objectId, client, useSlug) {
  const template = await supabase.from("landing_templates").select("id").eq("id", TEMPLATE_ID).maybeSingle();
  if (template.error) throw new Error(template.error.message);
  if (!template.data) {
    const { error } = await supabase.from("landing_templates").insert({
      id: TEMPLATE_ID,
      key: "automotive-inventory-base",
      name: "Automotive Inventory Base",
      vertical: "automotive",
      section_schema: ["inventory"],
      default_content: {},
      is_active: true,
    });
    if (error) throw new Error(error.message);
  }

  const projectId = `prj_${client.workspaceSlug.replace(/[^a-z0-9]+/gi, "_")}`;
  const siteId = `site_${client.workspaceSlug.replace(/[^a-z0-9]+/gi, "_")}`;
  const project = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (project.error) throw new Error(project.error.message);
  if (!project.data) {
    const { error } = await supabase.from("projects").insert({
      id: projectId,
      workspace_id: workspaceId,
      name: `${client.name} inventory launch`,
      status: "active",
      industry: "automotive",
      metadata: {
        githubRepository: client.githubRepository,
        integrationGoal: "Prisma workspace updates vehicle inventory and prices on Vercel landing page.",
      },
    });
    if (error) throw new Error(error.message);
  }

  const content = {
    companyName: client.name,
    githubRepository: client.githubRepository,
    inventoryLink: {
      mode: "metadata_supabase_read",
      workspaceId,
      objectId,
      objectSlug: useSlug ? OBJECT_SLUG : null,
      objectName: OBJECT_NAME,
      publicFields: vehicleFields.map(([key]) => key),
      source: "supabase",
    },
  };

  const existing = await supabase.from("landing_sites").select("id").eq("id", siteId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const payload = {
    workspace_id: workspaceId,
    project_id: projectId,
    template_id: TEMPLATE_ID,
    name: `${client.name} Vercel inventory site`,
    subdomain: client.landingSiteSubdomain ?? client.workspaceSlug,
    publish_status: "published",
    content,
    theme_config: { inventorySource: "supabase", primaryColor: client.primaryColor ?? "#0F766E" },
    seo_config: { title: `${client.name} inventory` },
    updated_at: isoNow(),
  };
  if (existing.data) {
    const { data, error } = await supabase.from("landing_sites").update(payload).eq("id", siteId).select("id, subdomain").single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("landing_sites").insert({ id: siteId, ...payload }).select("id, subdomain").single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureImportHistory(supabase, workspaceId, objectId, fileName, totalRows, importResult, resetRecords) {
  const { error } = await supabase.from("workspace_import_history").insert({
    workspace_id: workspaceId,
    object_id: objectId,
    file_name: fileName,
    total_rows: totalRows,
    imported_rows: importResult.inserted,
    skipped_rows: 0,
    error_rows: 0,
    summary: {
      mode: "stock_number_upsert",
      resetRecords,
      inserted: importResult.inserted,
      updated: importResult.updated,
    },
  });
  if (error) throw new Error(error.message);
}

async function main() {
  loadEnv();
  const options = parseArgs();
  const { absolutePath, seed } = readSeedFile(options.file);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const workspace = await ensureWorkspace(supabase, seed.client);
  const agents = await ensureWorkspaceAgents(supabase, workspace.id, seed.client);
  const object = await ensureVehiclesObject(supabase, workspace.id);
  await ensureFields(supabase, workspace.id, object.id);
  await ensureView(supabase, workspace.id, object.id);
  const importResult = await upsertVehicles(supabase, workspace.id, object.id, seed.vehicles, options.resetRecords);
  await ensureImportHistory(
    supabase,
    workspace.id,
    object.id,
    path.relative(ROOT, absolutePath),
    seed.vehicles.length,
    importResult,
    options.resetRecords,
  );
  const site = await ensureLandingSite(supabase, workspace.id, object.id, seed.client, object.useSlug);

  console.log(JSON.stringify(
    {
      ok: true,
      sourceFile: path.relative(ROOT, absolutePath),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.subdomain,
      },
      inventoryObject: {
        id: object.id,
        slug: object.slug ?? null,
        name: object.name,
      },
      vehicles: {
        sourceRows: seed.vehicles.length,
        ...importResult,
      },
      agents,
      site: {
        id: site.id,
        subdomain: site.subdomain,
        publicInventoryApi: `/api/public/sites/${site.subdomain}/inventory`,
      },
      githubRepository: seed.client.githubRepository,
    },
    null,
    2,
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
