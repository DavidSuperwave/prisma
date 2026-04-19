"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PrismaWorkspaceTask } from "@/lib/workspaceStore";

type Props = {
  tasks: PrismaWorkspaceTask[];
  canWrite: boolean;
  onOpenTask: (taskId: string) => void;
  onReschedule: (taskId: string, nextDate: string | null) => Promise<void> | void;
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  normal: "#64748b",
  high: "#f59e0b",
  urgent: "#dc2626",
};

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  padding: 12,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const navButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 1,
  background: "var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
};

const dayLabelStyle: CSSProperties = {
  padding: "6px 8px",
  fontSize: 11,
  fontWeight: 700,
  textAlign: "center",
  color: "var(--workspace-muted)",
  background: "#ffffff",
};

const cellStyle = (isOutside: boolean, isToday: boolean): CSSProperties => ({
  minHeight: 96,
  padding: 6,
  background: isOutside ? "#fbfcfe" : "#ffffff",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  border: isToday ? "2px solid var(--workspace-accent-strong, #2563eb)" : "none",
});

const dateLabelStyle = (isToday: boolean): CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  color: isToday ? "var(--workspace-accent-strong, #2563eb)" : "var(--workspace-text)",
});

const chipStyle = (color: string): CSSProperties => ({
  padding: "3px 6px",
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 4,
  background: color,
  color: "#ffffff",
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function buildCalendarCells(year: number, month: number) {
  const first = startOfMonth(year, month);
  const firstDow = (first.getDay() + 6) % 7;
  const cells: Date[] = [];
  const start = new Date(year, month, 1 - firstDow);
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toIsoDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0).toISOString();
}

export function CalendarView({ tasks, canWrite, onOpenTask, onReschedule }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const cells = useMemo(() => buildCalendarCells(cursor.year, cursor.month), [cursor]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, PrismaWorkspaceTask[]>();
    for (const task of tasks) {
      if (!task.dueAt) continue;
      const date = new Date(task.dueAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(task);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button
          type="button"
          style={navButtonStyle}
          onClick={() =>
            setCursor((current) => {
              const next = new Date(current.year, current.month - 1, 1);
              return { year: next.getFullYear(), month: next.getMonth() };
            })
          }
          aria-label="Mes anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {MONTH_LABELS[cursor.month]} {cursor.year}
        </h3>
        <button
          type="button"
          style={navButtonStyle}
          onClick={() =>
            setCursor((current) => {
              const next = new Date(current.year, current.month + 1, 1);
              return { year: next.getFullYear(), month: next.getMonth() };
            })
          }
          aria-label="Mes siguiente"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          style={{ ...navButtonStyle, width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 600 }}
          onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
        >
          Hoy
        </button>
      </div>

      <div style={gridStyle}>
        {DAY_LABELS.map((label) => (
          <div key={label} style={dayLabelStyle}>
            {label}
          </div>
        ))}
        {cells.map((date) => {
          const isOutside = date.getMonth() !== cursor.month;
          const isToday = sameDay(date, today);
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const dayTasks = tasksByDay.get(key) ?? [];
          return (
            <div
              key={date.toISOString()}
              style={cellStyle(isOutside, isToday)}
              onDragOver={(event) => {
                if (!canWrite) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!canWrite) return;
                event.preventDefault();
                const raw = event.dataTransfer.getData("text/plain");
                setDragId(null);
                if (!raw) return;
                try {
                  const parsed = JSON.parse(raw) as { taskId?: string };
                  if (!parsed.taskId) return;
                  void onReschedule(parsed.taskId, toIsoDate(date));
                } catch {
                  /* noop */
                }
              }}
            >
              <span style={dateLabelStyle(isToday)}>{date.getDate()}</span>
              {dayTasks.slice(0, 4).map((task) => (
                <span
                  key={task.id}
                  style={{ ...chipStyle(PRIORITY_COLORS[task.priority] ?? "#64748b"), opacity: dragId === task.id ? 0.6 : 1 }}
                  title={task.title}
                  draggable={canWrite}
                  onDragStart={(event) => {
                    if (!canWrite) return;
                    setDragId(task.id);
                    event.dataTransfer.setData("text/plain", JSON.stringify({ taskId: task.id }));
                  }}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onOpenTask(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onOpenTask(task.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {task.title}
                </span>
              ))}
              {dayTasks.length > 4 ? (
                <span style={{ fontSize: 10, color: "var(--workspace-muted)" }}>
                  +{dayTasks.length - 4} más
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
