"use client";

import { useState, type CSSProperties } from "react";
import { Upload, X } from "lucide-react";

export type ImportDialogMode = "skip" | "update" | "upsert";

export type ImportDialogProps = {
  workspaceSlug: string;
  objectId: string;
  objectKind?: "crm_people" | "crm_companies" | "crm_deals" | null;
  availableFieldKeys: Array<{ key: string; name: string }>;
  fileName: string;
  rows: Array<Record<string, unknown>>;
  onClose: () => void;
  onDone?: (summary: ImportResultSummary) => void;
};

type ImportResultSummary = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
};

const MODE_LABELS: Record<ImportDialogMode, string> = {
  skip: "Omitir duplicados",
  update: "Actualizar si existe",
  upsert: "Insertar o actualizar",
};

const KIND_DEFAULT_KEY: Record<string, string> = {
  crm_people: "email",
  crm_companies: "domain",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--workspace-border)",
  padding: 20,
  width: "min(560px, 92vw)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flex: "1 1 180px",
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const selectStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const helperTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#b91c1c",
};

export function ImportDialog({
  workspaceSlug,
  objectId,
  objectKind,
  availableFieldKeys,
  fileName,
  rows,
  onClose,
  onDone,
}: ImportDialogProps) {
  const defaultDedupe =
    (objectKind && KIND_DEFAULT_KEY[objectKind]) ||
    availableFieldKeys[0]?.key ||
    "";
  const [mode, setMode] = useState<ImportDialogMode>("skip");
  const [dedupeKey, setDedupeKey] = useState<string>(defaultDedupe);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectId,
          rows,
          fileName,
          mode,
          dedupeKey: dedupeKey || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        inserted?: number;
        updated?: number;
        skipped?: number;
        errors?: unknown[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo importar.");
      }
      onDone?.({
        inserted: payload.inserted ?? 0,
        updated: payload.updated ?? 0,
        skipped: payload.skipped ?? 0,
        errors: Array.isArray(payload.errors) ? payload.errors.length : 0,
      });
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Error de red.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modeHint =
    objectKind && mode !== "skip"
      ? `Modo: ${MODE_LABELS[mode]} (por ${dedupeKey || KIND_DEFAULT_KEY[objectKind] || ""})`
      : null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={panelStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Importar {fileName}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--workspace-muted)",
            }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <p style={helperTextStyle}>{rows.length} filas listas para procesar.</p>
        <div style={rowStyle}>
          <label style={fieldStyle}>
            Modo
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ImportDialogMode)}
              style={selectStyle}
            >
              <option value="skip">{MODE_LABELS.skip}</option>
              <option value="update">{MODE_LABELS.update}</option>
              <option value="upsert">{MODE_LABELS.upsert}</option>
            </select>
          </label>
          <label style={fieldStyle}>
            Campo clave
            <select
              value={dedupeKey}
              onChange={(event) => setDedupeKey(event.target.value)}
              style={selectStyle}
            >
              <option value="">Sin clave</option>
              {availableFieldKeys.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {modeHint ? <p style={helperTextStyle}>{modeHint}</p> : null}
        {error ? <p style={errorStyle}>{error}</p> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={ghostButtonStyle}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              ...primaryButtonStyle,
              opacity: isSubmitting ? 0.6 : 1,
              cursor: isSubmitting ? "wait" : "pointer",
            }}
          >
            <Upload size={14} />
            {isSubmitting ? "Importando…" : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
