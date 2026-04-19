"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  CalendarDays,
  Columns3,
  Filter as FilterIcon,
  List as ListIcon,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import type {
  PrismaTaskList,
  PrismaTaskStatus,
  PrismaWorkspaceField,
  PrismaWorkspaceRecord,
  PrismaWorkspaceTask,
  TasksWorkspaceBundle,
} from "@/lib/workspaceStore";
import { filterRecords, type FilterDsl } from "@/lib/crm/filters";
import { TasksListView } from "./TasksListView";
import { TasksBoardView } from "./TasksBoardView";
import { CalendarView } from "./CalendarView";
import { TaskFieldsDialog } from "./TaskFieldsDialog";
import { TaskDetail } from "./TaskDetail";
import { SmartViewsBar } from "@/components/workspace/crm/SmartViewsBar";
import type { SavedSmartView, SmartFieldOption } from "@/components/workspace/crm/SmartViewEditor";

type ViewMode = "list" | "board" | "calendar";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  currentRole: "admin" | "operator" | "viewer";
  currentUserId: string;
  initialBundle: TasksWorkspaceBundle;
  savedViews: SavedSmartView[];
  initialListId: string | null;
  initialViewId: string | null;
  initialMode: string | null;
};

const MODES: Array<{ id: ViewMode; label: string; icon: typeof ListIcon }> = [
  { id: "list", label: "Lista", icon: ListIcon },
  { id: "board", label: "Tablero", icon: Columns3 },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
];

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  needs_review: "Por revisar",
  follow_up: "Seguimiento",
  blocked: "Bloqueada",
  awaiting_approval: "Pend. aprobación",
  completed: "Completada",
};

const pageRootStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };

const topBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  padding: "10px 14px",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.04)",
};

const listPickerStyle: CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  fontFamily: "inherit",
  fontSize: 13,
  color: "var(--workspace-text)",
};

const modeSwitcherStyle: CSSProperties = {
  display: "inline-flex",
  background: "var(--workspace-surface-muted, #f1f3f8)",
  borderRadius: "var(--radius-md)",
  padding: 2,
  gap: 2,
};

function modeButtonStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: active ? "var(--workspace-accent-strong)" : "var(--workspace-muted)",
    background: active ? "#ffffff" : "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: active ? "0 2px 6px rgba(17, 24, 39, 0.08)" : "none",
  };
}

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  background: "var(--workspace-accent-strong, #2563eb)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: 13,
  border: "none",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 12px",
  background: "#ffffff",
  color: "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const errorPillStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.25)",
  borderRadius: "var(--radius-md)",
};

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 40,
};

const modalStyle: CSSProperties = {
  width: "min(520px, 92vw)",
  background: "#ffffff",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  boxShadow: "0 24px 64px rgba(15, 23, 42, 0.25)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const inputStyle: CSSProperties = {
  height: 38,
  padding: "0 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  fontSize: 14,
  fontFamily: "inherit",
};

const textareaStyle: CSSProperties = {
  minHeight: 72,
  padding: "10px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  fontSize: 13,
  fontFamily: "inherit",
  resize: "vertical",
};

function taskToRecordClient(task: PrismaWorkspaceTask, tasksObjectId: string): PrismaWorkspaceRecord {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    objectId: tasksObjectId,
    data: {
      ...task.customData,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      type: task.type,
      due_at: task.dueAt ?? "",
      reminder_at: task.reminderAt ?? "",
      assigned_to_user_id: task.assignedToUserId ?? "",
      owner_agent_id: task.ownerAgentId ?? "",
      list_id: task.listId ?? "",
      parent_task_id: task.parentTaskId ?? "",
      sort_order: task.sortOrder,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function statusLabel(key: string, statuses: PrismaTaskStatus[]): string {
  const match = statuses.find((entry) => entry.key === key);
  if (match) return match.label;
  return DEFAULT_STATUS_LABELS[key] ?? key;
}

export function TasksWorkspace({
  workspaceSlug,
  currentRole,
  currentUserId,
  initialBundle,
  savedViews: initialSavedViews,
  initialListId,
  initialViewId,
  initialMode,
}: Props) {
  const [tasks, setTasks] = useState<PrismaWorkspaceTask[]>(initialBundle.tasks);
  const [lists, setLists] = useState<PrismaTaskList[]>(initialBundle.lists);
  const [statuses, setStatuses] = useState<PrismaTaskStatus[]>(initialBundle.statuses);
  const [taskFields, setTaskFields] = useState<PrismaWorkspaceField[]>(initialBundle.tasksFields);
  const [savedViews, setSavedViews] = useState<SavedSmartView[]>(initialSavedViews);
  const [tasksObjectId, setTasksObjectId] = useState<string | null>(initialBundle.tasksObject?.id ?? null);

  const canWrite = currentRole !== "viewer";
  const defaultList = useMemo(() => lists.find((list) => list.isDefault) ?? lists[0] ?? null, [lists]);

  const isQueuePreset = initialViewId === "queue";
  const [selectedListId, setSelectedListId] = useState<string | null>(
    isQueuePreset ? null : initialListId ?? defaultList?.id ?? null,
  );
  const [mode, setMode] = useState<ViewMode>(
    MODES.some((entry) => entry.id === initialMode) ? (initialMode as ViewMode) : "list",
  );
  const [activeViewId, setActiveViewId] = useState<string | null>(
    isQueuePreset ? "queue" : initialViewId,
  );
  const [activeFilter, setActiveFilter] = useState<FilterDsl | null>(null);
  const [openDetailTaskId, setOpenDetailTaskId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isFieldsOpen, setIsFieldsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedListId == null && defaultList) {
      setSelectedListId(defaultList.id);
    }
  }, [defaultList, selectedListId]);

  // Filter tasks by selected list (null = all).
  const listTasks = useMemo(() => {
    if (!selectedListId) return tasks;
    return tasks.filter((task) => task.listId === selectedListId);
  }, [tasks, selectedListId]);

  // Apply smart-view filter, operating on the Record adapter.
  const records = useMemo<PrismaWorkspaceRecord[]>(() => {
    if (!tasksObjectId) return [];
    return listTasks.map((task) => taskToRecordClient(task, tasksObjectId));
  }, [listTasks, tasksObjectId]);

  const filteredRecords = useMemo(() => {
    if (!activeFilter || Object.keys(activeFilter).length === 0) return records;
    return filterRecords(records, activeFilter);
  }, [records, activeFilter]);

  const filteredTasks = useMemo(() => {
    const ids = new Set(filteredRecords.map((record) => record.id));
    let next = listTasks.filter((task) => ids.has(task.id));
    if (activeViewId === "queue") {
      const queueStatuses = new Set([
        "pending",
        "needs_review",
        "pending_docs",
        "follow_up",
        "blocked",
        "awaiting_approval",
        "in_progress",
      ]);
      next = next.filter((task) => queueStatuses.has(task.status.toLowerCase()));
    }
    return next;
  }, [listTasks, filteredRecords, activeViewId]);

  const statusesForList = useMemo(() => {
    if (!selectedListId) return statuses.filter((entry) => entry.listId == null);
    const perList = statuses.filter((entry) => entry.listId === selectedListId);
    return perList.length > 0 ? perList : statuses.filter((entry) => entry.listId == null);
  }, [statuses, selectedListId]);

  const smartFieldOptions = useMemo<SmartFieldOption[]>(() => {
    return taskFields.map((field) => ({ key: field.key, name: field.name, type: field.type }));
  }, [taskFields]);

  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks?limit=500`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo cargar tareas.");
      setTasks(Array.isArray(payload.tasks) ? (payload.tasks as PrismaWorkspaceTask[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando tareas.");
    }
  }, [workspaceSlug]);

  const refreshLists = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/lists`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.lists)) setLists(payload.lists as PrismaTaskList[]);
    } catch {
      /* noop */
    }
  }, [workspaceSlug]);

  const refreshStatuses = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/statuses`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.statuses)) setStatuses(payload.statuses as PrismaTaskStatus[]);
    } catch {
      /* noop */
    }
  }, [workspaceSlug]);

  const refreshFields = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/fields`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setTasksObjectId(payload.tasksObjectId ?? null);
        if (Array.isArray(payload.fields)) setTaskFields(payload.fields as PrismaWorkspaceField[]);
      }
    } catch {
      /* noop */
    }
  }, [workspaceSlug]);

  const handleCreateTask = useCallback(
    async (input: { title: string; description?: string; priority?: string; dueAt?: string | null }) => {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? "normal",
          dueAt: input.dueAt ?? null,
          listId: selectedListId,
          status: "pending",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo crear la tarea.");
      setTasks((current) => [payload.task as PrismaWorkspaceTask, ...current]);
    },
    [workspaceSlug, selectedListId],
  );

  const handlePatchTask = useCallback(
    async (taskId: string, body: Record<string, unknown>) => {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo actualizar la tarea.");
      const updated = payload.task as PrismaWorkspaceTask;
      setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
      return updated;
    },
    [workspaceSlug],
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "No se pudo eliminar la tarea.");
      }
      setTasks((current) => current.filter((task) => task.id !== taskId));
    },
    [workspaceSlug],
  );

  const handleMoveStatus = useCallback(
    async (task: PrismaWorkspaceTask, nextStatus: string | null) => {
      if (!nextStatus) return;
      try {
        await handlePatchTask(task.id, { status: nextStatus });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error moviendo la tarea.");
      }
    },
    [handlePatchTask],
  );

  const handleRescheduleTask = useCallback(
    async (taskId: string, nextDate: string | null) => {
      try {
        await handlePatchTask(taskId, { dueAt: nextDate });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error reprogramando la tarea.");
      }
    },
    [handlePatchTask],
  );

  const openedTask = useMemo(
    () => tasks.find((task) => task.id === openDetailTaskId) ?? null,
    [tasks, openDetailTaskId],
  );

  const activeList = selectedListId ? lists.find((entry) => entry.id === selectedListId) ?? null : null;

  return (
    <div style={pageRootStyle}>
      {activeViewId === "queue" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            background: "rgba(37, 99, 235, 0.08)",
            border: "1px solid rgba(37, 99, 235, 0.25)",
            borderRadius: "var(--radius-lg)",
            color: "var(--workspace-accent-strong, #1d4ed8)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>
            Cola operativa · mostrando tareas pendientes, en progreso, por revisar o bloqueadas
            ({filteredTasks.length}).
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveViewId(null);
              setSelectedListId(defaultList?.id ?? null);
            }}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--workspace-accent-strong, #1d4ed8)",
              background: "#ffffff",
              border: "1px solid rgba(37, 99, 235, 0.3)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Quitar filtro
          </button>
        </div>
      ) : null}

      <div style={topBarStyle}>
        <select
          value={selectedListId ?? ""}
          onChange={(event) => setSelectedListId(event.target.value || null)}
          style={listPickerStyle}
          aria-label="Lista"
        >
          <option value="">Todas las listas</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
              {list.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>

        <div style={modeSwitcherStyle} role="tablist" aria-label="Modo de vista">
          {MODES.map((entry) => {
            const Icon = entry.icon;
            const active = mode === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(entry.id)}
                style={modeButtonStyle(active)}
              >
                <Icon size={14} />
                {entry.label}
              </button>
            );
          })}
        </div>

        {tasksObjectId ? (
          <div style={{ flex: 1, minWidth: 260 }}>
            <SmartViewsBar
              workspaceSlug={workspaceSlug}
              objectId={tasksObjectId}
              fields={smartFieldOptions}
              records={records.map((record) => ({ id: record.id, data: record.data }))}
              savedViews={savedViews}
              activeViewId={activeViewId}
              activeFilter={activeFilter}
              canEdit={canWrite}
              canCreateOrgView={currentRole === "admin"}
              onApplyFilter={(filter) => setActiveFilter(filter)}
              onSelectView={(view) => setActiveViewId(view?.id ?? null)}
              onSavedViewsChange={setSavedViews}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 260 }}>
            <span style={{ ...errorPillStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FilterIcon size={12} /> Ejecuta la migración M12 para habilitar Smart Views en tareas.
            </span>
          </div>
        )}

        {canWrite && tasksObjectId ? (
          <button type="button" style={ghostButtonStyle} onClick={() => setIsFieldsOpen(true)}>
            <Settings2 size={14} /> Campos
          </button>
        ) : null}

        {canWrite ? (
          <button type="button" style={primaryButtonStyle} onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> Nueva tarea
          </button>
        ) : null}
      </div>

      {error ? <div style={errorPillStyle}>{error}</div> : null}

      {mode === "list" ? (
        <TasksListView
          tasks={filteredTasks}
          allTasks={tasks}
          statuses={statusesForList}
          fields={taskFields}
          canWrite={canWrite}
          onOpenTask={setOpenDetailTaskId}
          onPatchTask={handlePatchTask}
          onDeleteTask={handleDeleteTask}
          onStatusLabel={(key) => statusLabel(key, statusesForList)}
          onInlineCreate={canWrite ? handleCreateTask : undefined}
          activeListName={activeList?.name ?? "Todas las listas"}
        />
      ) : null}

      {mode === "board" ? (
        <TasksBoardView
          tasks={filteredTasks}
          statuses={statusesForList}
          canWrite={canWrite}
          isAdmin={currentRole === "admin"}
          workspaceSlug={workspaceSlug}
          onOpenTask={setOpenDetailTaskId}
          onMoveTask={handleMoveStatus}
          onStatusesChanged={(next) => {
            setStatuses((current) => {
              const byId = new Map(next.map((entry) => [entry.id, entry]));
              const preserved = current.filter((entry) => !byId.has(entry.id));
              return [...preserved, ...next];
            });
          }}
        />
      ) : null}

      {mode === "calendar" ? (
        <CalendarView
          tasks={filteredTasks}
          canWrite={canWrite}
          onOpenTask={setOpenDetailTaskId}
          onReschedule={handleRescheduleTask}
        />
      ) : null}

      {isCreateOpen ? (
        <CreateTaskModal
          onClose={() => setIsCreateOpen(false)}
          onCreate={async (input) => {
            await handleCreateTask(input);
            setIsCreateOpen(false);
          }}
        />
      ) : null}

      {isFieldsOpen && tasksObjectId ? (
        <TaskFieldsDialog
          workspaceSlug={workspaceSlug}
          fields={taskFields}
          onClose={() => {
            setIsFieldsOpen(false);
            void refreshFields();
          }}
          onFieldsChanged={setTaskFields}
          currentRole={currentRole}
        />
      ) : null}

      {openedTask && tasksObjectId ? (
        <TaskDetail
          workspaceSlug={workspaceSlug}
          task={openedTask}
          tasksObjectId={tasksObjectId}
          fields={taskFields}
          statuses={statusesForList}
          allTasks={tasks}
          canWrite={canWrite}
          currentUserId={currentUserId}
          onClose={() => setOpenDetailTaskId(null)}
          onPatchTask={handlePatchTask}
          onDeleteTask={async (taskId) => {
            await handleDeleteTask(taskId);
            setOpenDetailTaskId(null);
          }}
          onCreateSubtask={async (input) => {
            const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: input.title,
                listId: openedTask.listId,
                parentTaskId: openedTask.id,
                status: "pending",
              }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error ?? "No se pudo crear la subtarea.");
            setTasks((current) => [payload.task as PrismaWorkspaceTask, ...current]);
          }}
        />
      ) : null}

      {/* touch refreshers to satisfy useCallback deps without triggering unused warnings */}
      <span hidden>{JSON.stringify([refreshTasks.length, refreshLists.length, refreshStatuses.length])}</span>
    </div>
  );
}

type CreateTaskInput = {
  title: string;
  description?: string;
  priority?: string;
  dueAt?: string | null;
};

type CreateModalProps = {
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<void>;
};

function CreateTaskModal({ onClose, onCreate }: CreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={modalBackdropStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nueva tarea</h2>
          <button type="button" style={{ ...ghostButtonStyle, height: 28 }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--workspace-muted)" }}>Título</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={inputStyle}
            placeholder="Ej. Llamar a prospecto…"
            autoFocus
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--workspace-muted)" }}>Descripción</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            style={textareaStyle}
            placeholder="Contexto opcional"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--workspace-muted)" }}>Prioridad</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} style={inputStyle}>
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--workspace-muted)" }}>Vence</span>
            <input
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {err ? <div style={errorPillStyle}>{err}</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={ghostButtonStyle} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onCreate({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  priority,
                  dueAt: dueAt || null,
                });
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Error creando la tarea.");
                setBusy(false);
              }
            }}
          >
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  );
}
