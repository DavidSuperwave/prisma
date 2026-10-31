import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
const WORKSPACE_SLUG = "gb-automotriz-demo";
const SITE_SUBDOMAIN = "gb-automotriz-demo";
const STOCK_NUMBER = "GB-1001";
const ACCEPTANCE_PRICE = 351500;
const ACCEPTANCE_STATUS = "reserved";

function loadEnv() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

async function fetchInventory() {
  const baseUrl = (process.env.PRISMA_TEST_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/public/sites/${encodeURIComponent(SITE_SUBDOMAIN)}/inventory`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok, "Public inventory API failed.", { status: response.status, payload });
  return payload;
}

async function patchVehicle(supabase, inventory) {
  const workspaceId = inventory.inventory?.workspaceId;
  const objectId = inventory.inventory?.objectId;
  assert(workspaceId && objectId, "Public inventory payload did not include workspaceId and objectId.", inventory);
  const record = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .is("deleted_at", null)
    .filter("data->>stock_number", "eq", STOCK_NUMBER)
    .maybeSingle();
  if (record.error) throw new Error(record.error.message);
  assert(record.data, `Vehicle ${STOCK_NUMBER} was not found.`);

  const patched = {
    ...record.data.data,
    price: ACCEPTANCE_PRICE,
    status: ACCEPTANCE_STATUS,
    last_inventory_update: "gb-automotriz-quality-test",
  };
  const update = await supabase
    .from("records")
    .update({ data: patched, updated_at: new Date().toISOString() })
    .eq("id", record.data.id)
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

  execFileSync(process.execPath, ["scripts/seed_client_workspace_from_file.mjs", "--reset-records"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const firstRead = await fetchInventory();
  assert(firstRead.inventory?.count >= 1, "Public inventory API returned no vehicles.", firstRead);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const patched = await patchVehicle(supabase, firstRead);
  const secondRead = await fetchInventory();
  const vehicle = secondRead.inventory?.vehicles?.find((entry) => entry.stock_number === STOCK_NUMBER);
  assert(
    vehicle?.price === ACCEPTANCE_PRICE && vehicle?.status === ACCEPTANCE_STATUS,
    "Public inventory API did not reflect the Prisma record update.",
    vehicle,
  );

  console.log(JSON.stringify(
    {
      ok: true,
      firstReadCount: firstRead.inventory.count,
      patched: {
        recordId: patched.id,
        stockNumber: STOCK_NUMBER,
        price: ACCEPTANCE_PRICE,
        status: ACCEPTANCE_STATUS,
      },
      publicInventoryApi: `/api/public/sites/${SITE_SUBDOMAIN}/inventory`,
    },
    null,
    2,
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
