import { list, put } from "@vercel/blob";

export type Vehicle = {
  slug: string;
  brand: string;
  model: string;
  year: number;
  price: string;
  image?: string;
  location?: string;
  description?: string;
  features?: string[];
  specs?: Record<string, string>;
  status?: "available" | "sold" | "reserved";
};

export type InventoryDocument = {
  vehicles: Vehicle[];
  updatedAt: string;
};

const BLOB_PATHNAME = "inventory/data.json";

export async function getInventory(): Promise<InventoryDocument> {
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const blob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
  if (!blob) {
    return { vehicles: [], updatedAt: new Date(0).toISOString() };
  }
  const resp = await fetch(blob.url, { cache: "no-store" });
  if (!resp.ok) {
    return { vehicles: [], updatedAt: new Date(0).toISOString() };
  }
  const json = (await resp.json()) as InventoryDocument;
  return {
    vehicles: Array.isArray(json?.vehicles) ? json.vehicles : [],
    updatedAt: typeof json?.updatedAt === "string" ? json.updatedAt : new Date().toISOString(),
  };
}

export async function setInventory(doc: InventoryDocument): Promise<{ url: string }> {
  const body = JSON.stringify(doc);
  const result = await put(BLOB_PATHNAME, body, {
    access: "public",
    contentType: "application/json",
    cacheControlMaxAge: 0,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: result.url };
}

export function mergeUpsert(existing: Vehicle[], incoming: Vehicle[]): Vehicle[] {
  const map = new Map<string, Vehicle>();
  for (const v of existing) map.set(v.slug, v);
  for (const v of incoming) map.set(v.slug, v);
  return Array.from(map.values());
}

export function mergeDelete(existing: Vehicle[], incoming: Vehicle[]): Vehicle[] {
  const drop = new Set(incoming.map((v) => v.slug));
  return existing.filter((v) => !drop.has(v.slug));
}

export function validateVehicle(v: unknown): v is Vehicle {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.slug !== "string" || !r.slug) return false;
  if (typeof r.brand !== "string" || !r.brand) return false;
  if (typeof r.model !== "string" || !r.model) return false;
  if (typeof r.year !== "number" || !Number.isFinite(r.year)) return false;
  if (typeof r.price !== "string" || !r.price) return false;
  return true;
}
