import { createHmac } from "node:crypto";
import type { ProviderAdapter } from "./types";

/**
 * gb-automotriz-web CMS adapter. The site exposes:
 *   GET  {baseUrl}/api/inventory        -> { vehicles: Vehicle[] }
 *   POST {baseUrl}/api/inventory/upsert -> HMAC-signed upsert/delete
 *
 * Signing: X-Prisma-Signature: sha256=<hex(hmac(body, sharedSecret))>
 */

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

export const VEHICLE_REQUIRED_KEYS: Array<keyof Vehicle> = ["slug", "brand", "model", "year", "price"];

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

export function signBody(body: string, sharedSecret: string): string {
  return `sha256=${createHmac("sha256", sharedSecret).update(body).digest("hex")}`;
}

export const gbAutomotrizCmsProvider: ProviderAdapter = {
  provider: "gb_automotriz_cms",
  label: "GB Automotriz CMS",
  authType: "hmac",
  secretKeys: ["sharedSecret"],
  configKeys: ["baseUrl"],
  buildRequest({ secrets, config, method, path, body, headers }) {
    const baseUrlRaw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
    if (!baseUrlRaw) throw new Error("Missing config.baseUrl for gb_automotriz_cms.");
    const sharedSecret = secrets.sharedSecret;
    if (!sharedSecret) throw new Error("Missing sharedSecret for gb_automotriz_cms.");
    const base = new URL(baseUrlRaw);
    const safePath = path.startsWith("/") ? path : `/${path}`;
    if (!/^\/api\/inventory(\/upsert)?$/.test(safePath)) {
      throw new Error("gb_automotriz_cms path must be /api/inventory or /api/inventory/upsert.");
    }
    const url = `${base.origin}${safePath}`;
    const serialized = body ? JSON.stringify(body) : "";
    const built: Record<string, string> = {
      Accept: "application/json",
      ...(serialized ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    };
    if (serialized) {
      built["X-Prisma-Signature"] = signBody(serialized, sharedSecret);
    }
    return {
      method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url,
      headers: built,
      body: serialized || undefined,
    };
  },
  testRequest({ config }) {
    const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
    if (!baseUrl) throw new Error("Missing baseUrl.");
    return {
      method: "GET",
      url: `${new URL(baseUrl).origin}/api/inventory`,
      headers: { Accept: "application/json" },
    };
  },
};
