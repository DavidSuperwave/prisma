/**
 * `spreadsheet.transform` — apply structured, safe tabular operations to an uploaded
 * spreadsheet/CSV document record (no arbitrary code).
 */

import { registerTool, type ToolContext, type ToolResult } from "../registry";
import { applySpreadsheetOperations, type TransformOperation } from "@/lib/spreadsheet/applyOperations";
import { loadSpreadsheetFromDocumentRecord } from "@/lib/spreadsheet/loadFromRecord";

type TransformArgs = {
  recordId?: string;
  sheetName?: string;
  operations?: unknown[];
  outputFormat?: string;
};

function normalizeOperations(raw: unknown): TransformOperation[] {
  if (!Array.isArray(raw)) return [];
  const out: TransformOperation[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const kind = String(o.kind ?? "");
    if (kind === "filter") {
      out.push({
        kind: "filter",
        field: String(o.field ?? ""),
        op: String(o.op ?? "eq"),
        value: o.value,
      });
    } else if (kind === "sort") {
      out.push({
        kind: "sort",
        field: String(o.field ?? ""),
        direction: o.direction === "desc" ? "desc" : "asc",
      });
    } else if (kind === "map") {
      out.push({
        kind: "map",
        field: String(o.field ?? ""),
        expression: String(o.expression ?? ""),
      });
    } else if (kind === "aggregate") {
      const aop = String(o.op ?? "sum");
      if (!["sum", "avg", "count", "min", "max"].includes(aop)) continue;
      out.push({
        kind: "aggregate",
        field: String(o.field ?? ""),
        op: aop as "sum" | "avg" | "count" | "min" | "max",
      });
    } else if (kind === "formula") {
      out.push({
        kind: "formula",
        outputField: String(o.outputField ?? ""),
        expression: String(o.expression ?? ""),
      });
    }
  }
  return out;
}

registerTool({
  name: "spreadsheet.transform",
  description:
    "Apply safe structured transforms (filter, sort, map, formula with $field math, aggregate) to a previously uploaded CSV/XLSX document record. Use after documents.analyze or when the user references a sheet. Does not run arbitrary code.",
  args: {
    recordId: { type: "string", required: true, description: "Document record id (from attachment)." },
    sheetName: { type: "string", description: "Optional XLSX sheet name; defaults to first sheet." },
    operations: { type: "array", required: true, description: "List of transform steps (see tool description)." },
    outputFormat: {
      type: "string",
      description: 'Optional: "json" (default), "summary", "csv" (first sheet rows only for csv).',
    },
  },
  handler: async (rawArgs, ctx: ToolContext): Promise<ToolResult<Record<string, unknown>>> => {
    const args = rawArgs as TransformArgs;
    const recordId = String(args.recordId ?? "").trim();
    if (!recordId) {
      return { ok: false, error: "recordId is required.", status: 400 };
    }
    const operations = normalizeOperations(args.operations);
    if (operations.length === 0) {
      return { ok: false, error: "operations must be a non-empty array.", status: 400 };
    }
    const loaded = await loadSpreadsheetFromDocumentRecord(
      ctx,
      recordId,
      args.sheetName && String(args.sheetName).trim() ? String(args.sheetName) : null,
    );
    if (!loaded.ok) return loaded;
    const { sheets, documentName } = loaded.data;
    const first = sheets[0]!;
    try {
      const { rows, aggregate, aggregateField } = applySpreadsheetOperations(first.rows, operations);
      const format = String(args.outputFormat ?? "json").toLowerCase();
      if (format === "summary") {
        return {
          ok: true,
          data: {
            documentName,
            recordId,
            sheetName: first.sheetName,
            rowCount: rows.length,
            aggregate: aggregateField !== null ? { field: aggregateField, value: aggregate } : null,
          },
        };
      }
      if (format === "csv" && first.headers.length > 0) {
        const header = first.headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(",");
        const lines = rows.map((r) =>
          first.headers
            .map((h) => {
              const v = r[h];
              const cell = v === null || v === undefined ? "" : String(v);
              return `"${cell.replace(/"/g, '""')}"`;
            })
            .join(","),
        );
        return {
          ok: true,
          data: {
            documentName,
            recordId,
            sheetName: first.sheetName,
            csv: [header, ...lines].join("\n"),
            rowCount: rows.length,
            aggregate: aggregateField !== null ? { field: aggregateField, value: aggregate } : null,
          },
        };
      }
      return {
        ok: true,
        data: {
          documentName,
          recordId,
          sheetName: first.sheetName,
          headers: first.headers,
          rows,
          rowCount: rows.length,
          aggregate: aggregateField !== null ? { field: aggregateField, value: aggregate } : null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transform failed.";
      return { ok: false, error: message, status: 400 };
    }
  },
});
