import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  getInventory,
  mergeDelete,
  mergeUpsert,
  setInventory,
  validateVehicle,
  type Vehicle,
} from "@/lib/inventory";

export const runtime = "nodejs";

type Body = { op?: "upsert" | "delete"; vehicles?: unknown };

function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.INVENTORY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }
  const raw = await request.text();
  const header = request.headers.get("x-prisma-signature");
  if (!verifySignature(raw, header, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let body: Body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const op = body.op === "delete" ? "delete" : "upsert";
  const vehiclesIn = Array.isArray(body.vehicles) ? body.vehicles : [];
  const valid: Vehicle[] = [];
  const invalid: Array<{ index: number }> = [];
  vehiclesIn.forEach((entry, index) => {
    if (validateVehicle(entry)) valid.push(entry);
    else invalid.push({ index });
  });
  if (valid.length === 0) {
    return NextResponse.json({ error: "No valid vehicles.", skipped: invalid }, { status: 400 });
  }
  try {
    const current = await getInventory();
    const next =
      op === "delete"
        ? mergeDelete(current.vehicles, valid)
        : mergeUpsert(current.vehicles, valid);
    const updatedAt = new Date().toISOString();
    const { url } = await setInventory({ vehicles: next, updatedAt });
    try {
      revalidatePath("/seminuevos");
      for (const v of valid) {
        revalidatePath(`/cars/${v.slug}`);
      }
    } catch {
      // best effort
    }
    return NextResponse.json({
      ok: true,
      op,
      count: valid.length,
      total: next.length,
      skipped: invalid,
      blobUrl: url,
      updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : null;
    console.error("[inventory/upsert] failed", message, stack);
    return NextResponse.json(
      { error: "Inventory write failed.", detail: message, stack },
      { status: 500 },
    );
  }
}
