"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

type Props = {
  status: string;
  lastHealthCheckAt?: string | null;
  lastHealthStatus?: string | null;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (isActive: boolean) => Promise<void> | void;
};

const segmentedWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 4,
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "white",
};

const segmentButtonStyle = (active: boolean): CSSProperties => ({
  padding: "7px 12px",
  borderRadius: 999,
  border: "none",
  background: active ? "rgba(99,102,241,0.95)" : "transparent",
  color: active ? "white" : "var(--workspace-text)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
});

function describeHealth(lastHealthStatus: string | null | undefined) {
  if (lastHealthStatus === "healthy") return "Runtime verificado";
  if (lastHealthStatus === "unreachable") return "Runtime no alcanzable";
  if (lastHealthStatus === "drifted") return "Runtime desincronizado";
  if (lastHealthStatus === "draft") return "Configuracion incompleta";
  return "Sin verificacion reciente";
}

function formatTimestamp(value: string, hydrated: boolean) {
  if (!hydrated) {
    return value.replace("T", " ").replace("Z", " UTC");
  }
  return new Date(value).toLocaleString();
}

export function ActivationSection({ status, lastHealthCheckAt, lastHealthStatus, canEdit, isSaving, onSave }: Props) {
  const active = status === "active";
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
        Activa o pausa el agente. El badge refleja el ultimo probe real del runtime.
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
        {describeHealth(lastHealthStatus)}
        {lastHealthCheckAt ? ` · ${formatTimestamp(lastHealthCheckAt, hydrated)}` : ""}
      </p>
      <div style={segmentedWrapStyle}>
        <button
          type="button"
          style={{ ...segmentButtonStyle(active), opacity: !canEdit || isSaving ? 0.7 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
          disabled={!canEdit || isSaving}
          onClick={() => void onSave(true)}
        >
          {isSaving && !active ? "Activando..." : "Activo"}
        </button>
        <button
          type="button"
          style={{ ...segmentButtonStyle(!active), opacity: !canEdit || isSaving ? 0.7 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
          disabled={!canEdit || isSaving}
          onClick={() => void onSave(false)}
        >
          {isSaving && active ? "Pausando..." : "Pausado"}
        </button>
      </div>
    </div>
  );
}
