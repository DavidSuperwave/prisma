"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { PrismaWorkspaceField, PrismaWorkspaceRecord } from "@/lib/workspaceStore";
import { getRecordFieldValue } from "@/lib/workspaceStore";

export type EditableGridProps = {
  fields: PrismaWorkspaceField[];
  records: PrismaWorkspaceRecord[];
  canWrite: boolean;
  formatStatusLabel: (value: string) => string;
  onPatchRecord: (record: PrismaWorkspaceRecord, data: Record<string, unknown>) => Promise<void>;
  onDeleteRecord: (recordId: string) => void;
  onInlineCreate?: (draft: Record<string, unknown>) => Promise<void>;
  onOpenRecord?: (recordId: string) => void;
  canRenameColumns?: boolean;
  onRenameField?: (fieldId: string, nextName: string) => Promise<void>;
  onHeaderAddRow?: () => void;
};

function parseSelectOptions(field: PrismaWorkspaceField): string[] {
  const raw = Array.isArray(field.options.values)
    ? field.options.values
    : Array.isArray(field.options.options)
      ? field.options.options
      : [];
  return raw.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function normalizeFieldValue(field: PrismaWorkspaceField, value: unknown): unknown {
  if (field.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return Boolean(value);
  }
  if (value === null || value === undefined) {
    return field.required ? "" : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return field.required ? "" : null;
    if (field.type === "number" || field.type === "currency") {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : trimmed;
    }
    return trimmed;
  }
  if ((field.type === "number" || field.type === "currency") && typeof value === "number") {
    return Number.isFinite(value) ? value : field.required ? "" : null;
  }
  return value;
}

export function EditableGrid({
  fields,
  records,
  canWrite,
  formatStatusLabel,
  onPatchRecord,
  onDeleteRecord,
  onInlineCreate,
  onOpenRecord,
  canRenameColumns = false,
  onRenameField,
  onHeaderAddRow,
}: EditableGridProps) {
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldKey: string } | null>(null);
  const [editingValue, setEditingValue] = useState<unknown>("");
  const [inlineDraftKey, setInlineDraftKey] = useState(0);
  const [newRowValue, setNewRowValue] = useState("");
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [editingHeaderValue, setEditingHeaderValue] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const canRename = canRenameColumns && Boolean(onRenameField);

  function startRenameHeader(field: PrismaWorkspaceField) {
    if (!canRename || field.isLocked) return;
    setEditingHeaderId(field.id);
    setEditingHeaderValue(field.name);
  }

  function cancelRenameHeader() {
    setEditingHeaderId(null);
    setEditingHeaderValue("");
  }

  async function commitRenameHeader(field: PrismaWorkspaceField) {
    const trimmed = editingHeaderValue.trim();
    if (!onRenameField) {
      cancelRenameHeader();
      return;
    }
    if (!trimmed || trimmed === field.name) {
      cancelRenameHeader();
      return;
    }
    setRenamingId(field.id);
    try {
      await onRenameField(field.id, trimmed);
    } finally {
      setRenamingId(null);
      cancelRenameHeader();
    }
  }

  const firstTextField =
    fields.find((field) => field.type === "text") ??
    fields.find((field) => field.type !== "boolean") ??
    fields[0] ??
    null;

  const statusHeaderFieldId =
    onHeaderAddRow
      ? (fields.find((field) => field.type === "status") ?? fields.find((field) => field.key === "status"))?.id ?? null
      : null;

  function startEdit(record: PrismaWorkspaceRecord, field: PrismaWorkspaceField) {
    if (!canWrite) return;
    const rawValue = getRecordFieldValue(record, field.key);
    setEditingCell({ recordId: record.id, fieldKey: field.key });
    if (field.type === "boolean") {
      setEditingValue(Boolean(rawValue));
      return;
    }
    setEditingValue(rawValue === null || rawValue === undefined ? "" : String(rawValue));
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditingValue("");
  }

  async function commitEdit(record: PrismaWorkspaceRecord, field: PrismaWorkspaceField) {
    const next = normalizeFieldValue(field, editingValue);
    const existing = record.data[field.key];
    if (JSON.stringify(existing) === JSON.stringify(next)) {
      cancelEdit();
      return;
    }
    const nextData = { ...record.data, [field.key]: next };
    try {
      await onPatchRecord(record, nextData);
    } finally {
      cancelEdit();
    }
  }

  async function submitNewRow() {
    if (!onInlineCreate || !firstTextField || !newRowValue.trim()) return;
    const draft: Record<string, unknown> = { [firstTextField.key]: newRowValue.trim() };
    await onInlineCreate(draft);
    setNewRowValue("");
    setInlineDraftKey((k) => k + 1);
  }

  function handleNewRowKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitNewRow();
    } else if (event.key === "Escape") {
      setNewRowValue("");
    }
  }

  return (
    <div style={wrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {fields.map((field) => {
              const isEditingHeader = editingHeaderId === field.id;
              const isRenamable = canRename && !field.isLocked;
              const isSaving = renamingId === field.id;
              const showHeaderAdd = statusHeaderFieldId === field.id;
              return (
                <th key={field.id} style={thStyle}>
                  <div style={headerCellStyle}>
                  {isEditingHeader ? (
                    <input
                      className="ws-input"
                      autoFocus
                      value={editingHeaderValue}
                      disabled={isSaving}
                      onChange={(event) => setEditingHeaderValue(event.target.value)}
                      onBlur={() => void commitRenameHeader(field)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRenameHeader();
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      style={headerInputStyle}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRenameHeader(field)}
                      disabled={!isRenamable}
                      aria-label={
                        isRenamable
                          ? `Renombrar columna ${field.name}`
                          : field.isLocked
                            ? `${field.name} (bloqueada)`
                            : field.name
                      }
                      title={
                        isRenamable
                          ? "Clic para renombrar esta columna"
                          : field.isLocked
                            ? "Columna bloqueada por el sistema"
                            : undefined
                      }
                      style={isRenamable ? headerButtonStyle : headerButtonLockedStyle}
                    >
                      <span>{field.name}</span>
                      {field.required ? <span style={requiredStarStyle}> *</span> : null}
                      {isRenamable ? (
                        <Pencil size={11} aria-hidden style={headerPencilStyle} />
                      ) : null}
                    </button>
                  )}
                  {showHeaderAdd && onHeaderAddRow ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onHeaderAddRow();
                      }}
                      aria-label="Nuevo registro"
                      title="Nuevo registro"
                      style={headerAddButtonStyle}
                    >
                      <Plus size={12} aria-hidden />
                    </button>
                  ) : null}
                  </div>
                </th>
              );
            })}
            {canWrite ? <th style={{ ...thStyle, width: 80 }}>Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              style={onOpenRecord ? clickableRowStyle : undefined}
              onClick={() => {
                if (editingCell) return;
                if (onOpenRecord) onOpenRecord(record.id);
              }}
            >
              {fields.map((field) => {
                const rawValue = getRecordFieldValue(record, field.key);
                const isEditing =
                  editingCell?.recordId === record.id && editingCell.fieldKey === field.key;
                const options = parseSelectOptions(field);

                return (
                  <td
                    key={`${record.id}-${field.id}`}
                    style={tdStyle}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!canWrite) {
                        if (onOpenRecord) onOpenRecord(record.id);
                        return;
                      }
                      if (!isEditing) startEdit(record, field);
                    }}
                  >
                    {isEditing ? (
                      field.type === "status" || field.type === "select" ? (
                        <select
                          className="ws-input"
                          autoFocus
                          value={String(editingValue ?? "")}
                          onChange={(event) => setEditingValue(event.target.value)}
                          onBlur={() => void commitEdit(record, field)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelEdit();
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                          style={cellInputStyle}
                        >
                          <option value="">Sin valor</option>
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {formatStatusLabel(option)}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "boolean" ? (
                        <select
                          className="ws-input"
                          autoFocus
                          value={String(Boolean(editingValue))}
                          onChange={(event) => setEditingValue(event.target.value === "true")}
                          onBlur={() => void commitEdit(record, field)}
                          style={cellInputStyle}
                        >
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          className="ws-input"
                          autoFocus
                          type={
                            field.type === "number" || field.type === "currency"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : "text"
                          }
                          value={String(editingValue ?? "")}
                          onChange={(event) => setEditingValue(event.target.value)}
                          onBlur={() => void commitEdit(record, field)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelEdit();
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                          style={cellInputStyle}
                        />
                      )
                    ) : (
                      <CellDisplay
                        field={field}
                        value={rawValue}
                        formatStatusLabel={formatStatusLabel}
                      />
                    )}
                  </td>
                );
              })}
              {canWrite ? (
                <td style={{ ...tdStyle, width: 80 }} onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    style={rowDeleteButtonStyle}
                    onClick={() => onDeleteRecord(record.id)}
                    aria-label="Eliminar registro"
                    title="Eliminar registro"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {canWrite && onInlineCreate && firstTextField ? (
            <tr>
              <td colSpan={fields.length + 1} style={inlineAddRowStyle}>
                <input
                  key={inlineDraftKey}
                  type="text"
                  value={newRowValue}
                  onChange={(event) => setNewRowValue(event.target.value)}
                  onKeyDown={handleNewRowKey}
                  placeholder={`+ Agregar registro (escribe ${firstTextField.name.toLowerCase()} y presiona Enter)`}
                  style={inlineAddInputStyle}
                />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CellDisplay({
  field,
  value,
  formatStatusLabel,
}: {
  field: PrismaWorkspaceField;
  value: unknown;
  formatStatusLabel: (value: string) => string;
}) {
  if (field.type === "boolean") {
    return <span>{Boolean(value) ? "Sí" : "No"}</span>;
  }
  if ((field.type === "status" || field.type === "select") && value) {
    return <span style={statusPillStyle}>{formatStatusLabel(String(value))}</span>;
  }
  if (field.key === "status" && value) {
    return <span style={statusPillStyle}>{formatStatusLabel(String(value))}</span>;
  }
  if (field.type === "currency" && value !== null && value !== undefined && value !== "") {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return (
        <span>
          {num.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
        </span>
      );
    }
  }
  if (value === null || value === undefined || String(value).length === 0) {
    return <span style={emptyCellStyle}>—</span>;
  }
  return <span>{String(value)}</span>;
}

const wrapStyle: CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.04)",
  overflow: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 720,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  padding: "12px 14px",
  borderBottom: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface-muted, #f8f9fc)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const requiredStarStyle: CSSProperties = {
  color: "#b91c1c",
  marginLeft: 2,
};

const headerCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
};

const headerAddButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  color: "var(--workspace-accent-strong, #2563eb)",
  cursor: "pointer",
  padding: 0,
  marginLeft: "auto",
};

const headerButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 0,
  margin: 0,
  background: "transparent",
  border: "none",
  color: "inherit",
  font: "inherit",
  letterSpacing: "inherit",
  textTransform: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const headerButtonLockedStyle: CSSProperties = {
  ...headerButtonStyle,
  cursor: "default",
};

const headerPencilStyle: CSSProperties = {
  opacity: 0.35,
  color: "var(--workspace-muted)",
};

const headerInputStyle: CSSProperties = {
  width: "100%",
  height: 30,
  padding: "0 8px",
  border: "1px solid var(--workspace-accent-strong, #2563eb)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "#ffffff",
  outline: "none",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
  textTransform: "none",
  letterSpacing: "normal",
  color: "var(--workspace-text)",
  fontWeight: 600,
};

const tdStyle: CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  fontSize: 13,
  verticalAlign: "middle",
};

const clickableRowStyle: CSSProperties = { cursor: "pointer" };

const cellInputStyle: CSSProperties = {
  width: "100%",
  height: 30,
  padding: "0 8px",
  border: "1px solid var(--workspace-accent-strong, #2563eb)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "#ffffff",
  outline: "none",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
};

const statusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  padding: "3px 10px",
  fontSize: 12,
  fontWeight: 600,
  background: "var(--workspace-surface-muted, #f1f3f8)",
};

const emptyCellStyle: CSSProperties = {
  color: "var(--workspace-faint, #94a3b8)",
};

const rowDeleteButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "1px solid var(--workspace-border)",
  borderRadius: 6,
  background: "#ffffff",
  color: "#b91c1c",
  cursor: "pointer",
  fontFamily: "inherit",
};

const inlineAddRowStyle: CSSProperties = {
  padding: 0,
  borderTop: "1px dashed var(--workspace-border)",
  background: "var(--workspace-surface-muted, #f8f9fc)",
};

const inlineAddInputStyle: CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 14px",
  border: "none",
  background: "transparent",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--workspace-text)",
  outline: "none",
};
