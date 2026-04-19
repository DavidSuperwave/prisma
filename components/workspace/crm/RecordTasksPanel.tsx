"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";

type TaskEntry = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  reminderAt: string | null;
  assignedToUserId: string | null;
  type: string;
};

type Props = {
  workspaceSlug: string;
  recordId: string;
  objectId: string;
  currentRole?: "admin" | "operator" | "viewer";
};

function formatDue(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const countBadgeStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--workspace-muted)",
  background: "rgba(17, 24, 39, 0.05)",
  padding: "3px 8px",
  borderRadius: "var(--radius-pill)",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const inputStyle: CSSProperties = {
  height: 32,
  padding: "6px 10px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const datePickerStyle: CSSProperties = {
  ...inputStyle,
  fontSize: 12,
  width: 190,
};

const submitButtonStyle: CSSProperties = {
  marginLeft: "auto",
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

const errorStyle: CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.24)",
  borderRadius: "var(--radius-md)",
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const taskItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 12px",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const checkboxStyle: CSSProperties = {
  marginTop: 2,
  width: 16,
  height: 16,
  accentColor: "var(--workspace-accent)",
  cursor: "pointer",
};

const taskTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-text)",
};

const taskMetaStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const detailsStyle: CSSProperties = {
  marginTop: 4,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: 12,
  color: "var(--workspace-muted)",
  fontWeight: 500,
  padding: "6px 0",
};

const completedItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: "transparent",
};

const completedTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
  textDecoration: "line-through",
};

export function RecordTasksPanel({ workspaceSlug, recordId, objectId, currentRole }: Props) {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canWrite = currentRole !== "viewer";

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/tasks?recordId=${encodeURIComponent(recordId)}&limit=100`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { tasks?: TaskEntry[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudieron cargar las tareas.");
        setTasks([]);
      } else {
        setTasks(json.tasks ?? []);
        setError(null);
      }
    } catch {
      setError("Error de red al cargar tareas.");
    } finally {
      setLoading(false);
    }
  }, [recordId, workspaceSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type: "follow_up",
          recordId,
          sourceRecordId: recordId,
          sourceObjectId: objectId,
          dueAt: newDue ? new Date(newDue).toISOString() : null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo crear la tarea.");
      } else {
        setNewTitle("");
        setNewDue("");
        await reload();
      }
    } catch {
      setError("Error de red al crear tarea.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(task: TaskEntry) {
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "No se pudo actualizar la tarea.");
      } else {
        await reload();
      }
    } catch {
      setError("Error de red.");
    }
  }

  const openTasks = tasks.filter((task) => task.status !== "completed");
  const completedTasks = tasks.filter((task) => task.status === "completed");

  return (
    <section style={sectionStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Tareas</h2>
        <span style={countBadgeStyle}>
          {openTasks.length} abiertas · {completedTasks.length} completadas
        </span>
      </header>

      {canWrite ? (
        <form onSubmit={handleCreate} style={formStyle}>
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Nueva tarea… (ej. Llamar mañana 10am)"
            style={inputStyle}
          />
          <div style={rowStyle}>
            <input
              type="datetime-local"
              value={newDue}
              onChange={(event) => setNewDue(event.target.value)}
              style={datePickerStyle}
            />
            <button
              type="submit"
              disabled={submitting || !newTitle.trim()}
              style={{
                ...submitButtonStyle,
                opacity: submitting || !newTitle.trim() ? 0.5 : 1,
                cursor: submitting ? "wait" : !newTitle.trim() ? "not-allowed" : "pointer",
              }}
            >
              <Plus size={13} />
              {submitting ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <div style={errorStyle}>{error}</div> : null}

      {loading ? (
        <p style={mutedTextStyle}>Cargando tareas…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {openTasks.length === 0 ? (
            <p style={mutedTextStyle}>Sin tareas abiertas.</p>
          ) : (
            <ul style={listStyle}>
              {openTasks.map((task) => (
                <li key={task.id} style={taskItemStyle}>
                  {canWrite ? (
                    <input
                      type="checkbox"
                      checked={task.status === "completed"}
                      onChange={() => handleComplete(task)}
                      style={checkboxStyle}
                    />
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                    <p style={taskTitleStyle}>{task.title}</p>
                    <p style={taskMetaStyle}>
                      {formatDue(task.dueAt)} · {task.priority} · {task.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {completedTasks.length > 0 ? (
            <details style={detailsStyle}>
              <summary style={summaryStyle}>
                Completadas ({completedTasks.length})
              </summary>
              <ul style={{ ...listStyle, marginTop: 6 }}>
                {completedTasks.map((task) => (
                  <li key={task.id} style={completedItemStyle}>
                    {canWrite ? (
                      <input
                        type="checkbox"
                        checked
                        onChange={() => handleComplete(task)}
                        style={{ ...checkboxStyle, marginTop: 0 }}
                      />
                    ) : null}
                    <span style={completedTitleStyle}>{task.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
