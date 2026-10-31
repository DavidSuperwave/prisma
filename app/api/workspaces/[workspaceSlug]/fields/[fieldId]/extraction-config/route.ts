import { getCurrentAppUser } from "@/lib/auth";
import { normalizeExtractionConstraint } from "@/lib/fieldExtraction";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; fieldId: string }>;
};

type UpsertExtractionConfigRequest = {
  sourceRef?: string | null;
  promptTemplate?: string;
  validationRule?: Record<string, unknown>;
  confidenceThreshold?: number;
  enabled?: boolean;
  version?: number;
  metadata?: Record<string, unknown>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

async function authorizeWorkspaceAdmin(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  if (!user.isPlatformAdmin && membership.role !== "admin") {
    return { error: Response.json({ error: "Only workspace admins can manage extraction config." }, { status: 403 }) };
  }
  return { user, membership };
}

function mapConfigRow(row: Record<string, unknown>, field?: Record<string, unknown> | null) {
  const normalizedConstraint = normalizeExtractionConstraint({
    fieldName: typeof field?.name === "string" ? field.name : null,
    fieldType: typeof field?.type === "string" ? field.type : null,
    fieldOptions:
      field?.options && typeof field.options === "object" && !Array.isArray(field.options)
        ? (field.options as Record<string, unknown>)
        : {},
    validationRule: (row.validation_rule as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  });
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    fieldId: String(row.field_id),
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    promptTemplate: String(row.prompt_template ?? ""),
    validationRule: normalizedConstraint.validationRule,
    confidenceThreshold: Number(row.confidence_threshold ?? 0.7),
    enabled: Boolean(row.enabled),
    version: Number(row.version ?? 1),
    metadata: normalizedConstraint.metadata,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, fieldId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const supabase = requireSupabaseAdmin();
    const [{ data, error }, { data: fieldRow, error: fieldError }] = await Promise.all([
      supabase
        .from("field_extraction_configs")
        .select(
          "id, workspace_id, object_id, field_id, source_ref, prompt_template, validation_rule, confidence_threshold, enabled, version, metadata, created_at, updated_at",
        )
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("field_id", fieldId)
        .maybeSingle(),
      supabase
        .from("workspace_fields")
        .select("id, name, type, options")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("id", fieldId)
        .maybeSingle(),
    ]);
    if (error) {
      if (error.code === "42P01") {
        return Response.json({ error: "Extraction config tables are not migrated yet." }, { status: 503 });
      }
      throw new Error(error.message);
    }
    if (fieldError) {
      throw new Error(fieldError.message);
    }
    return Response.json({
      extractionConfig: data ? mapConfigRow(data as Record<string, unknown>, (fieldRow as Record<string, unknown>) ?? null) : null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load extraction config." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { workspaceSlug, fieldId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const payload = (await request.json().catch(() => ({}))) as UpsertExtractionConfigRequest;
    const supabase = requireSupabaseAdmin();

    const { data: fieldRow, error: fieldError } = await supabase
      .from("workspace_fields")
      .select("id, object_id, name, type, options")
      .eq("workspace_id", authorization.membership.workspaceId)
      .eq("id", fieldId)
      .maybeSingle();
    if (fieldError) throw new Error(fieldError.message);
    if (!fieldRow) return Response.json({ error: "Field not found." }, { status: 404 });

    const confidence = Number(payload.confidenceThreshold ?? 0.7);
    const normalizedConstraint = normalizeExtractionConstraint({
      fieldName: typeof fieldRow.name === "string" ? fieldRow.name : null,
      fieldType: typeof fieldRow.type === "string" ? fieldRow.type : null,
      fieldOptions:
        fieldRow.options && typeof fieldRow.options === "object" && !Array.isArray(fieldRow.options)
          ? (fieldRow.options as Record<string, unknown>)
          : {},
      validationRule:
        payload.validationRule &&
        typeof payload.validationRule === "object" &&
        !Array.isArray(payload.validationRule)
          ? payload.validationRule
          : {},
      metadata:
        payload.metadata &&
        typeof payload.metadata === "object" &&
        !Array.isArray(payload.metadata)
          ? payload.metadata
          : {},
    });
    const { data, error } = await supabase
      .from("field_extraction_configs")
      .upsert(
        {
          workspace_id: authorization.membership.workspaceId,
          object_id: String(fieldRow.object_id),
          field_id: fieldId,
          source_ref:
            typeof payload.sourceRef === "string" && payload.sourceRef.trim().length > 0
              ? payload.sourceRef.trim()
              : null,
          prompt_template: typeof payload.promptTemplate === "string" ? payload.promptTemplate : "",
          validation_rule: normalizedConstraint.validationRule,
          confidence_threshold: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0.7,
          enabled: payload.enabled !== false,
          version: Number.isInteger(payload.version) && Number(payload.version) > 0 ? Number(payload.version) : 1,
          metadata: normalizedConstraint.metadata,
          created_by: authorization.user.id,
          updated_by: authorization.user.id,
        },
        { onConflict: "workspace_id,field_id" },
      )
      .select(
        "id, workspace_id, object_id, field_id, source_ref, prompt_template, validation_rule, confidence_threshold, enabled, version, metadata, created_at, updated_at",
      )
      .single();
    if (error) {
      if (error.code === "42P01") {
        return Response.json({ error: "Extraction config tables are not migrated yet." }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({
      extractionConfig: mapConfigRow(data as Record<string, unknown>, fieldRow as Record<string, unknown>),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to upsert extraction config." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, fieldId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("field_extraction_configs")
      .delete()
      .eq("workspace_id", authorization.membership.workspaceId)
      .eq("field_id", fieldId);
    if (error) {
      if (error.code === "42P01") {
        return Response.json({ error: "Extraction config tables are not migrated yet." }, { status: 503 });
      }
      throw new Error(error.message);
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to delete extraction config." },
      { status: 400 },
    );
  }
}
