"use client";

import type { PrismaWorkspaceField, PrismaWorkspaceRecord } from "@/lib/workspaceStore";
import type { CSSProperties } from "react";

type KpiPanelProps = {
  records: PrismaWorkspaceRecord[];
  fields: PrismaWorkspaceField[];
  getRecordFieldValue: (record: PrismaWorkspaceRecord, key: string) => unknown;
};

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.replace(/,/g, "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function KpiPanel({ records, fields, getRecordFieldValue }: KpiPanelProps) {
  const statusField = fields.find((field) => field.type === "status" || field.key === "status") ?? null;
  const numericField = fields.find((field) => ["number", "currency"].includes(field.type)) ?? null;

  const statusCounts = new Map<string, number>();
  if (statusField) {
    for (const record of records) {
      const raw = getRecordFieldValue(record, statusField.key);
      const label = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "Sin estado";
      statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
    }
  }

  let sum = 0;
  let numericCount = 0;
  if (numericField) {
    for (const record of records) {
      const value = asNumber(getRecordFieldValue(record, numericField.key));
      if (value === null) continue;
      sum += value;
      numericCount += 1;
    }
  }

  const avg = numericCount > 0 ? sum / numericCount : 0;

  return (
    <div style={gridStyle}>
      <article style={cardStyle}>
        <p style={labelStyle}>Total registros</p>
        <p style={valueStyle}>{records.length}</p>
      </article>
      <article style={cardStyle}>
        <p style={labelStyle}>Suma {numericField ? `(${numericField.name})` : ""}</p>
        <p style={valueStyle}>{numericField ? sum.toLocaleString("es-MX") : "-"}</p>
      </article>
      <article style={cardStyle}>
        <p style={labelStyle}>Promedio {numericField ? `(${numericField.name})` : ""}</p>
        <p style={valueStyle}>{numericField ? avg.toLocaleString("es-MX", { maximumFractionDigits: 2 }) : "-"}</p>
      </article>
      <article style={cardStyle}>
        <p style={labelStyle}>Estados</p>
        <div style={{ display: "grid", gap: 6 }}>
          {statusCounts.size === 0 ? (
            <p style={metaStyle}>Sin campo de estado configurado.</p>
          ) : (
            [...statusCounts.entries()].map(([label, count]) => (
              <p key={label} style={metaStyle}>
                {label}: <strong>{count}</strong>
              </p>
            ))
          )}
        </div>
      </article>
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-surface)",
  boxShadow: "var(--workspace-shadow)",
  padding: "14px 16px",
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-faint)",
  fontWeight: 700,
};

const valueStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1.1,
  color: "var(--workspace-text)",
  fontFamily: "var(--font-display)",
};

const metaStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-text)",
};
