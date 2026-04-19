"use client";

import type { DocumentPreview, DocumentPreviewSheet } from "./types";

type Props = {
  preview: DocumentPreview | null;
  onReparse?: () => void;
  isReparsing?: boolean;
};

const BAD_HEADER_PATTERN = /^__EMPTY(_\d+)?$/i;
const MAX_HEADER_LEN = 80;

function cleanHeaderLabel(header: string, index: number): string {
  const trimmed = (header ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADER_LEN || BAD_HEADER_PATTERN.test(trimmed)) {
    return `Col ${index + 1}`;
  }
  return trimmed;
}

function looksMalformed(sheet: DocumentPreviewSheet): boolean {
  if (!sheet.headers || sheet.headers.length === 0) return false;
  let bad = 0;
  for (const header of sheet.headers) {
    const trimmed = (header ?? "").trim();
    if (
      trimmed.length === 0
      || trimmed.length > MAX_HEADER_LEN
      || BAD_HEADER_PATTERN.test(trimmed)
    ) {
      bad += 1;
    }
  }
  // Heuristic: more than half the headers are placeholders/too long.
  return bad / sheet.headers.length > 0.5;
}

export function SpreadsheetPreview({ preview, onReparse, isReparsing = false }: Props) {
  if (!preview || !preview.sheets || preview.sheets.length === 0) {
    return (
      <div style={{ padding: 20, color: "var(--workspace-muted)", fontSize: 13 }}>
        Todavia no hay vista previa tabular para este archivo.
      </div>
    );
  }

  const anyMalformed = preview.sheets.some(looksMalformed);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>
      {anyMalformed ? (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            fontSize: 12.5,
            color: "var(--workspace-text)",
          }}
        >
          <span>
            La hoja parece tener un encabezado de título o columnas vacías. Puedes reanalizarla para
            detectar los encabezados correctos.
          </span>
          {onReparse ? (
            <button
              type="button"
              onClick={onReparse}
              disabled={isReparsing}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--workspace-border)",
                background: "var(--workspace-surface)",
                fontSize: 12,
                fontWeight: 500,
                cursor: isReparsing ? "wait" : "pointer",
                color: "var(--workspace-text)",
              }}
            >
              {isReparsing ? "Reanalizando..." : "Reanalizar"}
            </button>
          ) : null}
        </div>
      ) : null}
      {preview.sheets.map((sheet, index) => {
        const displayHeaders = sheet.headers.map((header, idx) => cleanHeaderLabel(header, idx));
        return (
          <div key={`${sheet.name}-${index}`}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{sheet.name}</div>
              <div style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
                {displayHeaders.length} columnas &middot; {sheet.rowCount} filas
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--workspace-border)",
                borderRadius: 10,
                overflow: "auto",
                maxHeight: 360,
                background: "var(--workspace-surface)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {displayHeaders.map((header, hIdx) => (
                      <th
                        key={`${header}-${hIdx}`}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--workspace-border)",
                          background: "var(--workspace-well)",
                          position: "sticky",
                          top: 0,
                          fontWeight: 600,
                          color: "var(--workspace-text)",
                          whiteSpace: "nowrap",
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={header}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.sampleRows.slice(0, 50).map((row, rIdx) => (
                    <tr key={`row-${rIdx}`}>
                      {sheet.headers.map((rawHeader, cIdx) => {
                        const value = row[rawHeader];
                        const text =
                          value == null
                            ? ""
                            : typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value);
                        return (
                          <td
                            key={`cell-${rIdx}-${cIdx}`}
                            style={{
                              padding: "6px 10px",
                              borderBottom: "1px solid var(--workspace-border)",
                              color: "var(--workspace-text)",
                              whiteSpace: "nowrap",
                              maxWidth: 280,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={text}
                          >
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
