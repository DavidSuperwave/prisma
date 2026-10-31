"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

export type CatalogTool = {
  name: string;
  namespace: string;
  description: string;
  isDefault?: boolean;
};

type Props = {
  open: boolean;
  canEdit: boolean;
  tools: CatalogTool[];
  currentSelection: string[];
  onClose: () => void;
  onApply: (selected: string[]) => Promise<void> | void;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 120,
};

const modalStyle: CSSProperties = {
  width: "min(640px, 94vw)",
  maxHeight: "88vh",
  overflow: "auto",
  background: "var(--workspace-panel)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 14,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 13,
};

const rowStyle = (selected: boolean): CSSProperties => ({
  padding: "10px 12px",
  borderRadius: 12,
  border: selected ? "1px solid rgba(99,102,241,0.38)" : "1px solid var(--workspace-border)",
  background: selected ? "rgba(99,102,241,0.08)" : "white",
  display: "grid",
  gap: 4,
  cursor: "pointer",
});

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

export function AddSkillModal({ open, canEdit, tools, currentSelection, onClose, onApply }: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDraft([]);
    setSaving(false);
  }, [open]);

  const allEnabled = useMemo(() => new Set(currentSelection), [currentSelection]);

  const visibleTools = useMemo(() => {
    const term = search.trim().toLowerCase();
    const nonDefaultTools = tools.filter((tool) => tool.isDefault !== true);
    if (!term) return nonDefaultTools;
    return nonDefaultTools.filter((tool) => {
      const haystack = `${tool.name} ${tool.namespace} ${tool.description}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [search, tools]);

  const toggle = (toolName: string) => {
    setDraft((prev) =>
      prev.includes(toolName) ? prev.filter((entry) => entry !== toolName) : [...prev, toolName],
    );
  };

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={() => (saving ? null : onClose())}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--workspace-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Capability catalog
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20, color: "var(--workspace-text)" }}>Anadir capability</h3>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar capability..."
          style={inputStyle}
          disabled={saving}
        />

        <div style={{ display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
          {visibleTools.map((tool) => {
            const selected = draft.includes(tool.name);
            const alreadyEnabled = allEnabled.has(tool.name);
            return (
              <button
                key={tool.name}
                type="button"
                style={{ ...rowStyle(selected), opacity: alreadyEnabled && !selected ? 0.65 : 1 }}
                onClick={() => toggle(tool.name)}
                disabled={saving || (!selected && alreadyEnabled)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--workspace-text)" }}>{tool.name}</span>
                  <span style={{ fontSize: 11, color: "var(--workspace-muted)", textTransform: "uppercase" }}>{tool.namespace}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)", textAlign: "left" }}>
                  {tool.description || "Tool disponible para este workspace."}
                </p>
              </button>
            );
          })}
          {visibleTools.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
              No se encontraron capabilities para ese termino.
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
            {draft.length} seleccionadas
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" style={secondaryButtonStyle} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...primaryButtonStyle, opacity: !canEdit || saving || draft.length === 0 ? 0.7 : 1, cursor: !canEdit || saving || draft.length === 0 ? "not-allowed" : "pointer" }}
              disabled={!canEdit || saving || draft.length === 0}
              onClick={async () => {
                setSaving(true);
                try {
                  await onApply(draft);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Guardando..." : "Anadir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
