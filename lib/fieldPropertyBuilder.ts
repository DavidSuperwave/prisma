export type FieldPropertyBuilder = {
  kind:
    | "text"
    | "number"
    | "currency"
    | "date"
    | "boolean"
    | "single_select"
    | "multi_select"
    | "status"
    | "relation"
    | "file"
    | "collection";
  fieldType: string;
  required: boolean;
  format?: string;
  enumValues?: string[];
  multiple?: boolean;
  relationKind?: string;
  childObjectId?: string;
  childFieldMap?: Record<string, string>;
  constrainedOutput?: {
    kind: "json_schema_enum";
    enumValues: string[];
  } | null;
};

function normalizeEnumValue(entry: unknown): string | null {
  if (typeof entry === "string" || typeof entry === "number") {
    const value = String(entry).trim();
    return value.length > 0 ? value : null;
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  for (const candidate of [record.value, record.id, record.key, record.label, record.name]) {
    if (typeof candidate === "string" || typeof candidate === "number") {
      const value = String(candidate).trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

export function parseFieldOptionValues(options: Record<string, unknown> | null | undefined): string[] {
  if (!options || typeof options !== "object" || Array.isArray(options)) return [];
  const raw = Array.isArray(options.values)
    ? options.values
    : Array.isArray(options.options)
      ? options.options
      : [];
  const values: string[] = [];
  for (const entry of raw) {
    const normalized = normalizeEnumValue(entry);
    if (!normalized || values.includes(normalized)) continue;
    values.push(normalized);
  }
  return values;
}

export function buildFieldPropertyBuilder(input: {
  type: string;
  required: boolean;
  options?: Record<string, unknown> | null;
  extractionValidationRule?: Record<string, unknown> | null;
}): FieldPropertyBuilder {
  const options =
    input.options && typeof input.options === "object" && !Array.isArray(input.options)
      ? input.options
      : {};
  const extractionValidationRule =
    input.extractionValidationRule &&
    typeof input.extractionValidationRule === "object" &&
    !Array.isArray(input.extractionValidationRule)
      ? input.extractionValidationRule
      : {};
  const enumValues = parseFieldOptionValues(options);
  const constrainedEnumValues = Array.isArray(extractionValidationRule.enum)
    ? extractionValidationRule.enum.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  switch (input.type) {
    case "select":
      return {
        kind: options.multiple === true ? "multi_select" : "single_select",
        fieldType: input.type,
        required: input.required,
        enumValues,
        multiple: options.multiple === true,
        constrainedOutput:
          constrainedEnumValues.length > 0
            ? { kind: "json_schema_enum", enumValues: constrainedEnumValues }
            : null,
      };
    case "status":
      return {
        kind: "status",
        fieldType: input.type,
        required: input.required,
        enumValues,
        constrainedOutput:
          constrainedEnumValues.length > 0
            ? { kind: "json_schema_enum", enumValues: constrainedEnumValues }
            : null,
      };
    case "number":
      return {
        kind: "number",
        fieldType: input.type,
        required: input.required,
      };
    case "currency":
      return {
        kind: "currency",
        fieldType: input.type,
        required: input.required,
      };
    case "date":
      return {
        kind: "date",
        fieldType: input.type,
        required: input.required,
        format: options.time === true ? "datetime" : "date",
      };
    case "boolean":
      return {
        kind: "boolean",
        fieldType: input.type,
        required: input.required,
      };
    case "relation":
      return {
        kind: "relation",
        fieldType: input.type,
        required: input.required,
        relationKind: typeof options.relation_kind === "string" ? options.relation_kind : undefined,
      };
    case "file":
      return {
        kind: "file",
        fieldType: input.type,
        required: input.required,
        format: typeof options.format === "string" ? options.format : undefined,
      };
    case "collection":
      return {
        kind: "collection",
        fieldType: input.type,
        required: input.required,
        childObjectId: typeof options.child_object_id === "string" ? options.child_object_id : undefined,
        childFieldMap:
          options.child_field_map &&
          typeof options.child_field_map === "object" &&
          !Array.isArray(options.child_field_map)
            ? (options.child_field_map as Record<string, string>)
            : undefined,
      };
    default:
      return {
        kind: "text",
        fieldType: input.type,
        required: input.required,
        format: typeof options.format === "string" ? options.format : undefined,
      };
  }
}
