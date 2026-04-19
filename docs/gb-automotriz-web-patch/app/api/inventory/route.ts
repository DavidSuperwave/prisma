import { NextResponse } from "next/server";
import { getInventory } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const doc = await getInventory();
  return NextResponse.json(doc, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
  });
}
