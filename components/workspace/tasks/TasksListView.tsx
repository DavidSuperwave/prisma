"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type {
  PrismaTaskStatus,
  PrismaWorkspaceField,
  PrismaWorkspaceTask,
} from "@/lib/workspaceStore";

type Props = {
  tasks: PrismaWorkspaceTask[];
  allTasks: PrismaWorkspaceTask[];
  statuses: PrismaTaskStatus[];
  fields: PrismaWorkspaceField[];
  canWrite: boolean;
  activeListName: string;
  onStatusLabel: (key: string) => string;
  onOpenTask: (taskId: string) => void;
  onPatchTask: (taskId: string, body: Record<string, unknown>) => Promise<PrismaWorkspaceTask>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onInlineCreate?: (input: {
    title: string;
    priority?: string;
    dueAt?: string | null;
  }) => Promise<void>;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  normal: "#64748b",
  high: "#f59e0b",
  urgent: "#dc2626",
};

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  background: "#ffffff",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
  border: "1px solid var(--workspace-border)",
  fontSize: 13,
};

const theadStyle: CSSProperties = {
  background: "var(--workspace-surface-muted, #f8fafc)",
};

const thStyle: CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--workspace-muted)",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid var(--workspace-border)",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--workspace-border)",
  verticalAlign: "middle",
  color: "var(--workspace-text)",
};

const inlineInputStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "1px solid transparent",
  padding: "4px 6px",
  borderRadius: 4,
  fontSize: 13,
  fontFamily: "inherit",
  color: "inherit",
};

const selectStyle: CSSProperties = {
  ...inlineInputStyle,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
};

const chipStyle = (color: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: "#ffffff",
  background: color,
});

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  fontSize: 12,
  color: "var(--workspace-muted)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

const configToggleStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  color: active ? "var(--workspace-accent-strong)" : "var(--workspace-muted)",
  background: active ? "var(--workspace-accent-soft)" : "transparent",
  border: `1px solid ${active ? "rgba(51, 92, 255, 0.3)" : "var(--workspace-border)"}`,
  borderRadius: 999,
  cursor: "pointer",
  fontFamily: "inherit",
});

const inlineAddRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  background: "#fbfcfe",
  borderTop: "1px dashed var(--workspace-border)",
};

type Col = { key: string; label: string; width?: string; customFieldKey?: string };

const BASE_COLS: Col[] = [
  { key: "title", label: "Tarea" },
  { key: "status", label: "Estado", width: "140px" },
  { key: "priority", label: "Prioridad", width: "120px" },
  { key: "due_at", label: "Vence", width: "140px" },
  { key: "assigned_to_user_id", label: "Asignado", width: "140px" },
];

export function TasksListView({
  tasks,
  allTasks,
  statuses,
  fields,
  canWrite,
  activeListName,
  onStatusLabel,
  onOpenTask,
  onPatchTask,
  onDeleteTask,
  onInlineCreate,
}: Props) {
  const customFieldOptions = useMemo(
    () =>
      fields
        .filter((field) => !field.isLocked)
        .map((field) => ({ key: `custom:${field.key}`, label: field.name, customFieldKey: field.key, fieldId: field.id })),
    [fields],
  );

  const [enabledCustomKeys, setEnabledCustomKeys] = useState<Set<string>>(new Set());

  const columns: Col[] = useMemo(() => {
    const extras: Col[] = customFieldOptions
      .filter((option) => enabledCustomKeys.has(option.customFieldKey))
      .map((option) => ({ key: option.key, label: option.label, width: "160px", customFieldKey: option.customFieldKey }));
    return [...BASE_COLS, ...extras];
  }, [customFieldOptions, enabledCustomKeys]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlineBusy, setInlineBusy] = useState(false);

  // Build a map parentTaskId -> subtask[]
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, PrismaWorkspaceTask[]>();
    for (const task of allTasks) {
      if (task.parentTaskId) {
        const arr = map.get(task.parentTaskId) ?? [];
        arr.push(task);
        map.set(task.parentTaskId, arr);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [allTasks]);

  const topLevel = useMemo(() => tasks.filter((task) => task.parentTaskId == null), [tasks]);

  function renderCell(task: PrismaWorkspaceTask, col: Col, depth: number) {
    if (col.key === "title") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: depth * 18 }}>
          {subtasksByParent.has(task.id) ? (
            <button
              type="button"
              style={ghostButtonStyle}
              onClick={() => {
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(task.id)) next.delete(task.id);
                  else next.add(task.id);
                  return next;
                });
              }}
            >
              {expanded.has(task.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span style={{ width: 14 }} />
          )}
          <button
            type="button"
            onClick={() => onOpenTask(task.id)}
            style={{
              ...ghostButtonStyle,
              color: "var(--workspace-text)",
              fontWeight: 600,
              padding: 0,
              textAlign: "left",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 420,
            }}
          >
            {task.title || "Sin título"}
          </button>
          {task.approvalRequired ? (
            <span style={{ ...chipStyle("#e11d48"), fontSize: 10 }}>Aprobación</span>
          ) : null}
        </div>
      );
    }

    if (col.key === "status") {
      return canWrite ? (
        <select
          value={task.status}
          style={selectStyle}
          onChange={(event) => {
            const next = event.target.value;
            if (!next || next === task.status) return;
            void onPatchTask(task.id, { status: next });
          }}
        >
          {statuses.map((status) => (
            <option key={status.id} value={status.key}>
              {status.label}
            </option>
          ))}
        </select>
      ) : (
        <span>{onStatusLabel(task.status)}</span>
      );
    }

    if (col.key === "priority") {
      const color = PRIORITY_COLORS[task.priority] ?? "#64748b";
      return canWrite ? (
        <select
          value={task.priority}
          style={selectStyle}
          onChange={(event) => void onPatchTask(task.id, { priority: event.target.value })}
        >
          <option value="low">Baja</option>
          <option value="normal">Normal</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>
      ) : (
        <span style={chipStyle(color)}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
      );
    }

    if (col.key === "due_at") {
      const dateValue = task.dueAt ? task.dueAt.slice(0, 10) : "";
      return canWrite ? (
        <input
          type="date"
          value={dateValue}
          style={inlineInputStyle}
          onChange={(event) => {
            const next = event.target.value ? new Date(event.target.value).toISOString() : null;
            void onPatchTask(task.id, { dueAt: next });
          }}
        />
      ) : (
        <span>{dateValue || "—"}</span>
      );
    }

    if (col.key === "assigned_to_user_id") {
      return canWrite ? (
        <input
          type="text"
          value={task.assignedToUserId ?? ""}
          placeholder="user id"
          style={inlineInputStyle}
          onBlur={(event) => {
            const next = event.target.value.trim() || null;
            if (next !== task.assignedToUserId) {
              void onPatchTask(task.id, { assignedToUserId: next });
            }
          }}
          onChange={() => {
            /* controlled-ish via blur */
          }}
        />
      ) : (
        <span>{task.assignedToUserId ?? "—"}</span>
      );
    }

    if (col.customFieldKey) {
      const value = task.customData?.[col.customFieldKey];
      return canWrite ? (
        <input
          type="text"
          defaultValue={value == null ? "" : String(value)}
          style={inlineInputStyle}
          onBlur={(event) => {
            const next = event.target.value;
            const currentVal = value == null ? "" : String(value);
            if (next === currentVal) return;
            const nextCustom = { ...task.customData, [col.customFieldKey!]: next };
            void onPatchTask(task.id, { customData: nextCustom });
          }}
        />
      ) : (
        <span>{value == null ? "—" : String(value)}</span>
      );
    }

    return null;
  }

  function renderRow(task: PrismaWorkspaceTask, depth: number) {
    const rows = [
      <tr key={task.id}>
        {columns.map((col) => (
          <td key={col.key} style={{ ...tdStyle, width: col.width }}>
            {renderCell(task, col, depth)}
          </td>
        ))}
        {canWrite ? (
          <td style={{ ...tdStyle, width: 60 }}>
            <button
              type="button"
              style={ghostButtonStyle}
              title="Eliminar tarea"
              onClick={() => {
                if (confirm("¿Eliminar esta tarea?")) {
                  void onDeleteTask(task.id);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </td>
        ) : null}
      </tr>,
    ];

    const subs = subtasksByParent.get(task.id) ?? [];
    if (expanded.has(task.id) && subs.length > 0) {
      for (const sub of subs) {
        rows.push(...renderRow(sub, depth + 1));
      }
    }
    return rows;
  }

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <strong style={{ fontSize: 13 }}>{activeListName}</strong>
        <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
          {topLevel.length} {topLevel.length === 1 ? "tarea" : "tareas"}
        </span>
        {customFieldOptions.length > 0 ? (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--workspace-muted)", marginRight: 4 }}>Columnas</span>
            {customFieldOptions.map((option) => {
              const active = enabledCustomKeys.has(option.customFieldKey);
              return (
                <button
                  key={option.key}
                  type="button"
                  style={configToggleStyle(active)}
                  onClick={() => {
                    setEnabledCustomKeys((current) => {
                      const next = new Set(current);
                      if (next.has(option.customFieldKey)) next.delete(option.customFieldKey);
                      else next.add(option.customFieldKey);
                      return next;
                    });
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div style={{ overflowX: "auto", borderRadius: "var(--radius-lg)" }}>
        <table style={tableStyle}>
          <thead style={theadStyle}>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ ...thStyle, width: col.width }}>
                  {col.label}
                </th>
              ))}
              {canWrite ? <th style={thStyle}> </th> : null}
            </tr>
          </thead>
          <tbody>
            {topLevel.flatMap((task) => renderRow(task, 0))}
            {topLevel.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (canWrite ? 1 : 0)} style={{ ...tdStyle, textAlign: "center", color: "var(--workspace-muted)", padding: "24px 12px" }}>
                  Sin tareas en esta vista.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {canWrite && onInlineCreate ? (
          <div style={inlineAddRowStyle}>
            <Plus size={14} color="var(--workspace-muted)" />
            <input
              type="text"
              value={inlineTitle}
              onChange={(event) => setInlineTitle(event.target.value)}
              onKeyDown={async (event) => {
                if (event.key === "Enter" && inlineTitle.trim() && !inlineBusy) {
                  setInlineBusy(true);
                  try {
                    await onInlineCreate({ title: inlineTitle.trim() });
                    setInlineTitle("");
                  } finally {
                    setInlineBusy(false);
                  }
                }
              }}
              placeholder="+ Agregar tarea"
              style={{
                flex: 1,
                height: 30,
                padding: "0 8px",
                border: "1px solid var(--workspace-border)",
                borderRadius: 6,
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
