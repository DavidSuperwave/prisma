"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import {
  filterRecords,
  type FilterDsl,
  type FilterGroup,
  type FilterOp,
  type FilterRule,
} from "@/lib/crm/filters";

export type SmartFieldOption = {
  key: string;
  name: string;
  type: string;
};

export type SavedSmartView = {
  id: string;
  name: string;
  scope: "private" | "team" | "org";
  filterDsl: Record<string, unknown>;
  isPinned: boolean;
  viewMode: string;
  createdByUserId: string | null;
  columnConfig?: unknown[];
};

type Props = {
  workspaceSlug: string;
  objectId: string;
  fields: SmartFieldOption[];
  records: Array<{ id: string; data: Record<string, unknown> }>;
  currentView: SavedSmartView | null;
  canEdit: boolean;
  canCreateOrgView: boolean;
  onClose: () => void;
  onApply: (filter: FilterDsl) => void;
  onSaved: (view: SavedSmartView) => void;
  onDeleted?: (viewId: string) => void;
  initialFilter?: FilterDsl | null;
};

const OPS: Array<{ value: FilterOp; label: string; needsValue?: boolean; valueType?: "text" | "number" | "list" | "range" | "relative_date" }> = [
  { value: "eq", label: "Igual a", needsValue: true, valueType: "text" },
  { value: "ne", label: "Distinto de", needsValue: true, valueType: "text" },
  { value: "in", label: "En lista", needsValue: true, valueType: "list" },
  { value: "contains", label: "Contiene", needsValue: true, valueType: "text" },
  { value: "starts_with", label: "Empieza con", needsValue: true, valueType: "text" },
  { value: "gt", label: "Mayor que", needsValue: true, valueType: "text" },
  { value: "lt", label: "Menor que", needsValue: true, valueType: "text" },
  { value: "between", label: "Entre", needsValue: true, valueType: "range" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
  { value: "relative_date", label: "Fecha relativa", needsValue: true, valueType: "relative_date" },
];

const RELATIVE_OPTIONS = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "last_7_days", label: "Últimos 7 días" },
  { value: "last_30_days", label: "Últimos 30 días" },
  { value: "next_7_days", label: "Próximos 7 días" },
];

const drawerStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: 480,
  maxWidth: "100%",
  background: "#ffffff",
  borderLeft: "1px solid var(--workspace-border)",
  boxShadow: "-12px 0 32px rgba(17, 24, 39, 0.08)",
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.35)",
  zIndex: 55,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid var(--workspace-border)",
};

const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const footerStyle: CSSProperties = {
  padding: 16,
  borderTop: "1px solid var(--workspace-border)",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
};

const ruleRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr auto",
  gap: 6,
  padding: 10,
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const groupWrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  background: "rgba(51, 92, 255, 0.04)",
  border: "1px dashed var(--workspace-border-strong)",
  borderRadius: "var(--radius-md)",
};

const smallInputStyle: CSSProperties = {
  height: 30,
  padding: "4px 8px",
  fontSize: 12,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "inherit",
  width: "100%",
};

const smallSelectStyle: CSSProperties = {
  ...smallInputStyle,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const dangerButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  color: "var(--workspace-danger)",
  borderColor: "var(--workspace-danger-border)",
  background: "var(--workspace-danger-soft)",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
};

const saveFormStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

function emptyGroup(logical: "all" | "any" = "all"): FilterGroup {
  return { logical, rules: [] };
}

function cloneGroup(group: FilterGroup): FilterGroup {
  return {
    logical: group.logical,
    rules: group.rules.map((entry) =>
      "logical" in entry && Array.isArray((entry as FilterGroup).rules)
        ? cloneGroup(entry as FilterGroup)
        : { ...(entry as FilterRule) },
    ),
  };
}

function toGroup(filter: FilterDsl | null | undefined): FilterGroup {
  if (!filter) return emptyGroup();
  if ("logical" in filter && Array.isArray((filter as FilterGroup).rules)) {
    return cloneGroup(filter as FilterGroup);
  }
  return emptyGroup();
}

export function SmartViewEditor({
  workspaceSlug,
  objectId,
  fields,
  records,
  currentView,
  canEdit,
  canCreateOrgView,
  onClose,
  onApply,
  onSaved,
  onDeleted,
  initialFilter,
}: Props) {
  const [group, setGroup] = useState<FilterGroup>(() =>
    toGroup(
      initialFilter ??
        (currentView?.filterDsl && Object.keys(currentView.filterDsl).length > 0
          ? (currentView.filterDsl as FilterDsl)
          : null),
    ),
  );
  const [name, setName] = useState(currentView?.name ?? "");
  const [scope, setScope] = useState<"private" | "team" | "org">(currentView?.scope ?? "private");
  const [isPinned, setIsPinned] = useState<boolean>(currentView?.isPinned ?? false);
  const normalizedInitialMode: "table" | "board" | "kpi" | "pipeline" =
    currentView?.viewMode === "board" ||
    currentView?.viewMode === "kpi" ||
    currentView?.viewMode === "pipeline"
      ? (currentView.viewMode as "board" | "kpi" | "pipeline")
      : "table";
  const [viewMode, setViewMode] = useState<"table" | "board" | "kpi" | "pipeline">(normalizedInitialMode);
  const [mode, setMode] = useState<"save-new" | "update" | "idle">("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewCount = useMemo(() => {
    return filterRecords(records, group).length;
  }, [records, group]);

  function updateGroup(updater: (draft: FilterGroup) => FilterGroup) {
    setGroup((prev) => updater(cloneGroup(prev)));
  }

  function handleApply() {
    onApply(group);
    onClose();
  }

  async function handleSaveNew() {
    if (!name.trim()) {
      setError("Asigna un nombre a la vista.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          objectId,
          scope,
          filterDsl: group,
          isPinned,
          viewMode,
        }),
      });
      const json = (await res.json()) as { viewId?: string; error?: string };
      if (!res.ok || !json.viewId) {
        setError(json.error ?? "No se pudo guardar la vista.");
        return;
      }
      onSaved({
        id: json.viewId,
        name: name.trim(),
        scope,
        filterDsl: group as unknown as Record<string, unknown>,
        isPinned,
        viewMode,
        createdByUserId: null,
      });
      setMode("idle");
      onApply(group);
      onClose();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCurrent() {
    if (!currentView) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/views/${currentView.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || currentView.name,
          scope,
          filterDsl: group,
          isPinned,
          viewMode,
        }),
      });
      const json = (await res.json()) as { viewId?: string; error?: string };
      if (!res.ok || !json.viewId) {
        setError(json.error ?? "No se pudo actualizar la vista.");
        return;
      }
      onSaved({
        ...currentView,
        name: name.trim() || currentView.name,
        scope,
        filterDsl: group as unknown as Record<string, unknown>,
        isPinned,
        viewMode,
      });
      setMode("idle");
      onApply(group);
      onClose();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!currentView) return;
    if (!confirm("¿Eliminar esta vista?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/views/${currentView.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo eliminar.");
        return;
      }
      onDeleted?.(currentView.id);
      onClose();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={backdropStyle} onClick={onClose} aria-hidden />
      <aside style={drawerStyle} role="dialog" aria-label="Editor de vista">
        <header style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--workspace-text)" }}>
              Filtros {currentView ? "· " + currentView.name : ""}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
              {previewCount} registros coinciden
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostButtonStyle, padding: "0 10px" }}>
            <X size={14} />
          </button>
        </header>

        <div style={bodyStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={sectionTitleStyle}>Regla principal</p>
            <select
              value={group.logical}
              onChange={(event) =>
                updateGroup((draft) => {
                  draft.logical = event.target.value === "any" ? "any" : "all";
                  return draft;
                })
              }
              style={{ ...smallSelectStyle, width: 120 }}
            >
              <option value="all">Todos (Y)</option>
              <option value="any">Cualquiera (O)</option>
            </select>
          </div>

          <RuleList
            group={group}
            fields={fields}
            updateGroup={updateGroup}
            path={[]}
          />

          <button
            type="button"
            onClick={() =>
              updateGroup((draft) => {
                draft.rules.push({
                  field: fields[0]?.key ?? "",
                  op: "eq",
                  value: "",
                });
                return draft;
              })
            }
            style={ghostButtonStyle}
          >
            <Plus size={14} /> Agregar regla
          </button>

          <button
            type="button"
            onClick={() =>
              updateGroup((draft) => {
                draft.rules.push(emptyGroup("any"));
                return draft;
              })
            }
            style={ghostButtonStyle}
          >
            <Plus size={14} /> Agregar subgrupo
          </button>

          {canEdit ? (
            <div style={saveFormStyle}>
              <p style={sectionTitleStyle}>Guardar</p>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre de la vista"
                style={smallInputStyle}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as "private" | "team" | "org")}
                  style={{ ...smallSelectStyle, flex: 1 }}
                >
                  <option value="private">Privada</option>
                  <option value="team">Equipo</option>
                  {canCreateOrgView ? <option value="org">Organización</option> : null}
                </select>
                <select
                  value={viewMode}
                  onChange={(event) =>
                    setViewMode(event.target.value as "table" | "board" | "kpi" | "pipeline")
                  }
                  style={{ ...smallSelectStyle, flex: 1 }}
                  aria-label="Modo de visualización"
                >
                  <option value="table">Tabla</option>
                  <option value="board">Tablero</option>
                  <option value="kpi">KPI</option>
                  <option value="pipeline">Pipeline</option>
                </select>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--workspace-muted)",
                    padding: "0 8px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(event) => setIsPinned(event.target.checked)}
                    style={{ accentColor: "var(--workspace-accent)" }}
                  />
                  Fijar en sidebar
                </label>
              </div>
              {error ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-danger)" }}>{error}</p>
              ) : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSaveNew}
                  disabled={saving}
                  style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}
                >
                  <Save size={12} /> Guardar como nueva
                </button>
                {currentView ? (
                  <button
                    type="button"
                    onClick={handleUpdateCurrent}
                    disabled={saving}
                    style={{ ...ghostButtonStyle, opacity: saving ? 0.6 : 1 }}
                  >
                    Actualizar actual
                  </button>
                ) : null}
                {currentView && onDeleted ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    style={{ ...dangerButtonStyle, opacity: saving ? 0.6 : 1 }}
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                ) : null}
              </div>
              {mode === "save-new" ? null : null}
            </div>
          ) : null}
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={onClose} style={ghostButtonStyle}>
            Cancelar
          </button>
          <button type="button" onClick={handleApply} style={primaryButtonStyle}>
            Aplicar filtro
          </button>
        </footer>
      </aside>
    </>
  );
}

type RuleListProps = {
  group: FilterGroup;
  fields: SmartFieldOption[];
  updateGroup: (updater: (draft: FilterGroup) => FilterGroup) => void;
  path: number[];
};

function RuleList({ group, fields, updateGroup, path }: RuleListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {group.rules.map((entry, idx) => {
        const childPath = [...path, idx];
        if ("logical" in entry && Array.isArray((entry as FilterGroup).rules)) {
          const sub = entry as FilterGroup;
          return (
            <div key={`g-${idx}`} style={groupWrapperStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <select
                  value={sub.logical}
                  onChange={(event) =>
                    updateGroup((draft) =>
                      applyToPath(draft, childPath, (target) => {
                        (target as FilterGroup).logical = event.target.value === "any" ? "any" : "all";
                      }),
                    )
                  }
                  style={{ ...smallSelectStyle, width: 120 }}
                >
                  <option value="all">Todos (Y)</option>
                  <option value="any">Cualquiera (O)</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    updateGroup((draft) => {
                      removeAtPath(draft, childPath);
                      return draft;
                    })
                  }
                  style={{ ...ghostButtonStyle, padding: "0 10px" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <RuleList group={sub} fields={fields} updateGroup={updateGroup} path={childPath} />
              <button
                type="button"
                onClick={() =>
                  updateGroup((draft) =>
                    applyToPath(draft, childPath, (target) => {
                      (target as FilterGroup).rules.push({
                        field: fields[0]?.key ?? "",
                        op: "eq",
                        value: "",
                      });
                    }),
                  )
                }
                style={ghostButtonStyle}
              >
                <Plus size={12} /> Regla
              </button>
            </div>
          );
        }
        const rule = entry as FilterRule;
        return (
          <RuleRow
            key={`r-${idx}`}
            rule={rule}
            fields={fields}
            onChange={(next) =>
              updateGroup((draft) =>
                applyToPath(draft, childPath, (target, parent, key) => {
                  if (parent && typeof key === "number") {
                    (parent as FilterGroup).rules[key] = next;
                  }
                  return target;
                }),
              )
            }
            onRemove={() =>
              updateGroup((draft) => {
                removeAtPath(draft, childPath);
                return draft;
              })
            }
          />
        );
      })}
      {group.rules.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
          Sin reglas aún.
        </p>
      ) : null}
    </div>
  );
}

function RuleRow({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  fields: SmartFieldOption[];
  onChange: (next: FilterRule) => void;
  onRemove: () => void;
}) {
  const opMeta = OPS.find((o) => o.value === rule.op);
  const needsValue = Boolean(opMeta?.needsValue);
  const valueType = opMeta?.valueType ?? "text";

  function renderValue() {
    if (!needsValue) return <div />;
    if (valueType === "relative_date") {
      return (
        <select
          value={typeof rule.value === "string" ? rule.value : "last_7_days"}
          onChange={(event) => onChange({ ...rule, value: event.target.value })}
          style={smallSelectStyle}
        >
          {RELATIVE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    if (valueType === "list") {
      const raw = Array.isArray(rule.value) ? rule.value.join(", ") : typeof rule.value === "string" ? rule.value : "";
      return (
        <input
          type="text"
          value={raw}
          placeholder="valor1, valor2"
          onChange={(event) =>
            onChange({ ...rule, value: event.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
          }
          style={smallInputStyle}
        />
      );
    }
    if (valueType === "range") {
      const bounds = Array.isArray(rule.value) ? rule.value : ["", ""];
      return (
        <div style={{ display: "flex", gap: 4 }}>
          <input
            type="text"
            value={String(bounds[0] ?? "")}
            onChange={(event) => onChange({ ...rule, value: [event.target.value, bounds[1] ?? ""] })}
            placeholder="desde"
            style={smallInputStyle}
          />
          <input
            type="text"
            value={String(bounds[1] ?? "")}
            onChange={(event) => onChange({ ...rule, value: [bounds[0] ?? "", event.target.value] })}
            placeholder="hasta"
            style={smallInputStyle}
          />
        </div>
      );
    }
    return (
      <input
        type="text"
        value={typeof rule.value === "string" || typeof rule.value === "number" ? String(rule.value) : ""}
        onChange={(event) => onChange({ ...rule, value: event.target.value })}
        placeholder="valor"
        style={smallInputStyle}
      />
    );
  }

  return (
    <div style={ruleRowStyle}>
      <select
        value={rule.field}
        onChange={(event) => onChange({ ...rule, field: event.target.value })}
        style={smallSelectStyle}
      >
        {fields.length === 0 ? <option value="">—</option> : null}
        {fields.map((field) => (
          <option key={field.key} value={field.key}>
            {field.name}
          </option>
        ))}
      </select>
      <select
        value={rule.op}
        onChange={(event) => onChange({ ...rule, op: event.target.value as FilterOp })}
        style={smallSelectStyle}
      >
        {OPS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {renderValue()}
      <button type="button" onClick={onRemove} style={{ ...ghostButtonStyle, padding: "0 10px" }}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function applyToPath(
  group: FilterGroup,
  path: number[],
  visitor: (target: FilterGroup | FilterRule, parent: FilterGroup | null, key: number | null) => void | FilterGroup | FilterRule,
): FilterGroup {
  if (path.length === 0) {
    visitor(group, null, null);
    return group;
  }
  let parent: FilterGroup = group;
  for (let i = 0; i < path.length - 1; i++) {
    const entry = parent.rules[path[i]];
    if (!("logical" in entry)) return group;
    parent = entry as FilterGroup;
  }
  const lastIdx = path[path.length - 1];
  const target = parent.rules[lastIdx];
  visitor(target, parent, lastIdx);
  return group;
}

function removeAtPath(group: FilterGroup, path: number[]): FilterGroup {
  if (path.length === 0) return group;
  let parent: FilterGroup = group;
  for (let i = 0; i < path.length - 1; i++) {
    const entry = parent.rules[path[i]];
    if (!("logical" in entry)) return group;
    parent = entry as FilterGroup;
  }
  parent.rules.splice(path[path.length - 1], 1);
  return group;
}
