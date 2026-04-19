"use client";

import { useState, type CSSProperties } from "react";
import { Pause, Play, X } from "lucide-react";

export type EnrollmentEntry = {
  id: string;
  recordId: string;
  status: "active" | "paused" | "completed" | "exited";
  currentStep: number;
  nextRunAt: string | null;
  createdAt: string;
};

type Props = {
  workspaceSlug: string;
  sequenceId: string;
  canManage: boolean;
  initialEnrollments: EnrollmentEntry[];
};

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 18,
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--workspace-surface)",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.04)",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 120px 160px 200px",
  gap: 12,
  alignItems: "center",
  padding: "10px 12px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  background: "#ffffff",
  fontSize: 13,
};

const ghostBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  fontSize: 12,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
};

const STATUS_COLORS: Record<EnrollmentEntry["status"], string> = {
  active: "rgba(16,185,129,0.15)",
  paused: "rgba(245,158,11,0.18)",
  completed: "rgba(99,102,241,0.18)",
  exited: "rgba(107,114,128,0.15)",
};

const STATUS_TEXT: Record<EnrollmentEntry["status"], string> = {
  active: "#047857",
  paused: "#92400e",
  completed: "#3730a3",
  exited: "#374151",
};

export function SequenceEnrollmentPanel({ workspaceSlug, sequenceId, canManage, initialEnrollments }: Props) {
  const [rows, setRows] = useState(initialEnrollments);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(enrollmentId: string, action: "pause" | "resume" | "exit") {
    setBusy(enrollmentId);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/sequences/${sequenceId}/enrollments/${enrollmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) return;
      setRows((prev) =>
        prev.map((entry) =>
          entry.id === enrollmentId
            ? {
                ...entry,
                status:
                  action === "pause" ? "paused" : action === "resume" ? "active" : "exited",
              }
            : entry,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={panelStyle}>
      <strong style={{ fontSize: 14 }}>Inscritos</strong>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--workspace-muted)", margin: 0 }}>
          Sin inscritos.
        </p>
      ) : (
        rows.map((entry) => (
          <div key={entry.id} style={rowStyle}>
            <code style={{ fontSize: 11, color: "var(--workspace-muted)" }}>{entry.recordId}</code>
            <span
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: "var(--radius-pill)",
                background: STATUS_COLORS[entry.status],
                color: STATUS_TEXT[entry.status],
                fontWeight: 600,
                justifySelf: "start",
              }}
            >
              {entry.status}
            </span>
            <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
              paso {entry.currentStep} · {entry.nextRunAt ? new Date(entry.nextRunAt).toLocaleString() : "—"}
            </span>
            {canManage ? (
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {entry.status === "active" ? (
                  <button
                    type="button"
                    style={ghostBtn}
                    disabled={busy === entry.id}
                    onClick={() => act(entry.id, "pause")}
                  >
                    <Pause size={12} />
                    Pausar
                  </button>
                ) : null}
                {entry.status === "paused" ? (
                  <button
                    type="button"
                    style={ghostBtn}
                    disabled={busy === entry.id}
                    onClick={() => act(entry.id, "resume")}
                  >
                    <Play size={12} />
                    Reanudar
                  </button>
                ) : null}
                {entry.status !== "exited" && entry.status !== "completed" ? (
                  <button
                    type="button"
                    style={ghostBtn}
                    disabled={busy === entry.id}
                    onClick={() => act(entry.id, "exit")}
                  >
                    <X size={12} />
                    Salir
                  </button>
                ) : null}
              </div>
            ) : (
              <span />
            )}
          </div>
        ))
      )}
    </div>
  );
}
