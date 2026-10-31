import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
const WORKSPACE_NAME = "Inventory Vercel Link Test 20260504";
const WORKSPACE_SLUG = "inventory-vercel-link-test-20260504";
const SITE_SUBDOMAIN = "inventory-vercel-link-test-20260504";
const PROJECT_ID = "prj_inventory_vercel_link_test_20260504";
const SITE_ID = "site_inventory_vercel_link_test_20260504";
const TEMPLATE_ID = "tmpl_inventory_vercel_link_test";
const OBJECT_SLUG = "vehicles";
const OBJECT_NAME = "Vehicles";
const FIRST_CSV_NAME = "synthetic-car-inventory-20260504.csv";
const SECOND_CSV_NAME = "synthetic-car-inventory-20260504-update.csv";

function loadEnv() {
  try {
    const raw = readFileSync(ENV_PATH, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // CI can provide env directly.
  }
}

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

function isoNow() {
  return new Date().toISOString();
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const headers = [
    "stock_number",
    "year",
    "make",
    "model",
    "trim",
    "vin",
    "price",
    "mileage",
    "status",
    "website_url",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

const firstRows = [
  {
    stock_number: "SYN-1001",
    year: 2024,
    make: "Toyota",
    model: "Camry",
    trim: "SE",
    vin: "4T1G11AK0RU100001",
    price: 28500,
    mileage: 4100,
    status: "available",
    website_url: "https://example-vercel-site.test/inventory/syn-1001",
  },
  {
    stock_number: "SYN-1002",
    year: 2022,
    make: "Ford",
    model: "Bronco Sport",
    trim: "Big Bend",
    vin: "3FMCR9B60NRA10002",
    price: 26950,
    mileage: 31200,
    status: "available",
    website_url: "https://example-vercel-site.test/inventory/syn-1002",
  },
  {
    stock_number: "SYN-1003",
    year: 2023,
    make: "Honda",
    model: "Civic",
    trim: "Sport",
    vin: "2HGFE2F50PH100003",
    price: 24900,
    mileage: 15400,
    status: "reserved",
    website_url: "https://example-vercel-site.test/inventory/syn-1003",
  },
  {
    stock_number: "SYN-1004",
    year: 2021,
    make: "Jeep",
    model: "Wrangler",
    trim: "Sahara",
    vin: "1C4HJXEG9MW100004",
    price: 33500,
    mileage: 42100,
    status: "available",
    website_url: "https://example-vercel-site.test/inventory/syn-1004",
  },
  {
    stock_number: "SYN-1005",
    year: 2025,
    make: "Tesla",
    model: "Model 3",
    trim: "Long Range",
    vin: "5YJ3E1EB8SF100005",
    price: 41900,
    mileage: 1200,
    status: "available",
    website_url: "https://example-vercel-site.test/inventory/syn-1005",
  },
];

const secondRows = [
  { ...firstRows[1], price: 25950, status: "available" },
  { ...firstRows[2], price: 23900, status: "sold" },
  {
    stock_number: "SYN-1006",
    year: 2020,
    make: "Subaru",
    model: "Outback",
    trim: "Limited",
    vin: "4S4BTANC5L3100006",
    price: 22900,
    mileage: 50200,
    status: "available",
    website_url: "https://example-vercel-site.test/inventory/syn-1006",
  },
];

const fields = [
  ["stock_number", "Stock Number", "text", true, 1],
  ["year", "Year", "number", false, 2],
  ["make", "Make", "text", false, 3],
  ["model", "Model", "text", false, 4],
  ["trim", "Trim", "text", false, 5],
  ["vin", "VIN", "text", false, 6],
  ["price", "Price", "currency", false, 7],
  ["mileage", "Mileage", "number", false, 8],
  ["status", "Status", "select", false, 9],
  ["website_url", "Website URL", "text", false, 10],
];

async function ensureSlugSchema(supabase) {
  const { error } = await supabase.from("workspace_objects").select("slug").limit(1);
  if (error) {
    if (process.env.PRISMA_ALLOW_LEGACY_NO_OBJECT_SLUG === "1") {
      return false;
    }
    throw new Error(
      [
        "workspace_objects.slug is not available in Supabase.",
        "Apply supabase/migrations/20260504_000001_workspace_slugs_and_hermes_0430.sql, then rerun this script.",
        `Supabase error: ${error.message}`,
      ].join("\n"),
    );
  }
  return true;
}

async function checkHermes() {
  const baseUrl = (process.env.HERMES_API_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.HERMES_API_KEY ?? "";
  assert(baseUrl, "HERMES_API_BASE_URL is required.");
  const health = await fetch(`${baseUrl}/health`);
  assert(health.ok, "Hermes /health failed.", { status: health.status, body: await health.text() });
  const models = await fetch(`${baseUrl}/v1/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  const modelPayload = await models.json().catch(() => ({}));
  assert(models.ok, "Hermes /v1/models failed.", { status: models.status, modelPayload });
  assert(
    Array.isArray(modelPayload.data) && modelPayload.data.some((entry) => entry.id === "hermes-agent"),
    "Hermes model list did not include hermes-agent.",
    modelPayload,
  );
  return { health: health.status, models: modelPayload.data.map((entry) => entry.id) };
}

async function ensureWorkspace(supabase) {
  const existing = await supabase
    .from("workspaces")
    .select("id, name, subdomain, metadata")
    .eq("subdomain", WORKSPACE_SLUG)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name: WORKSPACE_NAME,
      subdomain: WORKSPACE_SLUG,
      metadata: {
        source: "e2e_inventory_vercel_link",
        testRun: "20260504",
        agent_limit: 3,
      },
      agent_limit: 3,
      inbound_token: randomUUID().replace(/-/g, ""),
    })
    .select("id, name, subdomain, metadata")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureAgents(supabase, workspaceId) {
  const version = process.env.HERMES_AGENT_VERSION ?? "v2026.4.30";
  const endpoint = process.env.HERMES_API_BASE_URL ?? "";
  const apiKey = process.env.HERMES_API_KEY ?? "";
  const blueprints = [
    ["Main Agent", "copilot", "intake_assistant"],
    ["Agent 2", "worker", "crm_updater"],
    ["Agent 3", "channel", "follow_up"],
  ];
  const agents = [];
  for (const [name, type, role] of blueprints) {
    const existing = await supabase
      .from("workspace_agents")
      .select("id, name, type, status, hermes_version, api_endpoint")
      .eq("workspace_id", workspaceId)
      .eq("name", name)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      const { data, error } = await supabase
        .from("workspace_agents")
        .update({
          api_endpoint: endpoint,
          api_key: apiKey,
          hermes_version: version,
          status: "active",
          updated_at: isoNow(),
        })
        .eq("id", existing.data.id)
        .select("id, name, type, status, hermes_version, api_endpoint")
        .single();
      if (error) throw new Error(error.message);
      agents.push(data);
      continue;
    }
    const { data, error } = await supabase
      .from("workspace_agents")
      .insert({
        workspace_id: workspaceId,
        name,
        type,
        description: `Synthetic inventory test ${role}.`,
        container_name: `hermes-${WORKSPACE_SLUG}-${role}`,
        api_endpoint: endpoint,
        api_key: apiKey,
        hermes_version: version,
        status: "active",
        soul_md: "You manage synthetic vehicle inventory for a Prisma E2E test workspace.",
        skills: ["prisma-database", "prisma-api-fetch"],
        mcp_tools_include: [
          "schema.catalog",
          "schema.create_object",
          "schema.add_field",
          "records.query",
          "records.create",
          "records.update",
          "records.bulk_update",
          "documents.analyze",
          "spreadsheet.transform",
        ],
        skills_scope: ["prisma-database"],
        model_overrides: {},
        knowledge_scope: {
          legacy_role: role,
          read: [OBJECT_SLUG],
          write: [OBJECT_SLUG],
          channels: ["workspace_chat"],
          readiness_state: "ready",
          readiness_issues: [],
          model: "hermes-agent",
        },
        cron_jobs: [],
        channel_config: {},
        memory_limit_mb: 512,
        cpu_limit: 0.5,
      })
      .select("id, name, type, status, hermes_version, api_endpoint")
      .single();
    if (error) throw new Error(error.message);
    agents.push(data);
  }
  assert(
    agents.length === 3 && agents.every((agent) => agent.hermes_version === version && agent.status === "active"),
    "Expected 3 active v2026.4.30 agents.",
    agents,
  );
  return agents;
}

async function ensureVehiclesObject(supabase, workspaceId, hasSlug) {
  const existingQuery = supabase
    .from("workspace_objects")
    .select(hasSlug ? "id, slug, name" : "id, name")
    .eq("workspace_id", workspaceId);
  const existing = await (hasSlug ? existingQuery.eq("slug", OBJECT_SLUG) : existingQuery.eq("name", OBJECT_NAME)).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    return {
      id: existing.data.id,
      slug: hasSlug ? existing.data.slug : null,
      name: existing.data.name,
    };
  }

  const insertPayload = {
      workspace_id: workspaceId,
      name: OBJECT_NAME,
      singular_name: "Vehicle",
      plural_name: "Vehicles",
      description: "Synthetic vehicle inventory created by E2E CSV test.",
      icon: "car",
      kind: null,
      is_system: false,
    };
  if (hasSlug) {
    insertPayload.slug = OBJECT_SLUG;
  }

  const { data, error } = await supabase
    .from("workspace_objects")
    .insert(insertPayload)
    .select(hasSlug ? "id, slug, name" : "id, name")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    slug: hasSlug ? data.slug : null,
    name: data.name,
  };
}

async function ensureFields(supabase, workspaceId, objectId) {
  for (const [key, name, type, required, sortOrder] of fields) {
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

async function importRows(supabase, workspaceId, objectId, rows, fileName, actor) {
  const existing = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .is("deleted_at", null);
  if (existing.error) throw new Error(existing.error.message);
  const byStock = new Map((existing.data ?? []).map((row) => [row.data?.stock_number, row]));
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const match = byStock.get(row.stock_number);
    if (match) {
      const { error } = await supabase
        .from("records")
        .update({ data: { ...match.data, ...row }, updated_at: isoNow() })
        .eq("id", match.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      updated += 1;
    } else {
      const { error } = await supabase.from("records").insert({
        workspace_id: workspaceId,
        object_id: objectId,
        data: row,
      });
      if (error) throw new Error(error.message);
      inserted += 1;
    }
  }
  const { error: historyError } = await supabase.from("workspace_import_history").insert({
    workspace_id: workspaceId,
    object_id: objectId,
    file_name: fileName,
    total_rows: rows.length,
    imported_rows: inserted,
    skipped_rows: 0,
    error_rows: 0,
    summary: {
      mode: "upsert",
      dedupeKey: "stock_number",
      inserted,
      updated,
      actor,
      csvPreview: toCsv(rows),
    },
  });
  if (historyError) throw new Error(historyError.message);
  return { inserted, updated, skipped: 0 };
}

async function ensureTemplateProjectAndSite(supabase, workspaceId, objectId, hasSlug) {
  const template = await supabase
    .from("landing_templates")
    .select("id")
    .eq("id", TEMPLATE_ID)
    .maybeSingle();
  if (template.error) throw new Error(template.error.message);
  if (!template.data) {
    const { error } = await supabase.from("landing_templates").insert({
      id: TEMPLATE_ID,
      key: "inventory-vercel-link-test",
      name: "Inventory Vercel Link Test",
      vertical: "automotive",
      section_schema: ["inventory"],
      default_content: {},
      is_active: true,
    });
    if (error) throw new Error(error.message);
  }

  const project = await supabase.from("projects").select("id").eq("id", PROJECT_ID).maybeSingle();
  if (project.error) throw new Error(project.error.message);
  if (!project.data) {
    const { error } = await supabase.from("projects").insert({
      id: PROJECT_ID,
      workspace_id: workspaceId,
      name: "Inventory Vercel Link Test Launch",
      status: "active",
      industry: "automotive",
      metadata: {
        source: "e2e_inventory_vercel_link",
        vercelLinkMode: "metadata_supabase_read",
      inventoryObjectSlug: OBJECT_SLUG,
      inventoryObjectName: OBJECT_NAME,
      },
    });
    if (error) throw new Error(error.message);
  }

  const content = {
    companyName: WORKSPACE_NAME,
    inventoryLink: {
      mode: "metadata_supabase_read",
      workspaceId,
      objectId,
      objectSlug: hasSlug ? OBJECT_SLUG : null,
      objectName: OBJECT_NAME,
      publicFields: fields.map(([key]) => key),
      source: "supabase",
      webhookRole: "revalidate_only",
    },
  };
  const existingSite = await supabase.from("landing_sites").select("id").eq("id", SITE_ID).maybeSingle();
  if (existingSite.error) throw new Error(existingSite.error.message);
  if (existingSite.data) {
    const { data, error } = await supabase
      .from("landing_sites")
      .update({
        workspace_id: workspaceId,
        project_id: PROJECT_ID,
        template_id: TEMPLATE_ID,
        name: "Inventory Vercel Link Test Site",
        subdomain: SITE_SUBDOMAIN,
        publish_status: "published",
        content,
        theme_config: { inventorySource: "supabase" },
        seo_config: { title: "Inventory Vercel Link Test" },
        updated_at: isoNow(),
      })
      .eq("id", SITE_ID)
      .select("id, subdomain, content")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("landing_sites")
    .insert({
      id: SITE_ID,
      workspace_id: workspaceId,
      project_id: PROJECT_ID,
      template_id: TEMPLATE_ID,
      name: "Inventory Vercel Link Test Site",
      subdomain: SITE_SUBDOMAIN,
      publish_status: "published",
      content,
      theme_config: { inventorySource: "supabase" },
      seo_config: { title: "Inventory Vercel Link Test" },
    })
    .select("id, subdomain, content")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function fetchSiteInventory(siteSubdomain) {
  const base = (process.env.PRISMA_TEST_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const response = await fetch(`${base}/api/public/sites/${encodeURIComponent(siteSubdomain)}/inventory`);
  const payload = await response.json().catch(() => ({}));
  assert(response.ok, "Site-facing inventory route failed.", { status: response.status, payload });
  return payload;
}

async function updateVehicleForAcceptance(supabase, workspaceId, objectId) {
  const query = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .filter("data->>stock_number", "eq", "SYN-1001")
    .maybeSingle();
  if (query.error) throw new Error(query.error.message);
  assert(query.data, "Could not find SYN-1001 for acceptance update.");
  const patched = {
    ...query.data.data,
    price: 27500,
    status: "reserved",
    last_inventory_update: "site-facing acceptance check",
  };
  const update = await supabase
    .from("records")
    .update({ data: patched, updated_at: isoNow() })
    .eq("id", query.data.id)
    .eq("workspace_id", workspaceId)
    .select("id, data")
    .single();
  if (update.error) throw new Error(update.error.message);
  return update.data;
}

async function main() {
  loadEnv();
  assert(process.env.SUPABASE_URL, "SUPABASE_URL is required.");
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required.");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const hasSlug = await ensureSlugSchema(supabase);
  const hermes = await checkHermes();
  const workspace = await ensureWorkspace(supabase);
  const agents = await ensureAgents(supabase, workspace.id);
  const object = await ensureVehiclesObject(supabase, workspace.id, hasSlug);
  await ensureFields(supabase, workspace.id, object.id);
  const agentImport = await importRows(supabase, workspace.id, object.id, firstRows, FIRST_CSV_NAME, "agent_path");
  const uiImport = await importRows(supabase, workspace.id, object.id, secondRows, SECOND_CSV_NAME, "ui_operator_path");

  const records = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspace.id)
    .eq("object_id", object.id)
    .is("deleted_at", null);
  if (records.error) throw new Error(records.error.message);
  assert(records.data.length === 6, "Expected 6 vehicle records after second upsert.", records.data);

  const site = await ensureTemplateProjectAndSite(supabase, workspace.id, object.id, hasSlug);
  const beforeSiteRead = await fetchSiteInventory(site.subdomain);
  assert(beforeSiteRead.inventory.count === 6, "Site read should return 6 vehicles.", beforeSiteRead);
  const acceptanceUpdate = await updateVehicleForAcceptance(supabase, workspace.id, object.id);
  const afterSiteRead = await fetchSiteInventory(site.subdomain);
  const updatedVehicle = afterSiteRead.inventory.vehicles.find((vehicle) => vehicle.stock_number === "SYN-1001");
  assert(
    updatedVehicle?.price === 27500 && updatedVehicle?.status === "reserved",
    "Site read did not reflect the latest Prisma inventory update.",
    updatedVehicle,
  );

  const importHistory = await supabase
    .from("workspace_import_history")
    .select("file_name, total_rows, imported_rows, summary, created_at")
    .eq("workspace_id", workspace.id)
    .eq("object_id", object.id)
    .order("created_at", { ascending: false })
    .limit(2);
  if (importHistory.error) throw new Error(importHistory.error.message);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: hasSlug ? "strict_slug_schema" : "legacy_no_slug_compatibility",
        slugSchemaApplied: hasSlug,
        hermes,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.subdomain,
        },
        agents,
        inventoryObject: object,
        imports: {
          agentPath: agentImport,
          uiOperatorPath: uiImport,
          history: importHistory.data,
        },
        site: {
          id: site.id,
          subdomain: site.subdomain,
          route: `/api/public/sites/${site.subdomain}/inventory`,
          countBeforeAcceptanceUpdate: beforeSiteRead.inventory.count,
          updatedVehicleAfterAcceptanceUpdate: updatedVehicle,
        },
        acceptanceUpdate: {
          recordId: acceptanceUpdate.id,
          stockNumber: acceptanceUpdate.data.stock_number,
          price: acceptanceUpdate.data.price,
          status: acceptanceUpdate.data.status,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
