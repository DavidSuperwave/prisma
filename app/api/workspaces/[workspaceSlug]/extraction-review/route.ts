import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateReviewItemRequest = {
  recordId?: string;
  objectId?: string;
  fieldId?: string;
  extractionConfigId?: string | null;
  provenanceId?: string | null;
  reason?: "low_confidence" | "missing_value" | "conflict" | "validation_failed" | "manual_flag";
  proposedValue?: unknown;
  currentValue?: unknown;
  confidence?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

async function authorizeWorkspaceMember(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  return { user, membership };
}

function mapReviewRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    recordId: String(row.record_id),
    objectId: String(row.object_id),
    fieldId: String(row.field_id),
    extractionConfigId: row.extraction_config_id ? String(row.extraction_config_id) : null,
    provenanceId: row.provenance_id ? String(row.provenance_id) : null,
    status: String(row.status),
    reason: String(row.reason),
    proposedValue: row.proposed_value ?? null,
    currentValue: row.current_value ?? null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    notes: row.notes ? String(row.notes) : null,
    assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : null,
    resolvedByUserId: row.resolved_by_user_id ? String(row.resolved_by_user_id) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const supabase = requireSupabaseAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

    let query = supabase
      .from("extraction_review_items")
      .select(
        "id, workspace_id, record_id, object_id, field_id, extraction_config_id, provenance_id, status, reason, proposed_value, current_value, confidence, notes, assigned_to_user_id, resolved_by_user_id, resolved_at, metadata, created_at, updated_at",
      )
      .eq("workspace_id", authorization.membership.workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      if (error.code === "42P01") {
        return Response.json({ error: "Extraction review tables are not migrated yet." }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({ items: (data ?? []).map((row) => mapReviewRow(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to list extraction review items." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (!authorization.user.isPlatformAdmin && authorization.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to create review items." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as CreateReviewItemRequest;
    if (!payload.recordId || !payload.objectId || !payload.fieldId) {
      return Response.json({ error: "recordId, objectId, and fieldId are required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const confidence = payload.confidence;
    const { data, error } = await supabase
      .from("extraction_review_items")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        record_id: payload.recordId,
        object_id: payload.objectId,
        field_id: payload.fieldId,
        extraction_config_id: payload.extractionConfigId ?? null,
        provenance_id: payload.provenanceId ?? null,
        reason: payload.reason ?? "manual_flag",
        proposed_value: payload.proposedValue ?? null,
        current_value: payload.currentValue ?? null,
        confidence:
          confidence === null || confidence === undefined
            ? null
            : Number.isFinite(Number(confidence))
              ? Number(confidence)
              : null,
        notes: payload.notes ?? null,
        metadata:
          payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
            ? payload.metadata
            : {},
      })
      .select(
        "id, workspace_id, record_id, object_id, field_id, extraction_config_id, provenance_id, status, reason, proposed_value, current_value, confidence, notes, assigned_to_user_id, resolved_by_user_id, resolved_at, metadata, created_at, updated_at",
      )
      .single();
    if (error) {
      if (error.code === "42P01") {
        return Response.json({ error: "Extraction review tables are not migrated yet." }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({ item: mapReviewRow(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to create extraction review item." },
      { status: 400 },
    );
  }
}
