/**
 * Record provenance helper.
 *
 * When a write originates from a document (e.g. a PDF promo sheet), the
 * platform records that fact inside the target record's `data.provenance`
 * array so future readers can tell where a value came from. The array is
 * append-only, capped, and lives inside the existing JSONB `data` column —
 * no schema changes required.
 */

const PROVENANCE_KEY = "provenance";
const MAX_ENTRIES = 20;

export type ProvenanceEntry = {
  kind: "document";
  recordId: string;
  at: string;
  action?: string;
  note?: string;
};

function readExistingEntries(data: Record<string, unknown>): ProvenanceEntry[] {
  const raw = data[PROVENANCE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is ProvenanceEntry => {
    if (!entry || typeof entry !== "object") return false;
    const obj = entry as Record<string, unknown>;
    return (
      obj.kind === "document" &&
      typeof obj.recordId === "string" &&
      typeof obj.at === "string"
    );
  });
}

export function appendDocumentProvenance(
  data: Record<string, unknown>,
  sourceDocumentId: string,
  action?: string,
  note?: string,
): Record<string, unknown> {
  if (!sourceDocumentId) return data;
  const existing = readExistingEntries(data);
  const next: ProvenanceEntry = {
    kind: "document",
    recordId: sourceDocumentId,
    at: new Date().toISOString(),
    ...(action ? { action } : {}),
    ...(note ? { note } : {}),
  };
  const merged = [...existing, next].slice(-MAX_ENTRIES);
  return { ...data, [PROVENANCE_KEY]: merged };
}
