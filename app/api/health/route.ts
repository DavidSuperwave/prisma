/**
 * GET /api/health
 *
 * Reports status for the three runtime dependencies:
 *   - Next.js app itself (implicit: if we respond, we're up)
 *   - Supabase (a trivial read against `workspaces`)
 *   - OpenClaw multi-agent gateway (optional)
 *
 * Response codes:
 *   - 200 `{ status: "ok",       ... }` when all probes succeed
 *   - 200 `{ status: "degraded", ... }` when one or more optional probes fail
 *   - 503 `{ status: "down",     ... }` when a hard dep (Supabase) is unreachable
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabaseAdmin";
import { ping as openclawPing, hasOpenclawConfig } from "@/lib/openclawClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProbeStatus = "ok" | "degraded" | "disabled" | "down";

type ProbeReport = {
  status: ProbeStatus;
  latencyMs?: number;
  error?: string;
};

async function probeSupabase(): Promise<ProbeReport> {
  if (!hasSupabaseAdminConfig()) {
    return { status: "down", error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: "down", error: "supabase client unavailable" };
  }
  const startedAt = Date.now();
  try {
    const { error } = await supabase.from("workspaces").select("id").limit(1);
    const latencyMs = Date.now() - startedAt;
    if (error) return { status: "down", error: error.message, latencyMs };
    return { status: "ok", latencyMs };
  } catch (error) {
    return {
      status: "down",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function probeOpenclaw(): Promise<ProbeReport> {
  if (!hasOpenclawConfig()) {
    return { status: "disabled" };
  }
  const result = await openclawPing();
  if (result.ok) {
    return { status: "ok", latencyMs: result.latencyMs };
  }
  return { status: "degraded", latencyMs: result.latencyMs, error: result.error };
}

export async function GET() {
  const [supabaseReport, openclawReport] = await Promise.all([probeSupabase(), probeOpenclaw()]);

  const hardDown = supabaseReport.status === "down";
  const anyDegraded =
    supabaseReport.status === "degraded" || openclawReport.status === "degraded";

  const status: "ok" | "degraded" | "down" = hardDown
    ? "down"
    : anyDegraded
      ? "degraded"
      : "ok";

  const body = {
    status,
    app: "ok",
    supabase: supabaseReport,
    openclaw: openclawReport,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: hardDown ? 503 : 200 });
}
