"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AddTriggerModal, type TriggerModalSubmit } from "@/components/workspace/agents/AddTriggerModal";
import { describeCron } from "@/lib/agentTools/cronExpression";

type TriggerRow = {
  id: string;
  cron: string;
  prompt: string;
  timezone: string;
};

type Props = {
  jobs: unknown[];
  canEdit: boolean;
  isSaving: boolean;
  onSave: (nextJobs: unknown[]) => Promise<void> | void;
};

const actionButtonStyle: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};

const addButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  border: "none",
  background: "rgba(99,102,241,0.95)",
  color: "white",
  fontWeight: 600,
};

function normalizeTriggerRows(jobs: unknown[]): TriggerRow[] {
  return jobs
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const cron = typeof row.cron === "string" ? row.cron.trim() : "";
      if (!cron) return null;
      const id = typeof row.id === "string" && row.id.trim().length > 0 ? row.id : `trigger-${index + 1}`;
      const prompt = typeof row.prompt === "string" ? row.prompt : "";
      const timezone =
        typeof row.timezone === "string" && row.timezone.trim().length > 0 ? row.timezone : "UTC";
      return { id, cron, prompt, timezone };
    })
    .filter((entry): entry is TriggerRow => Boolean(entry));
}

function createTriggerId(prompt: string) {
  const stem = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const suffix = Date.now().toString(36).slice(-6);
  return `${stem || "trigger"}-${suffix}`;
}

export function TriggersSection({ jobs, canEdit, isSaving, onSave }: Props) {
  const [openModal, setOpenModal] = useState(false);
  const rows = useMemo(() => normalizeTriggerRows(jobs), [jobs]);

  const removeTrigger = async (id: string) => {
    const next = rows.filter((row) => row.id !== id);
    await onSave(next);
  };

  const addTrigger = async (payload: TriggerModalSubmit) => {
    const next = [
      ...rows,
      {
        id: createTriggerId(payload.prompt),
        cron: payload.cron,
        prompt: payload.prompt,
        timezone: payload.timezone,
        ...(payload.startsAt ? { starts_at: payload.startsAt } : {}),
      },
    ];
    await onSave(next);
    setOpenModal(false);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
          Triggers programados ({rows.length})
        </p>
        <button
          type="button"
          style={{ ...addButtonStyle, opacity: !canEdit || isSaving ? 0.7 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
          disabled={!canEdit || isSaving}
          onClick={() => setOpenModal(true)}
        >
          + Anadir trigger
        </button>
      </div>

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
          Sin triggers. Usa el boton para programar el primer job.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                border: "1px solid var(--workspace-border)",
                borderRadius: 12,
                background: "white",
                padding: "10px 12px",
                display: "grid",
                gap: 5,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
                    {describeCron(row.cron, row.timezone)}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--workspace-text)", fontWeight: 600 }}>
                    {row.prompt || "Sin instrucciones"}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>{row.cron}</p>
                </div>
                <button
                  type="button"
                  style={{ ...actionButtonStyle, padding: "5px 9px", opacity: !canEdit || isSaving ? 0.6 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
                  disabled={!canEdit || isSaving}
                  onClick={() => void removeTrigger(row.id)}
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddTriggerModal
        open={openModal}
        canEdit={canEdit}
        onClose={() => (isSaving ? null : setOpenModal(false))}
        onSave={addTrigger}
      />
    </div>
  );
}
