import { getCurrentAppUser } from "@/lib/auth";
import { normalizeExtractionConstraint } from "@/lib/fieldExtraction";
import { buildFieldPropertyBuilder, parseFieldOptionValues } from "@/lib/fieldPropertyBuilder";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateFieldRequest = {
  objectId?: string;
  name?: string;
  key?: string;
  type?: string;
  required?: boolean;
  options?: Record<string, unknown>;
  defaultValue?: string | null;
  sortOrder?: number;
  extractionConfig?: {
    sourceRef?: string | null;
    promptTemplate?: string;
    validationRule?: Record<string, unknown>;
    confidenceThreshold?: number;
    enabled?: boolean;
    version?: number;
    metadata?: Record<string, unknown>;
  };
};

const allowedFieldTypes = new Set([
  "text",
  "number",
  "currency",
  "date",
  "boolean",
  "select",
  "relation",
  "file",
  "image",
  "status",
  "collection",
]);

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function normalizeFieldKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
    return {
      error: Response.json({ error: "Only workspace admins can manage fields." }, { status: 403 }),
    };
  }

  return { user, membership };
}

function mapFieldRow(
  row: Record<string, unknown>,
  extractionConfig?: Record<string, unknown> | null,
) {
  const options = (row.options as Record<string, unknown>) ?? {};
  const normalizedConstraint =
    extractionConfig && typeof extractionConfig === "object" && !Array.isArray(extractionConfig)
      ? {
          ...extractionConfig,
          metadata:
            extractionConfig.metadata && typeof extractionConfig.metadata === "object" && !Array.isArray(extractionConfig.metadata)
              ? extractionConfig.metadata
              : {},
          validationRule:
            extractionConfig.validationRule &&
            typeof extractionConfig.validationRule === "object" &&
            !Array.isArray(extractionConfig.validationRule)
              ? extractionConfig.validationRule
              : {},
        }
      : null;
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    name: String(row.name),
    key: String(row.key),
    type: String(row.type),
    required: Boolean(row.required),
    options,
    defaultValue: row.default_value ? String(row.default_value) : null,
    sortOrder: Number(row.sort_order ?? 0),
    propertyBuilder: buildFieldPropertyBuilder({
      type: String(row.type),
      required: Boolean(row.required),
      options,
      extractionValidationRule: (normalizedConstraint?.validationRule as Record<string, unknown> | undefined) ?? {},
    }),
    extractionConfig: normalizedConstraint,
  };
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as CreateFieldRequest;
    const objectId = payload.objectId?.trim();
    const name = payload.name?.trim();
    const key = (payload.key?.trim() || (name ? normalizeFieldKey(name) : "")).toLowerCase();
    const type = payload.type?.trim().toLowerCase();
    const options: Record<string, unknown> =
      payload.options && typeof payload.options === "object" && !Array.isArray(payload.options)
        ? (payload.options as Record<string, unknown>)
        : {};
    const normalizedOptions = {
      ...options,
      ...(type === "select" || type === "status"
        ? { values: parseFieldOptionValues(options) }
        : {}),
    };
    const required = Boolean(payload.required);
    const defaultValue = payload.defaultValue === undefined ? null : payload.defaultValue;
    const sortOrder = Number.isFinite(payload.sortOrder) ? Number(payload.sortOrder) : null;
    const extractionConfig =
      payload.extractionConfig &&
      typeof payload.extractionConfig === "object" &&
      !Array.isArray(payload.extractionConfig)
        ? payload.extractionConfig
        : null;

    if (!objectId) {
      return Response.json({ error: "objectId is required." }, { status: 400 });
    }
    if (!name) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }
    if (!key) {
      return Response.json({ error: "key is required." }, { status: 400 });
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
      return Response.json({ error: "key can only include lowercase letters, numbers, and underscores." }, { status: 400 });
    }
    if (!type || !allowedFieldTypes.has(type)) {
      return Response.json({ error: "type is invalid." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("workspace_id", authorization.membership.workspaceId)
      .eq("id", objectId)
      .maybeSingle();
    if (objectError) {
      throw new Error(objectError.message);
    }
    if (!objectRow) {
      return Response.json({ error: "Object not found in this workspace." }, { status: 404 });
    }

    let nextSortOrder = sortOrder;
    if (nextSortOrder === null) {
      const { data: maxRow, error: maxError } = await supabase
        .from("workspace_fields")
        .select("sort_order")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("object_id", objectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxError) {
        throw new Error(maxError.message);
      }
      nextSortOrder = Number(maxRow?.sort_order ?? 0) + 1;
    }

    const { data: createdField, error: createError } = await supabase
      .from("workspace_fields")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        object_id: objectId,
        name,
        key,
        type,
        required,
        options: normalizedOptions,
        default_value: defaultValue,
        sort_order: nextSortOrder,
      })
      .select("id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        return Response.json({ error: "A field with this key already exists for this object." }, { status: 409 });
      }
      throw new Error(createError.message);
    }

    let persistedExtractionConfig: Record<string, unknown> | null = null;
    if (extractionConfig) {
      const confidenceThreshold = Number(extractionConfig.confidenceThreshold ?? 0.7);
      const normalizedConstraint = normalizeExtractionConstraint({
        fieldName: name,
        fieldType: type,
        fieldOptions: options,
        validationRule:
          extractionConfig.validationRule &&
          typeof extractionConfig.validationRule === "object" &&
          !Array.isArray(extractionConfig.validationRule)
            ? extractionConfig.validationRule
            : {},
        metadata:
          extractionConfig.metadata &&
          typeof extractionConfig.metadata === "object" &&
          !Array.isArray(extractionConfig.metadata)
            ? extractionConfig.metadata
            : {},
      });
      const { data: configRow, error: configError } = await supabase
        .from("field_extraction_configs")
        .insert({
          workspace_id: authorization.membership.workspaceId,
          object_id: objectId,
          field_id: String(createdField.id),
          source_ref:
            typeof extractionConfig.sourceRef === "string" && extractionConfig.sourceRef.trim().length > 0
              ? extractionConfig.sourceRef.trim()
              : null,
          prompt_template:
            typeof extractionConfig.promptTemplate === "string" ? extractionConfig.promptTemplate : "",
          validation_rule: normalizedConstraint.validationRule,
          confidence_threshold:
            Number.isFinite(confidenceThreshold) && confidenceThreshold >= 0 && confidenceThreshold <= 1
              ? confidenceThreshold
              : 0.7,
          enabled: extractionConfig.enabled !== false,
          version:
            Number.isInteger(extractionConfig.version) && Number(extractionConfig.version) > 0
              ? Number(extractionConfig.version)
              : 1,
          metadata: normalizedConstraint.metadata,
          created_by: authorization.user.id,
          updated_by: authorization.user.id,
        })
        .select(
          "id, source_ref, prompt_template, validation_rule, confidence_threshold, enabled, version, metadata, updated_at",
        )
        .maybeSingle();
      if (configError && configError.code !== "42P01") {
        throw new Error(configError.message);
      }
      if (configRow) {
        persistedExtractionConfig = {
          id: String(configRow.id),
          sourceRef: configRow.source_ref ? String(configRow.source_ref) : null,
          promptTemplate: String(configRow.prompt_template ?? ""),
          validationRule: (configRow.validation_rule as Record<string, unknown>) ?? {},
          confidenceThreshold: Number(configRow.confidence_threshold ?? 0.7),
          enabled: Boolean(configRow.enabled),
          version: Number(configRow.version ?? 1),
          metadata: (configRow.metadata as Record<string, unknown>) ?? {},
          updatedAt: String(configRow.updated_at),
        };
      }
    }

    return Response.json(
      { field: mapFieldRow(createdField as Record<string, unknown>, persistedExtractionConfig) },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create field.";
    return Response.json({ error: message }, { status: 400 });
  }
}
