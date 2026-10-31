"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AddSkillModal, type CatalogTool } from "@/components/workspace/agents/AddSkillModal";

type Props = {
  enabledTools: string[];
  catalogTools: CatalogTool[];
  canEdit: boolean;
  isSaving: boolean;
  onSave: (nextTools: string[]) => Promise<void> | void;
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

export function SkillsSection({ enabledTools, catalogTools, canEdit, isSaving, onSave }: Props) {
  const [openModal, setOpenModal] = useState(false);
  const catalogByName = useMemo(
    () => new Map(catalogTools.map((tool) => [tool.name, tool])),
    [catalogTools],
  );
  const hiddenDefaultCount = useMemo(
    () =>
      enabledTools.filter((toolName) => {
        const tool = catalogByName.get(toolName);
        return tool?.isDefault === true;
      }).length,
    [catalogByName, enabledTools],
  );
  const visibleEnabledTools = useMemo(
    () =>
      enabledTools.filter((toolName) => {
        const tool = catalogByName.get(toolName);
        return tool?.isDefault !== true;
      }),
    [catalogByName, enabledTools],
  );

  const grouped = useMemo(() => {
    const entries = visibleEnabledTools.map((toolName) => {
      const tool = catalogByName.get(toolName);
      return {
        name: toolName,
        namespace: tool?.namespace ?? (toolName.includes(".") ? toolName.split(".")[0] : "general"),
        description: tool?.description ?? "Tool activa para este agente.",
      };
    });
    if (entries.length < 5) {
      return [{ namespace: "all", rows: entries }];
    }
    const byNamespace = new Map<string, typeof entries>();
    for (const entry of entries) {
      const rows = byNamespace.get(entry.namespace) ?? [];
      rows.push(entry);
      byNamespace.set(entry.namespace, rows);
    }
    return Array.from(byNamespace.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([namespace, rows]) => ({ namespace, rows }));
  }, [catalogByName, visibleEnabledTools]);

  const removeTool = async (toolName: string) => {
    const next = enabledTools.filter((entry) => entry !== toolName);
    await onSave(next);
  };

  const applySelection = async (selected: string[]) => {
    const next = Array.from(new Set([...enabledTools, ...selected])).sort((a, b) => a.localeCompare(b));
    await onSave(next);
    setOpenModal(false);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
          Capabilities activas ({enabledTools.length})
        </p>
        <button
          type="button"
          style={{ ...addButtonStyle, opacity: !canEdit || isSaving ? 0.7 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
          disabled={!canEdit || isSaving}
          onClick={() => setOpenModal(true)}
        >
          + Anadir capability
        </button>
      </div>

      {hiddenDefaultCount > 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
          {hiddenDefaultCount} base capabilities ya vienen habilitadas por defecto y se ocultan para reducir ruido.
        </p>
      ) : null}

      {visibleEnabledTools.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
          No hay capabilities extra visibles para este agente.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {grouped.map((group) => (
            <div key={group.namespace} style={{ display: "grid", gap: 8 }}>
              {group.namespace !== "all" ? (
                <p style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.35, color: "var(--workspace-muted)" }}>
                  {group.namespace}
                </p>
              ) : null}
              {group.rows.map((tool) => (
                <div
                  key={tool.name}
                  style={{
                    border: "1px solid var(--workspace-border)",
                    borderRadius: 12,
                    background: "white",
                    padding: "10px 12px",
                    display: "flex",
                    gap: 10,
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--workspace-text)" }}>
                      {tool.name}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                      {tool.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    style={{ ...actionButtonStyle, padding: "5px 9px", opacity: !canEdit || isSaving ? 0.6 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
                    disabled={!canEdit || isSaving}
                    onClick={() => void removeTool(tool.name)}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <AddSkillModal
        open={openModal}
        canEdit={canEdit}
        tools={catalogTools}
        currentSelection={enabledTools}
        onClose={() => (isSaving ? null : setOpenModal(false))}
        onApply={applySelection}
      />
    </div>
  );
}
