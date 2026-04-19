"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GripVertical, Lock, Pencil, Plus, Save, Trash2, X } from "lucide-react";

export type ManagedField = {
  id: string;
  key: string;
  name: string;
  type: string;
  isLocked: boolean;
  sortOrder?: number;
};

type Props = {
  workspaceSlug: string;
  objectId: string;
  initialFields: ManagedField[];
  open: boolean;
  onClose: () => void;
  onChange?: (fields: ManagedField[]) => void;
};

const FIELD_TYPES: Array<{ value: string; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moneda" },
  { value: "date", label: "Fecha" },
  { value: "boolean", label: "Booleano" },
  { value: "select", label: "Selección" },
  { value: "status", label: "Estado" },
  { value: "relation", label: "Relación" },
  { value: "file", label: "Archivo" },
];

/**
 * Drawer for managing workspace fields on a specific object.
 * - Lists existing fields (sorted by sortOrder).
 * - Lets admins rename non-locked fields, delete them, add new ones, and reorder via drag.
 * - All changes call the REST endpoints so they're auditable and respect is_locked.
 */
export function FieldManagerDrawer({
  workspaceSlug,
  objectId,
  initialFields,
  open,
  onClose,
  onChange,
}: Props) {
  const [fields, setFields] = useState<ManagedField[]>(initialFields);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("text");
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  const ordered = useMemo(
    () => fields.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [fields],
  );

  async function handleRename(field: ManagedField, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === field.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/fields/${encodeURIComponent(field.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Update failed (${response.status}).`);
      }
      setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, name: trimmed } : f)));
      setEditingId(null);
      onChange?.(fields.map((f) => (f.id === field.id ? { ...f, name: trimmed } : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo renombrar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(field: ManagedField) {
    if (!window.confirm(`Eliminar el campo "${field.name}"? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/fields/${encodeURIComponent(field.id)}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Delete failed (${response.status}).`);
      }
      const next = fields.filter((f) => f.id !== field.id);
      setFields(next);
      onChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/fields`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId, name: trimmed, type: newType }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Create failed (${response.status}).`);
      }
      const payload = (await response.json()) as { field: ManagedField };
      const next = [...fields, payload.field];
      setFields(next);
      onChange?.(next);
      setNewName("");
      setNewType("text");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el campo.");
    } finally {
      setBusy(false);
    }
  }

  async function persistSortOrder(next: ManagedField[]) {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        next.map((field, index) =>
          fetch(
            `/api/workspaces/${encodeURIComponent(workspaceSlug)}/fields/${encodeURIComponent(field.id)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sortOrder: index + 1 }),
            },
          ),
        ),
      );
      const reIndexed = next.map((f, i) => ({ ...f, sortOrder: i + 1 }));
      setFields(reIndexed);
      onChange?.(reIndexed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reordenar.");
    } finally {
      setBusy(false);
    }
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  async function handleDrop(targetIndex: number) {
    const source = dragIndexRef.current;
    dragIndexRef.current = null;
    if (source === null || source === targetIndex) return;
    const next = ordered.slice();
    const [moved] = next.splice(source, 1);
    next.splice(targetIndex, 0, moved);
    await persistSortOrder(next);
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Administrar campos" style={overlayStyle} onClick={onClose}>
      <div style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Campos del objeto</h2>
            <p style={subtitleStyle}>Agrega, renombra, reordena y elimina campos. Los bloqueados son del sistema.</p>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Cerrar">
            <X size={16} aria-hidden />
          </button>
        </header>

        {error ? <div style={errorStyle}>{error}</div> : null}

        <ul style={listStyle}>
          {ordered.map((field, index) => (
            <li
              key={field.id}
              draggable={!field.isLocked}
              onDragStart={() => handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(index)}
              style={rowStyle}
            >
              <span aria-hidden style={{ color: "var(--workspace-muted)", cursor: field.isLocked ? "not-allowed" : "grab" }}>
                <GripVertical size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === field.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleRename(field, editingName);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      style={inlineInputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRename(field, editingName)}
                      style={iconButtonStyle}
                      disabled={isBusy}
                      aria-label="Guardar"
                    >
                      <Save size={14} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={fieldNameStyle}>{field.name}</span>
                    {field.isLocked ? (
                      <span style={lockBadgeStyle} title="Campo del sistema">
                        <Lock size={10} aria-hidden /> Bloqueado
                      </span>
                    ) : null}
                  </div>
                )}
                <span style={fieldKeyStyle}>
                  {field.key} · {field.type}
                </span>
              </div>
              {!field.isLocked && editingId !== field.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(field.id);
                      setEditingName(field.name);
                    }}
                    style={iconButtonStyle}
                    aria-label={`Renombrar ${field.name}`}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(field)}
                    style={{ ...iconButtonStyle, color: "var(--workspace-danger)" }}
                    aria-label={`Eliminar ${field.name}`}
                    disabled={isBusy}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>

        <div style={{ padding: "8px 12px 16px" }}>
          {isCreating ? (
            <div style={createFormStyle}>
              <input
                placeholder="Nombre del campo (ej. Origen)"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                style={inlineInputStyle}
              />
              <select
                value={newType}
                onChange={(event) => setNewType(event.target.value)}
                style={inlineInputStyle}
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setCreating(false)} style={ghostButtonStyle}>
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  style={primaryButtonStyle}
                  disabled={isBusy || !newName.trim()}
                >
                  Crear campo
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)} style={primaryButtonStyle}>
              <Plus size={14} aria-hidden /> Nuevo campo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.35)",
  zIndex: 80,
  display: "flex",
  justifyContent: "flex-end",
};

const drawerStyle: CSSProperties = {
  width: 420,
  maxWidth: "92vw",
  height: "100%",
  background: "var(--workspace-surface)",
  borderLeft: "1px solid var(--workspace-border)",
  boxShadow: "-12px 0 32px rgba(17, 24, 39, 0.12)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "20px 20px 12px",
  borderBottom: "1px solid var(--workspace-border)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  marginTop: 4,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "1px solid var(--workspace-border)",
  borderRadius: 8,
  background: "#ffffff",
  color: "var(--workspace-text)",
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  margin: "12px 20px 0",
  padding: 10,
  background: "var(--workspace-danger-soft)",
  border: "1px solid var(--workspace-danger-border)",
  color: "var(--workspace-danger)",
  borderRadius: 8,
  fontSize: 12,
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: "12px 12px 0",
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
};

const fieldNameStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--workspace-text)",
  fontSize: 13,
};

const fieldKeyStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
  fontFamily: "monospace",
  display: "block",
  marginTop: 2,
};

const lockBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  background: "var(--workspace-well)",
  border: "1px solid var(--workspace-border)",
  padding: "2px 6px",
  borderRadius: 999,
};

const inlineInputStyle: CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 13,
  border: "1px solid var(--workspace-border)",
  borderRadius: 8,
  background: "#ffffff",
  color: "var(--workspace-text)",
  fontFamily: "inherit",
  width: "100%",
};

const createFormStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  background: "var(--workspace-well)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 10,
};

const ghostButtonStyle: CSSProperties = {
  height: 32,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  color: "var(--workspace-text)",
  borderRadius: 8,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  background: "var(--workspace-accent)",
  color: "#ffffff",
  border: "1px solid var(--workspace-accent)",
  borderRadius: 8,
  cursor: "pointer",
  width: "100%",
};
