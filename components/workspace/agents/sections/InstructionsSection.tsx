"use client";

import type { CSSProperties } from "react";

type Props = {
  canEdit: boolean;
  value: string;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 156,
  padding: 11,
  borderRadius: 12,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  resize: "vertical",
  fontSize: 13,
  lineHeight: 1.55,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "rgba(99,102,241,0.95)",
  color: "white",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};

export function InstructionsSection({ canEdit, value, isDirty, isSaving, onChange, onSave, onDiscard }: Props) {
  const saveDisabled = !canEdit || isSaving || !isDirty;
  const discardDisabled = isSaving || !isDirty;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
        Que hace y como se comporta
      </p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Explica el rol del agente: que hace, como contesta, que NO hace."
        style={textareaStyle}
        disabled={!canEdit || isSaving}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          style={{ ...primaryButtonStyle, opacity: saveDisabled ? 0.7 : 1, cursor: saveDisabled ? "not-allowed" : "pointer" }}
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={discardDisabled}
          style={{ ...secondaryButtonStyle, opacity: discardDisabled ? 0.7 : 1, cursor: discardDisabled ? "not-allowed" : "pointer" }}
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
