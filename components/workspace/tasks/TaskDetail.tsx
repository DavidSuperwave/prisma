"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  PrismaTaskStatus,
  PrismaWorkspaceField,
  PrismaWorkspaceTask,
} from "@/lib/workspaceStore";

type Props = {
  workspaceSlug: string;
  task: PrismaWorkspaceTask;
  tasksObjectId: string;
  fields: PrismaWorkspaceField[];
  statuses: PrismaTaskStatus[];
  allTasks: PrismaWorkspaceTask[];
  canWrite: boolean;
  currentUserId: string;
  onClose: () => void;
  onPatchTask: (taskId: string, body: Record<string, unknown>) => Promise<PrismaWorkspaceTask>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onCreateSubtask: (input: { title: string }) => Promise<void>;
};

const drawerBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.25)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 35,
};

const drawerStyle: CSSProperties = {
  width: "min(520px, 100vw)",
  height: "100vh",
  background: "#ffffff",
  display: "flex",
  flexDirection: "column",
  boxShadow: "-12px 0 32px rgba(15, 23, 42, 0.15)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 18px",
  borderBottom: "1px solid var(--workspace-border)",
};

const bodyStyle: CSSProperties = {
  padding: 18,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  flex: 1,
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--workspace-muted)",
};

const inputStyle: CSSProperties = {
  height: 34,
  padding: "0 10px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  fontFamily: "inherit",
  background: "#ffffff",
};

const textareaStyle: CSSProperties = {
  minHeight: 80,
  padding: "8px 10px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  fontFamily: "inherit",
  background: "#ffffff",
  resize: "vertical",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: 10,
  alignItems: "center",
};

const ghostButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--workspace-text)",
};

const dangerButton: CSSProperties = {
  ...ghostButton,
  color: "#b91c1c",
  borderColor: "rgba(220, 38, 38, 0.3)",
};

const subtaskRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  background: "#fbfcfe",
  marginBottom: 6,
};

const errorPillStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.25)",
  borderRadius: "var(--radius-md)",
};

type AgentEvent = {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export function TaskDetail({
  workspaceSlug,
  task,
  fields,
  statuses,
  allTasks,
  canWrite,
  onClose,
  onPatchTask,
  onDeleteTask,
  onCreateSubtask,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSubtask, setNewSubtask] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
  }, [task.id, task.title, task.description]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/activity?taskId=${encodeURIComponent(task.id)}&limit=20`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = await response.json();
        if (Array.isArray(payload.events)) setEvents(payload.events as AgentEvent[]);
      } catch {
        /* silent */
      }
    }
    void loadEvents();
  }, [workspaceSlug, task.id, task.updatedAt]);

  const subtasks = useMemo(
    () => allTasks.filter((entry) => entry.parentTaskId === task.id),
    [allTasks, task.id],
  );

  const customFields = fields.filter((field) => !field.isLocked);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await onPatchTask(task.id, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={drawerBackdropStyle} onClick={onClose}>
      <aside
        style={drawerStyle}
        onClick={(event) => event.stopPropagation()}
        role="complementary"
        aria-label="Detalle de tarea"
      >
        <header style={headerStyle}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--workspace-muted)" }}>Tarea</span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {task.title || "Sin título"}
            </h2>
          </div>
          <button type="button" style={ghostButton} onClick={onClose} aria-label="Cerrar">
            <X size={14} /> Cerrar
          </button>
        </header>

        <div style={bodyStyle}>
          {error ? <div style={errorPillStyle}>{error}</div> : null}

          <section style={sectionStyle}>
            <span style={labelStyle}>Título</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title.trim() && title !== task.title) void save({ title: title.trim() });
              }}
              style={inputStyle}
              disabled={!canWrite}
            />
          </section>

          <section style={sectionStyle}>
            <span style={labelStyle}>Descripción</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => {
                if (description !== (task.description ?? "")) {
                  void save({ description: description.trim() || null });
                }
              }}
              style={textareaStyle}
              disabled={!canWrite}
            />
          </section>

          <section style={sectionStyle}>
            <span style={labelStyle}>Propiedades</span>
            <div style={{ ...rowStyle }}>
              <span style={{ fontSize: 12 }}>Estado</span>
              <select
                value={task.status}
                onChange={(event) => void save({ status: event.target.value })}
                style={inputStyle}
                disabled={!canWrite}
              >
                {statuses.map((status) => (
                  <option key={status.id} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 12 }}>Prioridad</span>
              <select
                value={task.priority}
                onChange={(event) => void save({ priority: event.target.value })}
                style={inputStyle}
                disabled={!canWrite}
              >
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 12 }}>Vence</span>
              <input
                type="date"
                value={task.dueAt ? task.dueAt.slice(0, 10) : ""}
                onChange={(event) =>
                  void save({ dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })
                }
                style={inputStyle}
                disabled={!canWrite}
              />
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 12 }}>Recordatorio</span>
              <input
                type="datetime-local"
                value={task.reminderAt ? task.reminderAt.slice(0, 16) : ""}
                onChange={(event) =>
                  void save({
                    reminderAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                  })
                }
                style={inputStyle}
                disabled={!canWrite}
              />
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 12 }}>Asignado a</span>
              <input
                type="text"
                defaultValue={task.assignedToUserId ?? ""}
                placeholder="user id"
                style={inputStyle}
                disabled={!canWrite}
                onBlur={(event) => {
                  const next = event.target.value.trim() || null;
                  if (next !== task.assignedToUserId) void save({ assignedToUserId: next });
                }}
              />
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 12 }}>Tipo</span>
              <input
                type="text"
                defaultValue={task.type}
                style={inputStyle}
                disabled={!canWrite}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== task.type) void save({ type: next });
                }}
              />
            </div>
          </section>

          {customFields.length > 0 ? (
            <section style={sectionStyle}>
              <span style={labelStyle}>Campos personalizados</span>
              {customFields.map((field) => {
                const currentValue = task.customData?.[field.key];
                return (
                  <div key={field.id} style={rowStyle}>
                    <span style={{ fontSize: 12 }}>{field.name}</span>
                    <input
                      type={field.type === "number" || field.type === "currency" ? "number" : field.type === "date" ? "date" : "text"}
                      defaultValue={currentValue == null ? "" : String(currentValue)}
                      style={inputStyle}
                      disabled={!canWrite}
                      onBlur={(event) => {
                        const raw = event.target.value;
                        const currentStr = currentValue == null ? "" : String(currentValue);
                        if (raw === currentStr) return;
                        const nextCustom = { ...task.customData, [field.key]: raw };
                        void save({ customData: nextCustom });
                      }}
                    />
                  </div>
                );
              })}
            </section>
          ) : null}

          <section style={sectionStyle}>
            <span style={labelStyle}>Subtareas ({subtasks.length})</span>
            {subtasks.map((sub) => (
              <div key={sub.id} style={subtaskRowStyle}>
                <input
                  type="checkbox"
                  checked={sub.status === "completed"}
                  onChange={() =>
                    void onPatchTask(sub.id, {
                      status: sub.status === "completed" ? "pending" : "completed",
                    })
                  }
                  disabled={!canWrite}
                />
                <span style={{ flex: 1, fontSize: 13, textDecoration: sub.status === "completed" ? "line-through" : "none" }}>
                  {sub.title}
                </span>
              </div>
            ))}
            {canWrite ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="+ Agregar subtarea"
                  value={newSubtask}
                  onChange={(event) => setNewSubtask(event.target.value)}
                  onKeyDown={async (event) => {
                    if (event.key === "Enter" && newSubtask.trim() && !busy) {
                      setBusy(true);
                      setError(null);
                      try {
                        await onCreateSubtask({ title: newSubtask.trim() });
                        setNewSubtask("");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Error creando la subtarea.");
                      } finally {
                        setBusy(false);
                      }
                    }
                  }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  style={ghostButton}
                  disabled={!newSubtask.trim() || busy}
                  onClick={async () => {
                    if (!newSubtask.trim()) return;
                    setBusy(true);
                    setError(null);
                    try {
                      await onCreateSubtask({ title: newSubtask.trim() });
                      setNewSubtask("");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Error creando la subtarea.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Plus size={12} />
                </button>
              </div>
            ) : null}
          </section>

          {events.length > 0 ? (
            <section style={sectionStyle}>
              <span style={labelStyle}>Actividad</span>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {events.map((event) => (
                  <li
                    key={event.id}
                    style={{
                      padding: "6px 8px",
                      background: "var(--workspace-surface-muted, #f1f3f8)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12,
                      color: "var(--workspace-muted)",
                    }}
                  >
                    <strong style={{ color: "var(--workspace-text)" }}>{event.event_type}</strong>
                    <span style={{ marginLeft: 8 }}>
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canWrite ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
              <button
                type="button"
                style={dangerButton}
                onClick={() => {
                  if (confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.")) {
                    void onDeleteTask(task.id);
                  }
                }}
              >
                <Trash2 size={12} /> Eliminar tarea
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
