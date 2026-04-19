"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import type { PrismaTaskStatus, PrismaWorkspaceTask } from "@/lib/workspaceStore";

type Props = {
  tasks: PrismaWorkspaceTask[];
  statuses: PrismaTaskStatus[];
  canWrite: boolean;
  isAdmin: boolean;
  workspaceSlug: string;
  onOpenTask: (taskId: string) => void;
  onMoveTask: (task: PrismaWorkspaceTask, nextStatus: string | null) => Promise<void> | void;
  onStatusesChanged: (next: PrismaTaskStatus[]) => void;
};

type Category = "todo" | "in_progress" | "done" | "blocked";

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "todo", label: "Pendiente" },
  { id: "in_progress", label: "En progreso" },
  { id: "blocked", label: "Bloqueada" },
  { id: "done", label: "Completada" },
];

const COLOR_PALETTE: string[] = [
  "#94a3b8",
  "#64748b",
  "#2563eb",
  "#0ea5e9",
  "#7c3aed",
  "#ec4899",
  "#f59e0b",
  "#f97316",
  "#dc2626",
  "#e11d48",
  "#16a34a",
  "#14b8a6",
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  normal: "#64748b",
  high: "#f59e0b",
  urgent: "#dc2626",
};

const boardStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  overflowX: "auto",
  paddingBottom: 10,
  alignItems: "flex-start",
};

const columnBaseStyle: CSSProperties = {
  flex: "0 0 280px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 10,
  background: "var(--workspace-surface-muted, #f1f3f8)",
  borderRadius: "var(--radius-lg)",
  minHeight: 240,
  transition: "background 140ms ease, outline-color 140ms ease, box-shadow 140ms ease",
  outline: "2px solid transparent",
  outlineOffset: -2,
};

const columnOverStyle: CSSProperties = {
  background: "rgba(37, 99, 235, 0.08)",
  outlineColor: "rgba(37, 99, 235, 0.45)",
  boxShadow: "0 8px 24px rgba(37, 99, 235, 0.12)",
};

const columnHeaderStyle = (color: string): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px",
  borderLeft: `3px solid ${color}`,
  color: "var(--workspace-text)",
});

const cardBaseStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  cursor: "grab",
  boxShadow: "0 2px 6px rgba(17, 24, 39, 0.04)",
  userSelect: "none",
  transition: "transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 180ms ease, opacity 120ms ease",
  willChange: "transform",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  cursor: "pointer",
};

const metaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const chipStyle = (color: string): CSSProperties => ({
  padding: "1px 6px",
  borderRadius: 999,
  background: color,
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 700,
});

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 6,
  color: "var(--workspace-muted)",
  cursor: "pointer",
};

type Column = {
  status: PrismaTaskStatus;
  tasks: PrismaWorkspaceTask[];
};

type DragKind = "card" | "column" | null;

export function TasksBoardView({
  tasks,
  statuses,
  canWrite,
  isAdmin,
  workspaceSlug,
  onOpenTask,
  onMoveTask,
  onStatusesChanged,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<DragKind>(null);
  const [localStatuses, setLocalStatuses] = useState<PrismaTaskStatus[]>(statuses);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalStatuses(statuses);
  }, [statuses]);

  const orderedStatuses = useMemo(
    () => [...localStatuses].sort((a, b) => a.sortOrder - b.sortOrder),
    [localStatuses],
  );

  const columns = useMemo<Column[]>(() => {
    const byStatus = new Map<string, PrismaWorkspaceTask[]>();
    for (const status of orderedStatuses) byStatus.set(status.key, []);
    const unmatched: PrismaWorkspaceTask[] = [];
    for (const task of tasks) {
      if (byStatus.has(task.status)) {
        byStatus.get(task.status)!.push(task);
      } else {
        unmatched.push(task);
      }
    }
    const result: Column[] = orderedStatuses.map((status) => ({
      status,
      tasks: (byStatus.get(status.key) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
    if (unmatched.length > 0) {
      result.push({
        status: {
          id: "__other",
          workspaceId: "",
          listId: null,
          key: "__other",
          label: "Otros",
          color: "#94a3b8",
          category: "todo",
          sortOrder: 9999,
          isSystem: true,
        },
        tasks: unmatched,
      });
    }
    return result;
  }, [tasks, orderedStatuses]);

  const activeTask = useMemo(
    () => (activeKind === "card" ? tasks.find((task) => task.id === activeId) ?? null : null),
    [activeKind, tasks, activeId],
  );
  const activeColumn = useMemo(
    () => (activeKind === "column" ? columns.find((column) => column.status.id === activeId) ?? null : null),
    [activeKind, columns, activeId],
  );

  function handleDragStart(event: DragStartEvent) {
    const kind = (event.active.data.current as { type?: DragKind } | undefined)?.type ?? null;
    setActiveId(String(event.active.id));
    setActiveKind(kind);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const kind = activeKind;
    setActiveId(null);
    setActiveKind(null);
    if (!over) return;

    if (kind === "column") {
      if (!isAdmin) return;
      const overId = String(over.id);
      if (!overId.startsWith("sortable-col:")) return;
      const activeKey = String(active.id).replace(/^sortable-col:/, "");
      const overKey = overId.replace(/^sortable-col:/, "");
      if (activeKey === overKey) return;

      const ordered = orderedStatuses.filter((status) => status.id !== "__other");
      const fromIdx = ordered.findIndex((status) => status.id === activeKey);
      const toIdx = ordered.findIndex((status) => status.id === overKey);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = arrayMove(ordered, fromIdx, toIdx).map((status, index) => ({
        ...status,
        sortOrder: (index + 1) * 10,
      }));
      setLocalStatuses(next);
      onStatusesChanged(next);

      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/statuses/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next.map((status) => status.id) }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "No se pudo guardar el orden.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error guardando el orden.");
        setLocalStatuses(statuses);
        onStatusesChanged(statuses);
      }
      return;
    }

    if (kind === "card") {
      const overId = String(over.id);
      if (!overId.startsWith("column:")) return;
      const nextStatusKey = overId.slice("column:".length);
      if (nextStatusKey === "__other") return;
      const task = tasks.find((entry) => entry.id === String(active.id));
      if (!task) return;
      if (task.status === nextStatusKey) return;
      void onMoveTask(task, nextStatusKey);
    }
  }

  async function handleUpdateStatus(statusId: string, body: Partial<PrismaTaskStatus>) {
    const patch: Record<string, unknown> = {};
    if (body.label !== undefined) patch.label = body.label;
    if (body.color !== undefined) patch.color = body.color;
    if (body.category !== undefined) patch.category = body.category;
    if (Object.keys(patch).length === 0) return;

    const previous = localStatuses;
    const next = previous.map((status) => (status.id === statusId ? { ...status, ...body } : status));
    setLocalStatuses(next);
    onStatusesChanged(next);

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/statuses/${statusId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo actualizar la columna.");
      const updatedNext = next.map((status) =>
        status.id === statusId ? (payload.status as PrismaTaskStatus) : status,
      );
      setLocalStatuses(updatedNext);
      onStatusesChanged(updatedNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando la columna.");
      setLocalStatuses(previous);
      onStatusesChanged(previous);
    }
  }

  async function handleDeleteStatus(statusId: string) {
    const target = localStatuses.find((status) => status.id === statusId);
    if (!target) return;
    if (target.isSystem && !target.listId) {
      setError("Las columnas predeterminadas del workspace no se pueden eliminar.");
      return;
    }
    if (!confirm(`¿Eliminar la columna "${target.label}"? Las tareas con este estado quedarán en "Otros".`)) {
      return;
    }
    const previous = localStatuses;
    const next = previous.filter((status) => status.id !== statusId);
    setLocalStatuses(next);
    onStatusesChanged(next);

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/statuses/${statusId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "No se pudo eliminar la columna.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando la columna.");
      setLocalStatuses(previous);
      onStatusesChanged(previous);
    }
  }

  async function handleCreateStatus(input: { label: string; color: string; category: Category }) {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: input.label,
          color: input.color,
          category: input.category,
          listId: null,
          sortOrder: (orderedStatuses.length + 1) * 10,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo crear la columna.");
      const created = payload.status as PrismaTaskStatus;
      const next = [...localStatuses, created];
      setLocalStatuses(next);
      onStatusesChanged(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando la columna.");
    }
  }

  const sortableIds = useMemo(
    () => orderedStatuses.filter((status) => status.id !== "__other").map((status) => `sortable-col:${status.id}`),
    [orderedStatuses],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setActiveKind(null);
      }}
    >
      {error ? (
        <div
          style={{
            padding: "6px 10px",
            fontSize: 12,
            color: "#b91c1c",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "var(--radius-md)",
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      ) : null}

      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        <div style={boardStyle}>
          {columns.map((column) => (
            <SortableColumn
              key={column.status.id}
              column={column}
              canWrite={canWrite}
              isAdmin={isAdmin}
              activeId={activeId}
              activeKind={activeKind}
              onOpenTask={onOpenTask}
              onUpdateStatus={handleUpdateStatus}
              onDeleteStatus={handleDeleteStatus}
            />
          ))}

          {isAdmin ? <AddColumnButton onCreate={handleCreateStatus} /> : null}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
        {activeTask ? <OverlayCard task={activeTask} /> : null}
        {activeColumn ? <OverlayColumn column={activeColumn} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableColumn({
  column,
  canWrite,
  isAdmin,
  activeId,
  activeKind,
  onOpenTask,
  onUpdateStatus,
  onDeleteStatus,
}: {
  column: Column;
  canWrite: boolean;
  isAdmin: boolean;
  activeId: string | null;
  activeKind: DragKind;
  onOpenTask: (taskId: string) => void;
  onUpdateStatus: (statusId: string, body: Partial<PrismaTaskStatus>) => Promise<void> | void;
  onDeleteStatus: (statusId: string) => Promise<void> | void;
}) {
  const isOtherColumn = column.status.id === "__other";
  const isSortable = isAdmin && !isOtherColumn;

  const sortable = useSortable({
    id: `sortable-col:${column.status.id}`,
    data: { type: "column" as const },
    disabled: !isSortable,
  });

  const droppable = useDroppable({
    id: `column:${column.status.key}`,
    disabled: !canWrite || isOtherColumn,
  });

  function setNodeRef(node: HTMLElement | null) {
    sortable.setNodeRef(node);
    droppable.setNodeRef(node);
  }

  const isCardOver =
    activeKind === "card" &&
    droppable.isOver &&
    activeId != null &&
    !column.tasks.some((task) => task.id === activeId);

  const style: CSSProperties = {
    ...columnBaseStyle,
    ...(isCardOver ? columnOverStyle : null),
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition ?? columnBaseStyle.transition,
    opacity: sortable.isDragging ? 0 : 1,
  };

  return (
    <section ref={setNodeRef} style={style}>
      <header style={columnHeaderStyle(column.status.color ?? "#94a3b8")}>
        {isSortable ? (
          <button
            type="button"
            aria-label="Reordenar columna"
            style={{ ...iconButtonStyle, cursor: "grab" }}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical size={14} />
          </button>
        ) : null}
        <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {column.status.label}
        </strong>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--workspace-muted)" }}>
          {column.tasks.length}
        </span>
        {isAdmin && !isOtherColumn ? (
          <ColumnMenu
            status={column.status}
            onUpdate={(body) => onUpdateStatus(column.status.id, body)}
            onDelete={() => onDeleteStatus(column.status.id)}
          />
        ) : null}
      </header>

      {column.tasks.map((task) => (
        <DraggableCard
          key={task.id}
          task={task}
          canWrite={canWrite}
          isActive={activeId === task.id && activeKind === "card"}
          onOpenTask={onOpenTask}
        />
      ))}

      {column.tasks.length === 0 ? (
        <div
          style={{
            padding: "24px 10px",
            textAlign: "center",
            color: "var(--workspace-muted)",
            fontSize: 12,
            border: "1px dashed var(--workspace-border)",
            borderRadius: "var(--radius-md)",
            transition: "background 140ms ease, border-color 140ms ease",
            background: isCardOver ? "rgba(37, 99, 235, 0.06)" : "transparent",
            borderColor: isCardOver ? "rgba(37, 99, 235, 0.35)" : "var(--workspace-border)",
          }}
        >
          {isCardOver ? "Suelta para mover aquí" : "Sin tareas"}
        </div>
      ) : null}
    </section>
  );
}

function DraggableCard({
  task,
  canWrite,
  isActive,
  onOpenTask,
}: {
  task: PrismaWorkspaceTask;
  canWrite: boolean;
  isActive: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { type: "card" as const },
    disabled: !canWrite,
  });

  const style: CSSProperties = {
    ...cardBaseStyle,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging || isActive ? 0 : 1,
    cursor: canWrite ? (isDragging ? "grabbing" : "grab") : "default",
  };

  return (
    <article ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <h3
        style={titleStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpenTask(task.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") onOpenTask(task.id);
        }}
        tabIndex={0}
        role="button"
      >
        {task.title || "Sin título"}
      </h3>
      <div style={metaStyle}>
        <span style={chipStyle(PRIORITY_COLORS[task.priority] ?? "#64748b")}>{task.priority}</span>
        {task.dueAt ? <span>Vence {task.dueAt.slice(0, 10)}</span> : null}
        {task.assignedToUserId ? <span title="Asignado">@{task.assignedToUserId.slice(0, 6)}</span> : null}
      </div>
    </article>
  );
}

function ColumnMenu({
  status,
  onUpdate,
  onDelete,
}: {
  status: PrismaTaskStatus;
  onUpdate: (body: Partial<PrismaTaskStatus>) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handler(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isProtected = status.isSystem && !status.listId;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Opciones de columna"
        style={iconButtonStyle}
        onClick={() => setOpen((prev) => !prev)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={14} />
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: 28,
            right: 0,
            zIndex: 20,
            width: 240,
            background: "#ffffff",
            border: "1px solid var(--workspace-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 18px 36px rgba(15, 23, 42, 0.18)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <MenuLabel>Nombre</MenuLabel>
          <input
            key={status.label}
            type="text"
            defaultValue={status.label}
            onBlur={(event) => {
              const trimmed = event.target.value.trim();
              if (trimmed && trimmed !== status.label) {
                void onUpdate({ label: trimmed });
              } else {
                event.target.value = status.label;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              if (event.key === "Escape") {
                (event.target as HTMLInputElement).value = status.label;
                setOpen(false);
              }
            }}
            style={{
              height: 30,
              padding: "0 8px",
              fontSize: 12,
              border: "1px solid var(--workspace-border)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "inherit",
            }}
          />

          <MenuLabel>Color</MenuLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
            {COLOR_PALETTE.map((color) => {
              const active = (status.color ?? "").toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  onClick={() => void onUpdate({ color })}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: active ? "2px solid var(--workspace-text)" : "1px solid var(--workspace-border)",
                    background: color,
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>

          <MenuLabel>Categoría</MenuLabel>
          <select
            value={status.category}
            onChange={(event) => void onUpdate({ category: event.target.value as Category })}
            style={{
              height: 30,
              padding: "0 8px",
              fontSize: 12,
              border: "1px solid var(--workspace-border)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "inherit",
              background: "#ffffff",
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isProtected}
            onClick={() => {
              setOpen(false);
              void onDelete();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              background: isProtected ? "var(--workspace-surface-muted, #f1f3f8)" : "#ffffff",
              color: isProtected ? "var(--workspace-muted)" : "#b91c1c",
              border: `1px solid ${isProtected ? "var(--workspace-border)" : "rgba(220, 38, 38, 0.3)"}`,
              borderRadius: "var(--radius-sm)",
              cursor: isProtected ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              justifyContent: "center",
            }}
            title={isProtected ? "Las columnas predeterminadas no se pueden eliminar." : undefined}
          >
            <Trash2 size={12} /> Eliminar columna
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--workspace-muted)",
      }}
    >
      {children}
    </span>
  );
}

function AddColumnButton({
  onCreate,
}: {
  onCreate: (input: { label: string; color: string; category: Category }) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(COLOR_PALETTE[2]);
  const [category, setCategory] = useState<Category>("todo");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          flex: "0 0 240px",
          minHeight: 120,
          padding: 12,
          border: "1px dashed var(--workspace-border)",
          background: "transparent",
          borderRadius: "var(--radius-lg)",
          color: "var(--workspace-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          alignSelf: "flex-start",
        }}
      >
        <Plus size={14} /> Nueva columna
      </button>
    );
  }

  return (
    <div
      style={{
        flex: "0 0 280px",
        padding: 12,
        background: "#ffffff",
        border: "1px solid var(--workspace-border)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignSelf: "flex-start",
        boxShadow: "0 8px 24px rgba(17, 24, 39, 0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 13 }}>Nueva columna</strong>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => {
            setOpen(false);
            setLabel("");
          }}
          style={iconButtonStyle}
        >
          <X size={14} />
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Ej. En diseño"
        style={{
          height: 32,
          padding: "0 10px",
          fontSize: 13,
          border: "1px solid var(--workspace-border)",
          borderRadius: "var(--radius-sm)",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
        {COLOR_PALETTE.map((swatch) => {
          const active = swatch.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Color ${swatch}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                border: active ? "2px solid var(--workspace-text)" : "1px solid var(--workspace-border)",
                background: swatch,
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>

      <select
        value={category}
        onChange={(event) => setCategory(event.target.value as Category)}
        style={{
          height: 32,
          padding: "0 8px",
          fontSize: 13,
          border: "1px solid var(--workspace-border)",
          borderRadius: "var(--radius-sm)",
          fontFamily: "inherit",
          background: "#ffffff",
        }}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={busy || !label.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onCreate({ label: label.trim(), color, category });
            setLabel("");
            setOpen(false);
          } finally {
            setBusy(false);
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          height: 32,
          background: "var(--workspace-accent-strong, #2563eb)",
          color: "#ffffff",
          border: "none",
          borderRadius: "var(--radius-sm)",
          fontSize: 13,
          fontWeight: 600,
          cursor: busy || !label.trim() ? "not-allowed" : "pointer",
          fontFamily: "inherit",
        }}
      >
        <Plus size={14} /> Crear columna
      </button>
    </div>
  );
}

function OverlayCard({ task }: { task: PrismaWorkspaceTask }) {
  return (
    <article
      style={{
        ...cardBaseStyle,
        cursor: "grabbing",
        transform: "rotate(2deg) scale(1.03)",
        boxShadow: "0 18px 36px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(17, 24, 39, 0.12)",
        borderColor: "rgba(37, 99, 235, 0.45)",
      }}
    >
      <h3 style={titleStyle}>{task.title || "Sin título"}</h3>
      <div style={metaStyle}>
        <span style={chipStyle(PRIORITY_COLORS[task.priority] ?? "#64748b")}>{task.priority}</span>
        {task.dueAt ? <span>Vence {task.dueAt.slice(0, 10)}</span> : null}
        {task.assignedToUserId ? <span title="Asignado">@{task.assignedToUserId.slice(0, 6)}</span> : null}
      </div>
    </article>
  );
}

function OverlayColumn({ column }: { column: Column }) {
  return (
    <section
      style={{
        ...columnBaseStyle,
        transform: "rotate(-1deg) scale(1.02)",
        boxShadow: "0 18px 36px rgba(15, 23, 42, 0.22)",
        opacity: 0.95,
      }}
    >
      <header style={columnHeaderStyle(column.status.color ?? "#94a3b8")}>
        <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {column.status.label}
        </strong>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--workspace-muted)" }}>
          {column.tasks.length}
        </span>
      </header>
      {column.tasks.slice(0, 3).map((task) => (
        <article key={task.id} style={{ ...cardBaseStyle, cursor: "grabbing" }}>
          <h3 style={titleStyle}>{task.title || "Sin título"}</h3>
        </article>
      ))}
      {column.tasks.length > 3 ? (
        <div style={{ fontSize: 11, color: "var(--workspace-muted)", textAlign: "center" }}>
          + {column.tasks.length - 3} más
        </div>
      ) : null}
    </section>
  );
}
