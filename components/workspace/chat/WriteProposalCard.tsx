"use client";

import { useState } from "react";

export type WriteProposalDiffEntry = {
  id?: string | null;
  before?: unknown;
  after?: unknown;
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
  slug?: string | null;
};

export type WriteProposalPayload = {
  action: string;
  summary?: string;
  count?: number;
  targets?: unknown[];
  diff?: WriteProposalDiffEntry[];
  objectName?: string;
  objectId?: string;
  integrationSlug?: string;
  op?: string;
  [key: string]: unknown;
};

type Props = {
  toolName: string;
  proposal: WriteProposalPayload;
  confirmToken: string;
  expiresAt?: string | null;
  state?: "pending" | "confirmed" | "cancelled";
  onConfirm: (message: string) => void;
  onCancel: (message: string) => void;
};

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(185, 28, 28, 0.35)",
  borderRadius: 14,
  background: "rgba(254, 242, 242, 0.65)",
  padding: 14,
  display: "grid",
  gap: 10,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const titleStyle: React.CSSProperties = { margin: 0, fontWeight: 700, fontSize: 14, color: "#7f1d1d" };

const summaryStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: "#991b1b" };

const diffBoxStyle: React.CSSProperties = {
  maxHeight: 260,
  overflowY: "auto",
  background: "#fff",
  border: "1px solid rgba(185, 28, 28, 0.2)",
  borderRadius: 10,
  padding: 10,
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 1.45,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

const confirmButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(185, 28, 28, 0.4)",
  background: "#b91c1c",
  color: "#fff",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const cancelButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(15, 23, 42, 0.2)",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const pillStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(185, 28, 28, 0.12)",
  color: "#991b1b",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

function truncate(value: string, max = 160) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function renderDiff(entries: WriteProposalDiffEntry[] | undefined) {
  if (!entries || entries.length === 0) return null;
  const rows = entries.slice(0, 30);
  const more = entries.length - rows.length;
  return (
    <div style={diffBoxStyle}>
      {rows.map((entry, i) => {
        const label = entry.slug ?? entry.id ?? `#${i + 1}`;
        return (
          <div key={`${label}-${i}`} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: "#7f1d1d" }}>{String(label)}</div>
            {Array.isArray(entry.changes) && entry.changes.length > 0 ? (
              entry.changes.map((c, j) => (
                <div key={`${label}-${j}`}>
                  <span style={{ color: "#475569" }}>{c.field}</span>:{" "}
                  <span style={{ color: "#991b1b", textDecoration: "line-through" }}>{renderValue(c.from)}</span>
                  {" → "}
                  <span style={{ color: "#065f46" }}>{renderValue(c.to)}</span>
                </div>
              ))
            ) : entry.before !== undefined || entry.after !== undefined ? (
              <div>
                {entry.before !== undefined && entry.before !== null ? (
                  <div>
                    <span style={{ color: "#475569" }}>before:</span>{" "}
                    <span style={{ color: "#991b1b" }}>{renderValue(entry.before)}</span>
                  </div>
                ) : null}
                {entry.after !== undefined && entry.after !== null ? (
                  <div>
                    <span style={{ color: "#475569" }}>after:</span>{" "}
                    <span style={{ color: "#065f46" }}>{renderValue(entry.after)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {more > 0 ? <div style={{ color: "#64748b", fontSize: 11 }}>…and {more} more.</div> : null}
    </div>
  );
}

export function WriteProposalCard({ toolName, proposal, confirmToken, expiresAt, state = "pending", onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const isPending = state === "pending";
  const isConfirmed = state === "confirmed";
  const isCancelled = state === "cancelled";

  const action = proposal.action || toolName;
  const summary =
    proposal.summary ||
    (typeof proposal.count === "number" ? `${action} — ${proposal.count} target${proposal.count === 1 ? "" : "s"}` : action);

  const handleConfirm = () => {
    if (busy || !isPending) return;
    setBusy(true);
    const message = `Confirmo la acción propuesta.\n\n<<CONFIRM_PROPOSAL toolName=${toolName} token=${confirmToken}>>`;
    onConfirm(message);
  };

  const handleCancel = () => {
    if (busy || !isPending) return;
    setBusy(true);
    const message = `Cancelo la acción propuesta.\n\n<<CANCEL_PROPOSAL toolName=${toolName}>>`;
    onCancel(message);
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <p style={titleStyle}>Confirmation required</p>
        <span style={pillStyle}>{action}</span>
      </div>
      <p style={summaryStyle}>{summary}</p>
      {renderDiff(proposal.diff)}
      {expiresAt ? (
        <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
          Token expires {new Date(expiresAt).toLocaleTimeString()}.
        </p>
      ) : null}
      <div style={buttonRowStyle}>
        {isPending ? (
          <>
            <button type="button" style={cancelButtonStyle} onClick={handleCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" style={confirmButtonStyle} onClick={handleConfirm} disabled={busy}>
              Confirm
            </button>
          </>
        ) : isConfirmed ? (
          <span style={{ color: "#065f46", fontSize: 12, fontWeight: 600 }}>Confirmed ✓</span>
        ) : isCancelled ? (
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>Cancelled</span>
        ) : null}
      </div>
    </div>
  );
}
