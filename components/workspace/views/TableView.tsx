"use client";

import type { PrismaWorkspaceField, PrismaWorkspaceRecord } from "@/lib/workspaceStore";
import type { CSSProperties } from "react";

type TableViewProps = {
  records: PrismaWorkspaceRecord[];
  fields: PrismaWorkspaceField[];
  canWrite: boolean;
  editingCell: { recordId: string; fieldKey: string } | null;
  editingValue: unknown;
  isDeletingRecord: boolean;
  recordBaseHref?: string;
  objectId?: string;
  getRecordFieldValue: (record: PrismaWorkspaceRecord, key: string) => unknown;
  parseSelectOptions: (field: PrismaWorkspaceField) => string[];
  formatStatusLabel: (value: string) => string;
  onStartInlineEdit: (record: PrismaWorkspaceRecord, field: PrismaWorkspaceField) => void;
  onSaveInlineEdit: (record: PrismaWorkspaceRecord, field: PrismaWorkspaceField) => Promise<void>;
  onCancelInlineEdit: () => void;
  onEditingValueChange: (value: unknown) => void;
  onDeleteClick: (recordId: string) => void;
};

export function TableView({
  records,
  fields,
  canWrite,
  editingCell,
  editingValue,
  isDeletingRecord,
  recordBaseHref,
  objectId,
  getRecordFieldValue,
  parseSelectOptions,
  formatStatusLabel,
  onStartInlineEdit,
  onSaveInlineEdit,
  onCancelInlineEdit,
  onEditingValueChange,
  onDeleteClick,
}: TableViewProps) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field.id} style={tableHeadStyle}>
                <span>{field.name}</span>
              </th>
            ))}
            {canWrite ? <th style={tableHeadStyle}>Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              style={recordBaseHref ? clickableRowStyle : undefined}
              onClick={() => {
                if (!recordBaseHref || !objectId || editingCell) return;
                window.location.href = `${recordBaseHref}&object=${objectId}&record=${record.id}`;
              }}
            >
              {fields.map((field) => {
                const value = getRecordFieldValue(record, field.key);
                const isEditing = editingCell?.recordId === record.id && editingCell.fieldKey === field.key;
                const options = parseSelectOptions(field);

                return (
                  <td
                    key={`${record.id}-${field.id}`}
                    style={tableCellStyle}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!canWrite) return;
                      onStartInlineEdit(record, field);
                    }}
                  >
                    {isEditing ? (
                      field.type === "status" || field.type === "select" ? (
                        <select
                          autoFocus
                          value={String(editingValue ?? "")}
                          onChange={(event) => onEditingValueChange(event.target.value)}
                          onBlur={() => void onSaveInlineEdit(record, field)}
                          style={inlineInputStyle}
                        >
                          <option value="">Selecciona</option>
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {formatStatusLabel(option)}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "boolean" ? (
                        <select
                          autoFocus
                          value={String(Boolean(editingValue))}
                          onChange={(event) => onEditingValueChange(event.target.value === "true")}
                          onBlur={() => void onSaveInlineEdit(record, field)}
                          style={inlineInputStyle}
                        >
                          <option value="true">Si</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          autoFocus
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          value={String(editingValue ?? "")}
                          onChange={(event) => onEditingValueChange(event.target.value)}
                          onBlur={() => void onSaveInlineEdit(record, field)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") onCancelInlineEdit();
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                          style={inlineInputStyle}
                        />
                      )
                    ) : field.key === "status" ? (
                      <span style={statusPillStyle}>{formatStatusLabel(String(value ?? "-"))}</span>
                    ) : field.type === "boolean" ? (
                      <span>{Boolean(value) ? "Si" : "No"}</span>
                    ) : (
                      <span>{value !== null && value !== undefined && String(value).length > 0 ? String(value) : "-"}</span>
                    )}
                  </td>
                );
              })}
              {canWrite ? (
                <td style={tableCellStyle} onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    style={dangerButtonStyle}
                    onClick={() => onDeleteClick(record.id)}
                    disabled={isDeletingRecord}
                  >
                    Eliminar
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tableWrapStyle: CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 20,
  background: "var(--workspace-surface)",
  boxShadow: "var(--workspace-shadow)",
  overflow: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 760,
};

const tableHeadStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--workspace-faint)",
  padding: "14px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  background: "var(--workspace-well)",
};

const tableCellStyle: CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  fontSize: 14,
  verticalAlign: "middle",
};

const clickableRowStyle: CSSProperties = { cursor: "pointer" };

const inlineInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "8px 10px",
  fontSize: 13,
};

const statusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 600,
};

const dangerButtonStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--workspace-danger-border)",
  background: "var(--workspace-danger-soft)",
  color: "var(--workspace-danger)",
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 10px",
  cursor: "pointer",
};
