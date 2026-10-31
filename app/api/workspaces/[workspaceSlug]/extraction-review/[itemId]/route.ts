import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { safeEmitEvent } from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; itemId: string }>;
};

type UpdateReviewItemRequest = {
  status?: "pending" | "approved" | "rejected" | "dismissed";
  notes?: string | null;
  assignedToUserId?: string | null;
  applyResolvedValue?: boolean;
  resolvedValue?: unknown;
  confidence?: number | null;
  provenance?: {
    sourceDocumentId?: string | null;
    sourceQuote?: string | null;
    sourceSpan?: Record<string, unknown> | null;
    sourceBbox?: Record<string, unknown> | null;
    model?: string | null;
    promptVersion?: number | null;
    metadata?: Record<string, unknown>;
  };
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

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, itemId } = await context.params;
    const authorization = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (!authorization.user.isPlatformAdmin && authorization.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to update review items." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as UpdateReviewItemRequest;
    const supabase = requireSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from("extraction_review_items")
      .select(
        "id, workspace_id, record_id, object_id, field_id, extraction_config_id, provenance_id, status, reason, proposed_value, current_value, confidence, notes, assigned_to_user_id, resolved_by_user_id, resolved_at, metadata, created_at, updated_at",
      )
      .eq("workspace_id", authorization.membership.workspaceId)
      .eq("id", itemId)
      .maybeSingle();
    if (existingError) {
      if (existingError.code === "42P01") {
        return Response.json({ error: "Extraction review tables are not migrated yet." }, { status: 503 });
      }
      throw new Error(existingError.message);
    }
    if (!existing) {
      return Response.json({ error: "Review item not found." }, { status: 404 });
    }

    const nextStatus = payload.status ?? (existing.status as string);
    const updatePatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      ...(payload.assignedToUserId !== undefined ? { assigned_to_user_id: payload.assignedToUserId } : {}),
      ...(payload.confidence !== undefined
        ? {
            confidence:
              payload.confidence === null
                ? null
                : Number.isFinite(Number(payload.confidence))
                  ? Number(payload.confidence)
                  : null,
          }
        : {}),
    };

    const shouldResolve = nextStatus === "approved" || nextStatus === "rejected" || nextStatus === "dismissed";
    if (shouldResolve) {
      updatePatch.resolved_by_user_id = authorization.user.id;
      updatePatch.resolved_at = new Date().toISOString();
    }

    const applyResolvedValue = payload.applyResolvedValue === true && nextStatus === "approved";
    if (applyResolvedValue) {
      const { data: recordRow, error: recordError } = await supabase
        .from("records")
        .select("id, data")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("id", String(existing.record_id))
        .is("deleted_at", null)
        .maybeSingle();
      if (recordError) throw new Error(recordError.message);
      if (!recordRow) return Response.json({ error: "Target record not found." }, { status: 404 });

      const { data: fieldRow, error: fieldError } = await supabase
        .from("workspace_fields")
        .select("id, key")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("id", String(existing.field_id))
        .maybeSingle();
      if (fieldError) throw new Error(fieldError.message);
      if (!fieldRow) return Response.json({ error: "Target field not found." }, { status: 404 });

      const currentData =
        recordRow.data && typeof recordRow.data === "object" && !Array.isArray(recordRow.data)
          ? (recordRow.data as Record<string, unknown>)
          : {};
      const fieldKey = String(fieldRow.key);
      const nextValue =
        payload.resolvedValue !== undefined ? payload.resolvedValue : (existing.proposed_value as unknown);
      const updatedData = {
        ...currentData,
        [fieldKey]: nextValue,
      };
      const { error: updateRecordError } = await supabase
        .from("records")
        .update({ data: updatedData })
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("id", String(existing.record_id));
      if (updateRecordError) throw new Error(updateRecordError.message);

      const provenancePayload =
        payload.provenance && typeof payload.provenance === "object" ? payload.provenance : {};
      const confidence = Number(payload.confidence ?? existing.confidence ?? null);
      const { data: provenanceRow, error: provenanceError } = await supabase
        .from("record_field_provenance")
        .insert({
          workspace_id: authorization.membership.workspaceId,
          record_id: String(existing.record_id),
          object_id: String(existing.object_id),
          field_id: String(existing.field_id),
          extraction_config_id: existing.extraction_config_id ? String(existing.extraction_config_id) : null,
          source_document_id:
            typeof provenancePayload.sourceDocumentId === "string" && provenancePayload.sourceDocumentId
              ? provenancePayload.sourceDocumentId
              : null,
          source_type: "manual",
          value_snapshot: nextValue ?? null,
          source_quote:
            typeof provenancePayload.sourceQuote === "string" ? provenancePayload.sourceQuote : payload.notes ?? null,
          source_span:
            provenancePayload.sourceSpan &&
            typeof provenancePayload.sourceSpan === "object" &&
            !Array.isArray(provenancePayload.sourceSpan)
              ? provenancePayload.sourceSpan
              : null,
          source_bbox:
            provenancePayload.sourceBbox &&
            typeof provenancePayload.sourceBbox === "object" &&
            !Array.isArray(provenancePayload.sourceBbox)
              ? provenancePayload.sourceBbox
              : null,
          model:
            typeof provenancePayload.model === "string" && provenancePayload.model
              ? provenancePayload.model
              : "reviewer",
          prompt_version:
            provenancePayload.promptVersion !== null &&
            provenancePayload.promptVersion !== undefined &&
            Number.isInteger(Number(provenancePayload.promptVersion))
              ? Number(provenancePayload.promptVersion)
              : null,
          confidence:
            Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
          metadata:
            provenancePayload.metadata &&
            typeof provenancePayload.metadata === "object" &&
            !Array.isArray(provenancePayload.metadata)
              ? provenancePayload.metadata
              : {},
          created_by: authorization.user.id,
        })
        .select("id")
        .maybeSingle();
      if (provenanceError && provenanceError.code !== "42P01") {
        throw new Error(provenanceError.message);
      }
      if (provenanceRow) {
        updatePatch.provenance_id = String(provenanceRow.id);
      }

      await safeEmitEvent({
        supabase,
        workspaceId: authorization.membership.workspaceId,
        type: "record.updated",
        record: {
          id: String(existing.record_id),
          objectId: String(existing.object_id),
          data: updatedData,
          kind: null,
        },
        extra: {
          reason: "extraction_review_approved",
          fieldId: String(existing.field_id),
          reviewItemId: String(existing.id),
        },
        actorUserId: authorization.user.id,
      });
    }

    const { data, error } = await supabase
      .from("extraction_review_items")
      .update(updatePatch)
      .eq("workspace_id", authorization.membership.workspaceId)
      .eq("id", itemId)
      .select(
        "id, workspace_id, record_id, object_id, field_id, extraction_config_id, provenance_id, status, reason, proposed_value, current_value, confidence, notes, assigned_to_user_id, resolved_by_user_id, resolved_at, metadata, created_at, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);

    return Response.json({ item: mapReviewRow(data as Record<string, unknown>) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update extraction review item." },
      { status: 400 },
    );
  }
}
