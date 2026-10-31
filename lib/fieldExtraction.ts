type ExtractionNormalizationInput = {
  fieldName?: string | null;
  fieldType?: string | null;
  fieldOptions?: Record<string, unknown> | null;
  validationRule?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeEnumValue(entry: unknown): string | null {
  if (typeof entry === "string" || typeof entry === "number") {
    const value = String(entry).trim();
    return value.length > 0 ? value : null;
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const candidates = [record.value, record.id, record.key, record.label, record.name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" || typeof candidate === "number") {
      const value = String(candidate).trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

export function extractSingleSelectEnumValues(
  fieldType: string | null | undefined,
  fieldOptions: Record<string, unknown> | null | undefined,
): string[] {
  if (fieldType !== "select" && fieldType !== "status") return [];
  const options = asObject(fieldOptions);
  if (options.multiple === true) return [];
  const raw = Array.isArray(options.values)
    ? options.values
    : Array.isArray(options.options)
      ? options.options
      : [];
  const out: string[] = [];
  for (const entry of raw) {
    const normalized = normalizeEnumValue(entry);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

export function normalizeExtractionConstraint(input: ExtractionNormalizationInput) {
  const validationRule = asObject(input.validationRule);
  const metadata = asObject(input.metadata);
  const enumValues = extractSingleSelectEnumValues(input.fieldType, input.fieldOptions);
  if (enumValues.length === 0) {
    return {
      validationRule,
      metadata,
      enumValues,
      constrained: false,
    };
  }

  const title = typeof input.fieldName === "string" && input.fieldName.trim() ? input.fieldName.trim() : undefined;
  return {
    validationRule: {
      ...validationRule,
      type: "string",
      enum: enumValues,
      ...(title ? { title } : {}),
      "x-prisma-field-type": input.fieldType ?? "select",
      "x-prisma-constrained": true,
    },
    metadata: {
      ...metadata,
      property_builder: {
        ...(asObject(metadata.property_builder)),
        type: "single_select",
        enumValues,
      },
      constrained_output: {
        kind: "json_schema_enum",
        enumValues,
      },
    },
    enumValues,
    constrained: true,
  };
}
