export const runtime = "nodejs";

/**
 * GET   /api/crm/leads/:id        Load a lead
 * PATCH /api/crm/leads/:id        Update lead fields (incl. opportunity_value in cents)
 *
 * opportunity_value is validated through lib/crm/currency.ts:
 *   - null / omitted → cleared
 *   - integer cents >= 0 → stored as-is
 *   - anything else → 400
 */

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAppUser } from "@/lib/auth";
import { validateCents } from "@/lib/crm/currency";
import { LEADS_COLUMNS } from "@/lib/crm/columns";

export const dynamic = "force-dynamic";

async function authorize(workspaceId: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (!user.memberships.some((m) => m.workspaceId === workspaceId) && !user.isPlatformAdmin) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }
  const { data: lead, error } = await supabase.from("leads").select(LEADS_COLUMNS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const auth = await authorize(lead.workspace_id as string);
  if ("error" in auth) return auth.error;

  return NextResponse.json({ lead });
}

const UPDATABLE_FIELDS = new Set([
  "first_name",
  "last_name",
  "phone",
  "email",
  "channel",
  "pipeline_stage",
  "assigned_agent",
  "metadata",
]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin is not configured." }, { status: 500 });
  }

  const { data: lead, error: readErr } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const auth = await authorize(lead.workspace_id as string);
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (UPDATABLE_FIELDS.has(key)) {
      update[key] = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "opportunity_value")) {
    try {
      update.opportunity_value = validateCents(body.opportunity_value);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "invalid opportunity_value" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select(LEADS_COLUMNS)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed." }, { status: 500 });
  }
  return NextResponse.json({ lead: data });
}
