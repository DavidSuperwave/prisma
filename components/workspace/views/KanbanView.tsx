"use client";

import type { PrismaWorkspaceField, PrismaWorkspaceRecord } from "@/lib/workspaceStore";
import type { CSSProperties } from "react";

type BoardColumn = {
  key: string;
  value: string | null;
  label: string;
  records: PrismaWorkspaceRecord[];
};

type KanbanViewProps = {
  columns: BoardColumn[];
  canWrite: boolean;
  draggingRecordId: string | null;
  boardGroupField: PrismaWorkspaceField | null;
  boardPrimaryField: PrismaWorkspaceField | null;
  boardSecondaryFields: PrismaWorkspaceField[];
  recordBaseHref?: string;
  objectId?: string;
  getRecordFieldValue: (record: PrismaWorkspaceRecord, key: string) => unknown;
  normalizeBoardValue: (value: unknown) => string | null;
  setDraggingRecordId: (value: string | null) => void;
  onMoveRecordToColumn: (record: PrismaWorkspaceRecord, toValue: string | null) => Promise<void>;
  onOpenCreateForColumn: (toValue: string | null) => void;
};

export function KanbanView({
  columns,
  canWrite,
  draggingRecordId,
  boardGroupField,
  boardPrimaryField,
  boardSecondaryFields,
  recordBaseHref,
  objectId,
  getRecordFieldValue,
  normalizeBoardValue,
  setDraggingRecordId,
  onMoveRecordToColumn,
  onOpenCreateForColumn,
}: KanbanViewProps) {
  return (
    <div style={boardColumnsWrapStyle}>
      {columns.map((column) => (
        <section
          key={column.key}
          style={boardColumnStyle}
          onDragOver={(event) => {
            if (!canWrite) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (!canWrite || !boardGroupField) return;
            event.preventDefault();
            const raw = event.dataTransfer.getData("text/plain");
            if (!raw) return;
            try {
              const parsed = JSON.parse(raw) as { recordId?: string };
              const record = column.records.find((entry) => entry.id === parsed.recordId);
              if (record) return;
              const allRecords = columns.flatMap((entry) => entry.records);
              const dragged = allRecords.find((entry) => entry.id === parsed.recordId);
              if (!dragged) return;
              setDraggingRecordId(null);
              void onMoveRecordToColumn(dragged, column.value);
            } catch {
              setDraggingRecordId(null);
            }
          }}
        >
          <header style={boardColumnHeaderStyle}>
            <h3 style={boardColumnTitleStyle}>{column.label}</h3>
            <p style={boardColumnCountStyle}>{column.records.length}</p>
          </header>

          <div style={boardCardListStyle}>
            {column.records.map((record) => (
              <article
                key={record.id}
                draggable={canWrite}
                onDragStart={(event) => {
                  if (!canWrite || !boardGroupField) return;
                  event.dataTransfer.setData(
                    "text/plain",
                    JSON.stringify({
                      recordId: record.id,
                      toValue: normalizeBoardValue(getRecordFieldValue(record, boardGroupField.key)),
                    }),
                  );
                  setDraggingRecordId(record.id);
                }}
                onDragEnd={() => setDraggingRecordId(null)}
                style={{ ...boardCardStyle, opacity: draggingRecordId === record.id ? 0.65 : 1 }}
                onClick={() => {
                  if (!recordBaseHref || !objectId) return;
                  window.location.href = `${recordBaseHref}&object=${objectId}&record=${record.id}`;
                }}
              >
                <p style={boardCardTitleStyle}>
                  {boardPrimaryField
                    ? String(getRecordFieldValue(record, boardPrimaryField.key) ?? "Sin titulo")
                    : "Sin titulo"}
                </p>
                {boardSecondaryFields.map((field) => (
                  <p key={field.id} style={boardCardMetaStyle}>
                    {field.name}: {String(getRecordFieldValue(record, field.key) ?? "-")}
                  </p>
                ))}
              </article>
            ))}
          </div>

          {canWrite ? (
            <button type="button" style={primaryButtonStyle} onClick={() => onOpenCreateForColumn(column.value)}>
              + Nuevo
            </button>
          ) : null}
        </section>
      ))}
    </div>
  );
}

const boardColumnsWrapStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  alignItems: "start",
};

const boardColumnStyle: CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  padding: 14,
  background: "var(--workspace-well)",
  display: "grid",
  gap: 10,
};

const boardColumnHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const boardColumnTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const boardColumnCountStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const boardCardListStyle: CSSProperties = { display: "grid", gap: 10 };

const boardCardStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  boxShadow: "var(--workspace-shadow)",
  padding: "10px 12px",
  display: "grid",
  gap: 6,
  cursor: "pointer",
};

const boardCardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const boardCardMetaStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(51, 92, 255, 0.22)",
  background: "var(--workspace-accent-soft)",
  color: "var(--workspace-accent-strong)",
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 10px",
  cursor: "pointer",
};
