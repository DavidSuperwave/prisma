"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, Download, Trash2, Workflow, UserCheck, Tag, Edit3, X } from "lucide-react";

export type BulkEntity = "people" | "companies" | "deals";

export type BulkActionField = {
  key: string;
  name: string;
  type: string;
  options?: string[];
};

type Props = {
  workspaceSlug: string;
  entity: BulkEntity;
  selectedIds: string[];
  editableFields: BulkActionField[];
  stageOptions?: Array<{ value: string; label: string }>;
  onClear: () => void;
  onCompleted: () => void;
  sequencesAvailable?: boolean;
  records: Array<{ id: string; data: Record<string, unknown> }>;
  canDelete?: boolean;
};

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 14px",
  background: "var(--workspace-accent-soft)",
  border: "1px solid rgba(51, 92, 255, 0.18)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  color: "var(--workspace-accent-strong)",
  fontWeight: 500,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--workspace-accent-strong)",
  background: "#ffffff",
  border: "1px solid rgba(51, 92, 255, 0.25)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const disabledActionStyle: CSSProperties = {
  ...actionButtonStyle,
  color: "var(--workspace-muted)",
  background: "#f3f4f6",
  borderColor: "var(--workspace-border)",
  cursor: "not-allowed",
};

const dangerActionStyle: CSSProperties = {
  ...actionButtonStyle,
  color: "var(--workspace-danger)",
  borderColor: "var(--workspace-danger-border)",
  background: "var(--workspace-danger-soft)",
};

const dropdownStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  padding: 10,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.08)",
  minWidth: 240,
  zIndex: 10,
};

const inputStyle: CSSProperties = {
  height: 30,
  width: "100%",
  padding: "4px 8px",
  fontSize: 12,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "inherit",
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

function encodeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return "\"" + text.replaceAll("\"", "\"\"") + "\"";
  }
  return text;
}

export function BulkActionBar({
  workspaceSlug,
  entity,
  selectedIds,
  editableFields,
  stageOptions,
  onClear,
  onCompleted,
  sequencesAvailable,
  records,
  canDelete = true,
}: Props) {
  const [openMenu, setOpenMenu] = useState<null | "field" | "stage" | "owner" | "sequence">(null);
  const [selectedField, setSelectedField] = useState<string>(editableFields[0]?.key ?? "");
  const [fieldValue, setFieldValue] = useState<string>("");
  const [stageValue, setStageValue] = useState<string>("");
  const [ownerValue, setOwnerValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordMap = useMemo(() => new Map(records.map((r) => [r.id, r] as const)), [records]);

  async function runBulk(operation: { type: string; payload: Record<string, unknown> }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/crm/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          recordIds: selectedIds,
          operation,
        }),
      });
      const json = (await res.json()) as {
        updated?: number;
        errors?: Array<{ id: string; message: string }>;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "La operación falló.");
        return;
      }
      setOpenMenu(null);
      onCompleted();
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    const headerFields = editableFields.length > 0 ? editableFields : [{ key: "name", name: "Nombre", type: "text" }];
    const headers = ["id", ...headerFields.map((f) => f.key)];
    const rows = selectedIds
      .map((id) => recordMap.get(id))
      .filter((row): row is { id: string; data: Record<string, unknown> } => Boolean(row));
    const lines = [
      headers.join(","),
      ...rows.map((row) =>
        [row.id, ...headerFields.map((f) => encodeCsvValue(row.data[f.key]))].join(","),
      ),
    ];
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entity}-seleccionados.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeField = editableFields.find((f) => f.key === selectedField);

  return (
    <div style={{ position: "relative" }}>
      <div style={barStyle}>
        <span>
          {selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}
        </span>
        <div style={actionsStyle}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "field" ? null : "field")}
              style={actionButtonStyle}
            >
              <Edit3 size={12} /> Actualizar campo <ChevronDown size={10} />
            </button>
            {openMenu === "field" ? (
              <div style={dropdownStyle}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <select
                    value={selectedField}
                    onChange={(event) => setSelectedField(event.target.value)}
                    style={inputStyle}
                  >
                    {editableFields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                  {activeField?.options && activeField.options.length > 0 ? (
                    <select
                      value={fieldValue}
                      onChange={(event) => setFieldValue(event.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Selecciona…</option>
                      {activeField.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={(event) => setFieldValue(event.target.value)}
                      placeholder="Nuevo valor"
                      style={inputStyle}
                    />
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={actionButtonStyle}
                      disabled={busy || !selectedField}
                      onClick={() =>
                        runBulk({ type: "update_field", payload: { field: selectedField, value: fieldValue } })
                      }
                    >
                      Aplicar
                    </button>
                    <button type="button" style={ghostButtonStyle} onClick={() => setOpenMenu(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {stageOptions && stageOptions.length > 0 ? (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === "stage" ? null : "stage")}
                style={actionButtonStyle}
              >
                <Tag size={12} /> Cambiar etapa <ChevronDown size={10} />
              </button>
              {openMenu === "stage" ? (
                <div style={dropdownStyle}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <select
                      value={stageValue}
                      onChange={(event) => setStageValue(event.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Selecciona etapa…</option>
                      {stageOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        style={actionButtonStyle}
                        disabled={busy || !stageValue}
                        onClick={() => runBulk({ type: "change_stage", payload: { stage: stageValue } })}
                      >
                        Aplicar
                      </button>
                      <button type="button" style={ghostButtonStyle} onClick={() => setOpenMenu(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "owner" ? null : "owner")}
              style={actionButtonStyle}
            >
              <UserCheck size={12} /> Cambiar owner <ChevronDown size={10} />
            </button>
            {openMenu === "owner" ? (
              <div style={dropdownStyle}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    value={ownerValue}
                    onChange={(event) => setOwnerValue(event.target.value)}
                    placeholder="ID de usuario"
                    style={inputStyle}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={actionButtonStyle}
                      disabled={busy || !ownerValue}
                      onClick={() =>
                        runBulk({ type: "change_owner", payload: { owner_user_id: ownerValue } })
                      }
                    >
                      Aplicar
                    </button>
                    <button type="button" style={ghostButtonStyle} onClick={() => setOpenMenu(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button type="button" style={actionButtonStyle} onClick={handleExportCsv}>
            <Download size={12} /> Exportar CSV
          </button>

          <button
            type="button"
            style={sequencesAvailable ? actionButtonStyle : disabledActionStyle}
            disabled={!sequencesAvailable}
            title={sequencesAvailable ? "Enrolar en secuencia" : "Disponible con M11 secuencias"}
            onClick={() => setOpenMenu(openMenu === "sequence" ? null : "sequence")}
          >
            <Workflow size={12} /> Enrolar en secuencia
          </button>

          {canDelete ? (
            <button
              type="button"
              style={dangerActionStyle}
              disabled={busy}
              onClick={() => {
                if (confirm(`¿Eliminar ${selectedIds.length} registros?`)) {
                  runBulk({ type: "delete", payload: {} });
                }
              }}
            >
              <Trash2 size={12} /> Eliminar
            </button>
          ) : null}

          <button type="button" style={ghostButtonStyle} onClick={onClear}>
            <X size={12} /> Limpiar
          </button>
        </div>
      </div>
      {error ? (
        <p style={{ margin: "6px 2px 0", fontSize: 12, color: "var(--workspace-danger)" }}>{error}</p>
      ) : null}
    </div>
  );
}
