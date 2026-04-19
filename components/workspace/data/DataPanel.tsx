"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileStack, History, MessageSquare, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import type {
  PrismaWorkspaceField,
  PrismaWorkspaceObject,
  PrismaWorkspaceRecord,
  PrismaWorkspaceView,
} from "@/lib/workspaceStore";
import { applyViewToRecords } from "@/lib/workspaceStore";
import { useColumnConfig } from "@/lib/useColumnConfig";
import { ColumnPicker } from "@/components/workspace/crm/ColumnPicker";
import {
  Button,
  SearchInput,
  Select,
  Toolbar,
  ToolbarSpacer,
} from "@/components/workspace/ui";
// Editable grid has a lot of interactive state and formatting helpers; defer
// its bundle until the grid view is actually rendered.
const EditableGrid = dynamic(
  () => import("./EditableGrid").then((mod) => ({ default: mod.EditableGrid })),
  { ssr: false, loading: () => null },
);
import { RecordDetailDrawer } from "./RecordDetailDrawer";
import { HistoryDrawer } from "./HistoryDrawer";
import {
  OperatorCopilotSidebar,
  type OperatorAgentSummary,
} from "./OperatorCopilotSidebar";

export type DataPanelProps = {
  objects: PrismaWorkspaceObject[];
  fields: PrismaWorkspaceField[];
  views: PrismaWorkspaceView[];
  records: PrismaWorkspaceRecord[];
  workspaceSlug: string;
  currentRole: "admin" | "operator" | "viewer";
  initialObjectId?: string;
  initialViewId?: string;
  recordBaseHref?: string;
  askHref?: string;
  workspaceId?: string;
  userId?: string;
  agents?: OperatorAgentSummary[];
  primaryAgentId?: string | null;
};

function formatStatusLabel(status: string): string {
  const normalized = String(status ?? "").toLowerCase();
  const map: Record<string, string> = {
    pending: "Pendiente",
    needs_review: "Por revisar",
    follow_up: "Seguimiento",
    pending_docs: "Faltan documentos",
    awaiting_approval: "Esperando aprobación",
    active: "Activo",
    review: "En revisión",
    deploying: "Desplegando",
    paused: "Pausado",
    error: "Con error",
    qualified: "Calificado",
    completed: "Completado",
    in_progress: "En progreso",
    monitoring: "Monitoreo",
    new: "Nuevo",
    lead: "Lead",
    customer: "Cliente",
    won: "Ganado",
    lost: "Perdido",
  };
  return map[normalized] ?? String(status ?? "").replace(/[_-]/g, " ");
}

export function DataPanel({
  objects,
  fields,
  views,
  records,
  workspaceSlug,
  currentRole,
  initialObjectId,
  initialViewId,
  workspaceId,
  userId,
  agents,
  primaryAgentId,
}: DataPanelProps) {
  const canWrite = currentRole !== "viewer";
  const isAdmin = currentRole === "admin";

  const [selectedObjectId, setSelectedObjectId] = useState<string>(
    initialObjectId ?? objects[0]?.id ?? "",
  );
  const [selectedViewId, setSelectedViewId] = useState<string>(initialViewId ?? "all");
  const [query, setQuery] = useState("");
  const [localRecords, setLocalRecords] = useState<PrismaWorkspaceRecord[]>(records);
  const [localFields, setLocalFields] = useState<PrismaWorkspaceField[]>(fields);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [recordDraft, setRecordDraft] = useState<Record<string, unknown>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isOperatorOpen, setIsOperatorOpen] = useState(false);
  const router = useRouter();

  const operatorEnabled = Boolean(workspaceId && userId && agents && agents.length > 0);

  useEffect(() => {
    setLocalRecords(records);
  }, [records]);

  useEffect(() => {
    setLocalFields(fields);
  }, [fields]);

  useEffect(() => {
    if (!initialObjectId) return;
    if (initialObjectId !== selectedObjectId) {
      setSelectedObjectId(initialObjectId);
      setSelectedViewId("all");
      setFeedback(null);
    }
  }, [initialObjectId, selectedObjectId]);

  useEffect(() => {
    if (!initialViewId) {
      if (selectedViewId !== "all") setSelectedViewId("all");
      return;
    }
    if (initialViewId !== selectedViewId) setSelectedViewId(initialViewId);
  }, [initialViewId, selectedViewId]);

  const object = useMemo(
    () => objects.find((entry) => entry.id === selectedObjectId) ?? objects[0] ?? null,
    [objects, selectedObjectId],
  );

  const objectFields = useMemo(
    () =>
      localFields
        .filter((field) => field.objectId === object?.id)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [localFields, object?.id],
  );

  const objectViews = useMemo(
    () => views.filter((view) => view.objectId === object?.id),
    [views, object?.id],
  );

  const currentView = useMemo(() => {
    if (selectedViewId === "all") return null;
    return objectViews.find((view) => view.id === selectedViewId) ?? null;
  }, [objectViews, selectedViewId]);

  const scopedRecords = useMemo(
    () => localRecords.filter((record) => record.objectId === object?.id),
    [localRecords, object?.id],
  );

  const visibleRecords = useMemo(() => {
    const viewed = applyViewToRecords(scopedRecords, currentView);
    if (!query.trim()) return viewed;
    const needle = query.trim().toLowerCase();
    return viewed.filter((record) =>
      Object.values(record.data).some((value) =>
        String(value ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [scopedRecords, currentView, query]);

  const { columns, setColumns, reset: resetColumns } = useColumnConfig({
    storageKey: `data:${workspaceSlug}:${object?.id ?? "none"}`,
    defaultColumns: objectFields.map((field) => field.key),
    activeViewId: selectedViewId === "all" ? null : selectedViewId,
    initialViewColumnConfig: currentView?.columnConfig,
    workspaceSlug,
  });

  const visibleFields = useMemo(() => {
    const byKey = new Map(objectFields.map((field) => [field.key, field]));
    const ordered: PrismaWorkspaceField[] = [];
    for (const key of columns) {
      const found = byKey.get(key);
      if (found) ordered.push(found);
    }
    if (ordered.length === 0) return objectFields;
    return ordered;
  }, [objectFields, columns]);

  const detailRecord = useMemo(() => {
    if (!detailRecordId) return null;
    return localRecords.find((record) => record.id === detailRecordId) ?? null;
  }, [localRecords, detailRecordId]);

  function openCreate() {
    if (!canWrite || !object) return;
    const nextDraft = objectFields.reduce<Record<string, unknown>>((acc, field) => {
      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        acc[field.key] = field.type === "boolean" ? field.defaultValue === "true" : field.defaultValue;
      } else {
        acc[field.key] = field.type === "boolean" ? false : "";
      }
      return acc;
    }, {});
    setRecordDraft(nextDraft);
    setFeedback(null);
    setIsCreateOpen(true);
  }

  async function createRecord(draft: Record<string, unknown>) {
    if (!object) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectId: object.id, data: draft }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        record?: PrismaWorkspaceRecord;
      };
      if (!response.ok || !payload.record) {
        throw new Error(payload.error ?? "No se pudo crear el registro.");
      }
      setLocalRecords((current) => [payload.record!, ...current.filter((r) => r.id !== payload.record!.id)]);
      setIsCreateOpen(false);
      setRecordDraft({});
      setFeedback({ tone: "success", message: "Registro creado." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo crear el registro.",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function patchRecord(record: PrismaWorkspaceRecord, data: Record<string, unknown>) {
    const previous = localRecords;
    setLocalRecords((current) =>
      current.map((entry) => (entry.id === record.id ? { ...entry, data } : entry)),
    );
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/records/${encodeURIComponent(record.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        record?: PrismaWorkspaceRecord;
      };
      if (!response.ok || !payload.record) {
        throw new Error(payload.error ?? "No se pudo actualizar el registro.");
      }
      setLocalRecords((current) =>
        current.map((entry) => (entry.id === payload.record!.id ? payload.record! : entry)),
      );
      setFeedback({ tone: "success", message: "Registro actualizado." });
    } catch (error) {
      setLocalRecords(previous);
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo actualizar el registro.",
      });
      throw error;
    }
  }

  async function deleteRecord(recordId: string) {
    const previous = localRecords;
    setLocalRecords((current) => current.filter((entry) => entry.id !== recordId));
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/records/${encodeURIComponent(recordId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo eliminar el registro.");
      }
      setFeedback({ tone: "success", message: "Registro eliminado." });
    } catch (error) {
      setLocalRecords(previous);
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar el registro.",
      });
    }
  }

  async function inlineCreate(draft: Record<string, unknown>) {
    await createRecord(draft);
  }

  async function renameField(fieldId: string, nextName: string) {
    const previous = localFields;
    setLocalFields((current) =>
      current.map((entry) => (entry.id === fieldId ? { ...entry, name: nextName } : entry)),
    );
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/fields/${encodeURIComponent(fieldId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        field?: PrismaWorkspaceField;
      };
      if (!response.ok || !payload.field) {
        throw new Error(payload.error ?? "No se pudo renombrar la columna.");
      }
      setLocalFields((current) =>
        current.map((entry) => (entry.id === payload.field!.id ? payload.field! : entry)),
      );
      setFeedback({ tone: "success", message: "Columna renombrada." });
    } catch (error) {
      setLocalFields(previous);
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo renombrar la columna.",
      });
    }
  }

  const columnOptions = useMemo(
    () => objectFields.map((field) => ({ key: field.key, label: field.name })),
    [objectFields],
  );

  const datasetFieldSummary = useMemo(() => {
    const visibleKeys = new Set(visibleFields.map((field) => field.key));
    const pieces = objectFields.map((field) => {
      const visibilityMark = visibleKeys.has(field.key) ? "" : " [hidden]";
      const requiredMark = field.required ? " *" : "";
      return `${field.name} (${field.key}, ${field.type}${requiredMark})${visibilityMark}`;
    });
    let summary = pieces.join(", ");
    const maxLen = 1600;
    if (summary.length > maxLen) {
      summary = `${summary.slice(0, maxLen - 3).trimEnd()}...`;
    }
    return summary;
  }, [objectFields, visibleFields]);

  // Structured per-field catalog we pass to the chat agent. Keeping this
  // separate from the human-readable summary lets the server serialize it into
  // a stable "use these keys" contract without the agent having to parse
  // prose. Capped at 50 fields to respect the no_prompt_bloat constraint; if a
  // dataset has more the agent can still fetch them via schema.catalog.
  const datasetFieldCatalog = useMemo(() => {
    const visibleKeys = new Set(visibleFields.map((field) => field.key));
    return objectFields.slice(0, 50).map((field) => ({
      key: field.key,
      name: field.name,
      type: field.type,
      required: Boolean(field.required),
      hidden: !visibleKeys.has(field.key),
    }));
  }, [objectFields, visibleFields]);

  function openSettings() {
    if (!object) return;
    setRenameDraft(object.name);
    setConfirmDelete(false);
    setFeedback(null);
    setIsSettingsOpen(true);
  }

  async function renameObject() {
    if (!object) return;
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === object.name) {
      setIsSettingsOpen(false);
      return;
    }
    setIsRenaming(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/objects/${encodeURIComponent(object.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo renombrar la tabla.");
      }
      setIsSettingsOpen(false);
      setFeedback({ tone: "success", message: "Tabla renombrada." });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo renombrar la tabla.",
      });
    } finally {
      setIsRenaming(false);
    }
  }

  async function deleteObject() {
    if (!object) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/objects/${encodeURIComponent(object.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo eliminar la tabla.");
      }
      setIsSettingsOpen(false);
      router.push(`/workspaces/${workspaceSlug}?tab=home`);
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar la tabla.",
      });
      setIsDeleting(false);
    }
  }

  if (!object) {
    return (
      <div style={pageRootStyle}>
        <div style={emptyStateStyle}>
          <div style={emptyIconWrapStyle}>
            <FileStack size={26} color="var(--workspace-accent-strong, #2563eb)" />
          </div>
          <h3 style={emptyTitleStyle}>No hay objetos configurados</h3>
          <p style={emptyDescriptionStyle}>
            Crea un objeto y sus campos desde el panel de administración para empezar a capturar datos.
          </p>
          {isAdmin ? (
            <a
              href={`/workspaces/${workspaceSlug}?tab=fields`}
              style={{ textDecoration: "none" }}
            >
              <Button variant="primary" leadingIcon={<Settings2 size={14} aria-hidden />}>
                Ir a Campos
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  const noRecordsAtAll = scopedRecords.length === 0;
  const filteredEmpty = !noRecordsAtAll && visibleRecords.length === 0;

  return (
    <div style={pageRootStyle}>
      {/* Page header */}
      <header style={headerWrapStyle}>
        <div style={headerTitleColStyle}>
          <span style={eyebrowStyle}>Datos</span>
          <h2 style={titleStyle}>{object.name}</h2>
          <p style={subtitleStyle}>
            {visibleRecords.length} {visibleRecords.length === 1 ? "registro" : "registros"} ·{" "}
            {objectFields.length} {objectFields.length === 1 ? "campo" : "campos"} ·{" "}
            {objectViews.length} {objectViews.length === 1 ? "vista" : "vistas"} guardadas
            {!canWrite ? " · Solo lectura" : ""}
          </p>
        </div>

        <div style={headerActionsStyle}>
          {canWrite ? (
            <Button
              variant="primary"
              leadingIcon={<Plus size={14} aria-hidden />}
              onClick={openCreate}
            >
              Nuevo registro
            </Button>
          ) : null}
          {isAdmin ? (
            <Button
              variant="ghost"
              compact
              onClick={openSettings}
              aria-label="Configurar tabla"
              title="Configurar tabla"
            >
              <Settings2 size={14} aria-hidden />
            </Button>
          ) : null}
        </div>
      </header>

      {/* Controls toolbar */}
      <Toolbar style={topBarExtraStyle}>
        <label style={selectGroupStyle}>
          <span style={selectLabelStyle}>Vista</span>
          <Select
            value={selectedViewId}
            onChange={(event) => setSelectedViewId(event.currentTarget.value)}
            style={{ border: "none", background: "transparent", height: 30, padding: "0 4px" }}
          >
            <option value="all">Todas</option>
            {objectViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </Select>
        </label>

        <ColumnPicker
          options={columnOptions}
          value={columns}
          onChange={setColumns}
          onReset={resetColumns}
        />

        <Button
          variant="ghost"
          leadingIcon={<History size={14} aria-hidden />}
          onClick={() => setIsHistoryOpen(true)}
        >
          Historial
        </Button>

        {operatorEnabled ? (
          <Button
            variant="ghost"
            leadingIcon={<MessageSquare size={13} aria-hidden />}
            onClick={() => setIsOperatorOpen(true)}
            style={operatorButtonStyle}
            title="Abrir copiloto para operar sobre esta tabla"
          >
            Habla con Operador
          </Button>
        ) : null}

        <ToolbarSpacer />

        <div style={searchWrapStyle}>
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Buscar por cualquier campo"
          />
        </div>
      </Toolbar>

      {feedback ? (
        <div style={feedback.tone === "error" ? errorBannerStyle : successBannerStyle}>
          {feedback.message}
        </div>
      ) : null}

      {/* Grid or empty states */}
      {noRecordsAtAll ? (
        <div style={emptyStateStyle}>
          <div style={emptyIconWrapStyle}>
            <Sparkles size={26} color="var(--workspace-accent-strong, #2563eb)" />
          </div>
          <h3 style={emptyTitleStyle}>Aún no hay registros en {object.name}</h3>
          <p style={emptyDescriptionStyle}>
            {canWrite
              ? "Agrega el primer registro desde aquí o usa la fila final de la tabla para capturar datos rápidamente."
              : "Pide a un miembro con permisos que cree registros en este objeto."}
          </p>
          {canWrite ? (
            <Button
              variant="primary"
              leadingIcon={<Plus size={14} aria-hidden />}
              onClick={openCreate}
            >
              Crear primer registro
            </Button>
          ) : null}
        </div>
      ) : filteredEmpty ? (
        <div style={emptyStateStyle}>
          <div style={emptyIconWrapStyle}>
            <FileStack size={26} color="var(--workspace-accent-strong, #2563eb)" />
          </div>
          <h3 style={emptyTitleStyle}>Sin resultados</h3>
          <p style={emptyDescriptionStyle}>
            No hay registros que coincidan con{query ? ' la búsqueda "' + query + '"' : " la vista seleccionada"}.
            Limpia la búsqueda o cambia a la vista “Todas”.
          </p>
          <div style={{ display: "inline-flex", gap: 8 }}>
            {query ? (
              <Button variant="ghost" onClick={() => setQuery("")}>
                Limpiar búsqueda
              </Button>
            ) : null}
            {selectedViewId !== "all" ? (
              <Button variant="ghost" onClick={() => setSelectedViewId("all")}>
                Ver todas
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <EditableGrid
          fields={visibleFields}
          records={visibleRecords}
          canWrite={canWrite}
          formatStatusLabel={formatStatusLabel}
          onPatchRecord={patchRecord}
          onDeleteRecord={(id) => void deleteRecord(id)}
          onInlineCreate={canWrite ? inlineCreate : undefined}
          onOpenRecord={(id) => setDetailRecordId(id)}
          canRenameColumns={isAdmin}
          onRenameField={isAdmin ? renameField : undefined}
          onHeaderAddRow={canWrite ? openCreate : undefined}
        />
      )}

      {/* Create modal */}
      {isCreateOpen && object ? (
        <div style={modalBackdropStyle} onClick={() => !isBusy && setIsCreateOpen(false)}>
          <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <span style={eyebrowStyle}>Nuevo registro</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{object.name}</h3>
              </div>
              <Button
                variant="ghost"
                compact
                onClick={() => setIsCreateOpen(false)}
                disabled={isBusy}
                aria-label="Cerrar"
              >
                <X size={14} aria-hidden />
              </Button>
            </div>

            <div style={modalFieldsStyle}>
              {objectFields.map((field) => {
                const value = recordDraft[field.key] ?? "";
                const options = Array.isArray(field.options.values)
                  ? (field.options.values as unknown[]).map((v) => String(v ?? "").trim()).filter(Boolean)
                  : [];
                return (
                  <label key={field.id} style={modalFieldStyle}>
                    <span style={modalFieldLabelStyle}>
                      {field.name}
                      {field.required ? " *" : ""}
                    </span>
                    {field.type === "status" || field.type === "select" ? (
                      <Select
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setRecordDraft((current) => ({ ...current, [field.key]: event.currentTarget.value }))
                        }
                      >
                        <option value="">{field.required ? "Selecciona" : "Sin valor"}</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {formatStatusLabel(option)}
                          </option>
                        ))}
                      </Select>
                    ) : field.type === "boolean" ? (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) =>
                            setRecordDraft((current) => ({
                              ...current,
                              [field.key]: event.target.checked,
                            }))
                          }
                        />
                        Activo
                      </label>
                    ) : (
                      <input
                        className="ws-input"
                        type={
                          field.type === "number" || field.type === "currency"
                            ? "number"
                            : field.type === "date"
                              ? "date"
                              : "text"
                        }
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setRecordDraft((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                variant="ghost"
                onClick={() => setIsCreateOpen(false)}
                disabled={isBusy}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={isBusy}
                onClick={() => void createRecord(recordDraft)}
              >
                {isBusy ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Record detail drawer */}
      {detailRecord ? (
        <RecordDetailDrawer
          workspaceSlug={workspaceSlug}
          record={detailRecord}
          objectName={object.name}
          fields={objectFields}
          canWrite={canWrite}
          onClose={() => setDetailRecordId(null)}
          onPatchRecord={patchRecord}
          onDeleteRecord={(id) => void deleteRecord(id)}
          formatStatusLabel={formatStatusLabel}
        />
      ) : null}

      {/* Table settings modal */}
      {isSettingsOpen && object ? (
        <div
          style={modalBackdropStyle}
          onClick={() => {
            if (isRenaming || isDeleting) return;
            setIsSettingsOpen(false);
          }}
        >
          <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <span style={eyebrowStyle}>Configurar tabla</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{object.name}</h3>
              </div>
              <Button
                variant="ghost"
                compact
                onClick={() => setIsSettingsOpen(false)}
                disabled={isRenaming || isDeleting}
                aria-label="Cerrar"
              >
                <X size={14} aria-hidden />
              </Button>
            </div>

            <label style={modalFieldStyle}>
              <span style={modalFieldLabelStyle}>Nombre de la tabla</span>
              <input
                className="ws-input"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                disabled={isRenaming || isDeleting}
                autoFocus
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                variant="ghost"
                onClick={() => setIsSettingsOpen(false)}
                disabled={isRenaming || isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={isRenaming || isDeleting || !renameDraft.trim() || renameDraft.trim() === object.name}
                onClick={() => void renameObject()}
              >
                {isRenaming ? "Guardando…" : "Guardar nombre"}
              </Button>
            </div>

            {!object.isSystem && object.kind === null ? (
              <div style={dangerZoneStyle}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Zona de peligro</div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                    Eliminar esta tabla borrará también todos sus registros, campos y vistas.
                  </p>
                </div>
                {confirmDelete ? (
                  <div style={{ display: "inline-flex", gap: 8 }}>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={isDeleting}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      leadingIcon={<Trash2 size={14} aria-hidden />}
                      onClick={() => void deleteObject()}
                      disabled={isDeleting}
                      style={{ background: "#b91c1c", borderColor: "#b91c1c" }}
                    >
                      {isDeleting ? "Eliminando…" : "Confirmar eliminación"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    leadingIcon={<Trash2 size={14} aria-hidden />}
                    onClick={() => setConfirmDelete(true)}
                    disabled={isRenaming || isDeleting}
                    style={{ color: "#b91c1c", borderColor: "rgba(185, 28, 28, 0.35)" }}
                  >
                    Eliminar tabla
                  </Button>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
                Esta tabla es parte del sistema y no se puede eliminar.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Object-wide history drawer */}
      {isHistoryOpen ? (
        <HistoryDrawer
          workspaceSlug={workspaceSlug}
          objectId={object.id}
          objectName={object.name}
          onClose={() => setIsHistoryOpen(false)}
          onOpenRecord={(id) => {
            setIsHistoryOpen(false);
            setDetailRecordId(id);
          }}
        />
      ) : null}

      {/* Operator copilot sidebar */}
      {operatorEnabled ? (
        <OperatorCopilotSidebar
          open={isOperatorOpen}
          onClose={() => setIsOperatorOpen(false)}
          workspaceId={workspaceId!}
          workspaceSlug={workspaceSlug}
          userId={userId!}
          agents={agents!}
          primaryAgentId={primaryAgentId ?? null}
          appContext={{
            current_tab: "data",
            current_object: object?.name ?? null,
            current_view: currentView?.name ?? null,
            current_record_title: null,
            queue_preview: [],
            dataset_object_id: object?.id ?? null,
            dataset_object_slug: object?.slug ?? null,
            dataset_search_query: query.trim() ? query.trim() : null,
            visible_record_count: visibleRecords.length,
            dataset_field_summary: datasetFieldSummary,
            dataset_field_catalog: datasetFieldCatalog,
          }}
        />
      ) : null}
    </div>
  );
}

const pageRootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  minWidth: 0,
  width: "100%",
  maxWidth: "100%",
};

const headerWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  padding: "2px 2px 4px",
};

const headerTitleColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  gap: 2,
  flex: "1 1 260px",
};

const headerActionsStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const topBarExtraStyle: CSSProperties = {
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-muted)",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 22,
  fontWeight: 700,
  color: "var(--workspace-text)",
  lineHeight: 1.2,
};

const subtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const selectGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 10px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
};

const selectLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--workspace-muted)",
};

const errorBannerStyle: CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.25)",
  borderRadius: "var(--radius-md)",
};

const successBannerStyle: CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  color: "#065f46",
  background: "rgba(16, 185, 129, 0.08)",
  border: "1px solid rgba(16, 185, 129, 0.25)",
  borderRadius: "var(--radius-md)",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "56px 24px",
  background: "#ffffff",
  border: "1px dashed var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  textAlign: "center",
};

const emptyIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 52,
  height: 52,
  borderRadius: "50%",
  background: "rgba(37, 99, 235, 0.08)",
  border: "1px solid rgba(37, 99, 235, 0.18)",
  marginBottom: 2,
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const emptyDescriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-muted)",
  maxWidth: 460,
  lineHeight: 1.5,
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
  width: "min(560px, 92vw)",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  boxShadow: "0 24px 64px rgba(15, 23, 42, 0.25)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const modalFieldsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const modalFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const modalFieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--workspace-muted)",
};

const dangerZoneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
  borderRadius: "var(--radius-md)",
  border: "1px solid rgba(185, 28, 28, 0.25)",
  background: "rgba(239, 68, 68, 0.04)",
  marginTop: 6,
};

const searchWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 240,
  maxWidth: 360,
  flex: "1 1 240px",
};

const operatorButtonStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--workspace-accent-strong, #2563eb)",
  borderColor: "rgba(37, 99, 235, 0.35)",
  background: "rgba(37, 99, 235, 0.06)",
};
