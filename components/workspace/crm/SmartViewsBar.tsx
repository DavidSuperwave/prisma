"use client";

import { useRef, useState, type CSSProperties, useEffect } from "react";
import { ChevronDown, Filter, Pin, Users } from "lucide-react";
import { SmartViewEditor, type SavedSmartView, type SmartFieldOption } from "./SmartViewEditor";
import type { FilterDsl } from "@/lib/crm/filters";

type Props = {
  workspaceSlug: string;
  objectId: string;
  fields: SmartFieldOption[];
  records: Array<{ id: string; data: Record<string, unknown> }>;
  savedViews: SavedSmartView[];
  activeViewId: string | null;
  activeFilter: FilterDsl | null;
  canEdit: boolean;
  canCreateOrgView: boolean;
  onApplyFilter: (filter: FilterDsl | null) => void;
  onSelectView: (view: SavedSmartView | null) => void;
  onSavedViewsChange: (views: SavedSmartView[]) => void;
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const activeButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  color: "var(--workspace-accent-strong)",
  background: "var(--workspace-accent-soft)",
  borderColor: "rgba(51, 92, 255, 0.25)",
};

const dropdownStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  minWidth: 260,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.08)",
  zIndex: 20,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const menuItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 10px",
  border: "none",
  background: "transparent",
  color: "var(--workspace-text)",
  fontSize: 12,
  textAlign: "left",
  cursor: "pointer",
  borderRadius: "var(--radius-sm)",
  fontFamily: "inherit",
};

const menuItemActiveStyle: CSSProperties = {
  ...menuItemStyle,
  background: "var(--workspace-accent-soft)",
  color: "var(--workspace-accent-strong)",
  fontWeight: 600,
};

const scopeBadgeStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
};

const emptyMenuStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  color: "var(--workspace-muted)",
};

export function SmartViewsBar({
  workspaceSlug,
  objectId,
  fields,
  records,
  savedViews,
  activeViewId,
  activeFilter,
  canEdit,
  canCreateOrgView,
  onApplyFilter,
  onSelectView,
  onSavedViewsChange,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const activeView = savedViews.find((view) => view.id === activeViewId) ?? null;
  const hasFilter = Boolean(activeFilter) || Boolean(activeView);

  function handleSavedView(view: SavedSmartView) {
    const next = savedViews.some((v) => v.id === view.id)
      ? savedViews.map((v) => (v.id === view.id ? view : v))
      : [...savedViews, view];
    onSavedViewsChange(next);
    onSelectView(view);
  }

  function handleDeleted(viewId: string) {
    onSavedViewsChange(savedViews.filter((v) => v.id !== viewId));
    if (activeViewId === viewId) {
      onSelectView(null);
      onApplyFilter(null);
    }
  }

  function handleSelectFromMenu(view: SavedSmartView) {
    setMenuOpen(false);
    onSelectView(view);
    if (view.filterDsl && typeof view.filterDsl === "object") {
      onApplyFilter(view.filterDsl as FilterDsl);
    } else {
      onApplyFilter(null);
    }
  }

  function handleClear() {
    setMenuOpen(false);
    onSelectView(null);
    onApplyFilter(null);
  }

  return (
    <div ref={containerRef} style={{ display: "inline-flex", gap: 6, position: "relative" }}>
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        style={hasFilter ? activeButtonStyle : ghostButtonStyle}
      >
        <Filter size={15} />
        Filtros
        {activeFilter && !activeView ? (
          <span style={{ fontSize: 11, color: "var(--workspace-accent-strong)" }}>·</span>
        ) : null}
      </button>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          style={activeView ? activeButtonStyle : ghostButtonStyle}
        >
          <Users size={15} />
          {activeView ? activeView.name : "Vistas"}
          <ChevronDown size={13} />
        </button>
        {menuOpen ? (
          <div style={dropdownStyle} role="listbox">
            <button
              type="button"
              onClick={handleClear}
              style={!activeView ? menuItemActiveStyle : menuItemStyle}
            >
              Todos los registros
            </button>
            {savedViews.length === 0 ? (
              <p style={emptyMenuStyle}>No hay vistas guardadas.</p>
            ) : (
              savedViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => handleSelectFromMenu(view)}
                  style={view.id === activeViewId ? menuItemActiveStyle : menuItemStyle}
                >
                  {view.isPinned ? <Pin size={12} /> : <span style={{ width: 12 }} />}
                  <span style={{ flex: 1 }}>{view.name}</span>
                  <span style={scopeBadgeStyle}>{view.scope}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {editorOpen ? (
        <SmartViewEditor
          workspaceSlug={workspaceSlug}
          objectId={objectId}
          fields={fields}
          records={records}
          currentView={activeView}
          canEdit={canEdit}
          canCreateOrgView={canCreateOrgView}
          onClose={() => setEditorOpen(false)}
          onApply={(filter) => onApplyFilter(filter)}
          onSaved={handleSavedView}
          onDeleted={handleDeleted}
          initialFilter={activeFilter}
        />
      ) : null}
    </div>
  );
}
