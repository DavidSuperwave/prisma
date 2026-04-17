"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileStack, MessageSquare, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import type {
  PrismaWorkspaceActivity,
  PrismaWorkspaceAgent,
  PrismaWorkspaceField,
  PrismaWorkspaceObject,
} from "@/lib/workspaceStore";

type ImportPanelProps = {
  workspaceSlug: string;
  objects: PrismaWorkspaceObject[];
  fields: PrismaWorkspaceField[];
};

type FieldsPanelProps = {
  workspaceSlug: string;
  currentRole: "admin" | "operator" | "viewer";
  objects: PrismaWorkspaceObject[];
  fields: PrismaWorkspaceField[];
};

type ChannelsPanelProps = {
  workspaceSlug: string;
  currentRole: "admin" | "operator" | "viewer";
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    apiEndpoint?: string;
    apiKey?: string;
  }>;
};

type ActivityPanelProps = {
  workspaceSlug: string;
  agents: PrismaWorkspaceAgent[];
  initialActivity: PrismaWorkspaceActivity[];
};

type ImportPreviewColumn = {
  sourceKey: string;
  fieldKey: string;
};

type ImportSummary = {
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
};

const IMPORT_BATCH_SIZE = 500;
const IMPORT_PREVIEW_ROWS = 8;

type GatewayStatus = {
  status?: string;
  paired?: boolean;
  qr?: string | null;
  lastSeen?: string | null;
};

type ImportTypeWarning = {
  column: string;
  expectedType: string;
  sample: string;
};

type ChannelConfigState = {
  provider?: string;
  mode?: string;
  phoneLabel?: string;
  qr?: string | null;
  paired?: boolean;
  status?: string;
  lastSeen?: string | null;
};

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <header style={panelHeaderStyle}>
        <p style={eyebrowStyle}>{eyebrow}</p>
        <h2 style={panelTitleStyle}>{title}</h2>
        {description ? <p style={panelDescriptionStyle}>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const palette =
    tone === "success"
      ? { background: "rgba(23, 164, 102, 0.12)", color: "#0f8a52" }
      : tone === "warning"
        ? { background: "rgba(245, 158, 11, 0.16)", color: "#92400e" }
        : tone === "danger"
          ? { background: "rgba(220, 38, 38, 0.12)", color: "#b42318" }
          : { background: "rgba(15, 23, 42, 0.07)", color: "var(--workspace-text)" };

  return (
    <span
      style={{
        ...pillStyle,
        background: palette.background,
        color: palette.color,
      }}
    >
      {children}
    </span>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ComponentType<{ size?: number }>; title: string; description: string }) {
  return (
    <div style={emptyStateStyle}>
      <div style={emptyIconStyle}>
        <Icon size={18} />
      </div>
      <div>
        <p style={emptyTitleStyle}>{title}</p>
        <p style={emptyCopyStyle}>{description}</p>
      </div>
    </div>
  );
}

function formatStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "pending") return "Pendiente";
  if (normalized === "needs_review") return "Por revisar";
  if (normalized === "follow_up") return "Seguimiento";
  if (normalized === "pending_docs") return "Faltan documentos";
  if (normalized === "awaiting_approval") return "Esperando aprobación";
  if (normalized === "active") return "Activo";
  if (normalized === "review") return "En revisión";
  if (normalized === "deploying") return "Desplegando";
  if (normalized === "paused") return "Pausado";
  if (normalized === "error") return "Con error";
  if (normalized === "qualified") return "Calificado";
  if (normalized === "copilot") return "Copilot";
  if (normalized === "channel") return "Canal";
  if (normalized === "worker") return "Operativo";
  return status.replace(/_/g, " ");
}

function parseSelectOptions(field: PrismaWorkspaceField) {
  const rawValues =
    Array.isArray(field.options.values) ? field.options.values : Array.isArray(field.options.options) ? field.options.options : [];
  return rawValues
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function normalizeColumnKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanizeActivityAction(action: string) {
  const normalized = action.trim().toLowerCase();
  if (normalized === "receivable.flagged") return "Cobranza marcada para revisión";
  if (normalized === "lead.qualified") return "Lead calificado";
  if (normalized === "document.uploaded_via_chat") return "Documento subido por chat";
  if (normalized === "workspace.seeded") return "Workspace inicializado";
  if (normalized === "sent_email") return "Correo enviado";
  if (normalized === "cron.executed") return "Cron ejecutado";
  if (normalized === "rate_offer.generated") return "Oferta generada";
  if (normalized === "rate_offer.approved") return "Oferta aprobada";
  return action.replace(/[._]/g, " ").replace(/^\w/, (value) => value.toUpperCase());
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseCsv(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { headers: [], rows: [] as Array<Record<string, unknown>> };
  }
  const headers = lines[0].split(",").map((entry) => entry.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",");
    return headers.reduce<Record<string, unknown>>((accumulator, header, index) => {
      accumulator[header] = cells[index]?.trim() ?? "";
      return accumulator;
    }, {});
  });
  return { headers, rows };
}

export function ImportPanel({ workspaceSlug, objects, fields }: ImportPanelProps) {
  const [selectedObjectId, setSelectedObjectId] = useState<string>(objects[0]?.id ?? "");
  const [dedupeFieldKey, setDedupeFieldKey] = useState<string>("none");
  const [fileName, setFileName] = useState<string>("");
  const [previewColumns, setPreviewColumns] = useState<ImportPreviewColumn[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [typeWarnings, setTypeWarnings] = useState<string[]>([]);
  const [totalSourceRows, setTotalSourceRows] = useState(0);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; fileName: string; rowsTotal: number; rowsImported: number; rowsSkipped: number; createdAt: string }>>([]);

  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? objects[0] ?? null;
  const selectedFields = fields
    .filter((field) => field.objectId === selectedObject?.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  useEffect(() => {
    setPreviewColumns([]);
    setPreviewRows([]);
    setImportSummary(null);
    setTypeWarnings([]);
    setTotalSourceRows(0);
    setError("");
  }, [selectedObjectId]);

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/imports?limit=8`);
        const payload = (await response.json().catch(() => ({}))) as {
          imports?: Array<{
            id: string;
            fileName: string;
            rowsTotal: number;
            rowsImported: number;
            rowsSkipped: number;
            createdAt: string;
          }>;
        };
        if (!response.ok) return;
        setHistory(payload.imports ?? []);
      } catch {
        // Ignore transient load errors.
      }
    }
    void loadHistory();
  }, [workspaceSlug, importSummary]);

  async function loadImportFile(file: File) {
    try {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const fileBuffer = await file.arrayBuffer();
      let headers: string[] = [];
      let rows: Array<Record<string, unknown>> = [];

      if (extension === "csv") {
        const text = new TextDecoder("utf-8").decode(fileBuffer);
        const parsed = parseCsv(text);
        headers = parsed.headers;
        rows = parsed.rows;
      } else if (extension === "xlsx" || extension === "xls") {
        const workbook = XLSX.read(fileBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
        if (!firstSheet) {
          throw new Error("No se encontró una hoja válida en el archivo.");
        }
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: "",
          raw: false,
        });
        rows = jsonRows;
        headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
      } else {
        throw new Error("Solo se permiten archivos CSV o XLSX.");
      }

      if (rows.length === 0 || headers.length === 0) {
        throw new Error("El archivo no contiene filas para importar.");
      }

      const nextColumns = headers.map((sourceKey) => {
        const normalized = normalizeColumnKey(sourceKey);
        const matchedField = selectedFields.find(
          (field) => field.key === normalized || normalizeColumnKey(field.name) === normalized,
        );
        return {
          sourceKey,
          fieldKey: matchedField?.key ?? "skip",
        } satisfies ImportPreviewColumn;
      });

      const warnings = rows.reduce<string[]>((accumulator, row, rowIndex) => {
        if (rowIndex >= 5) return accumulator;
        selectedFields.forEach((field) => {
          const value = row[field.key];
          if (value === null || value === undefined || value === "") return;
          if ((field.type === "number" || field.type === "currency") && Number.isNaN(Number(value))) {
            accumulator.push(`Fila ${rowIndex + 1}: "${field.name}" debe ser numérico.`);
          }
          if (field.type === "boolean" && !["true", "false", "1", "0", "sí", "si", "no"].includes(String(value).toLowerCase())) {
            accumulator.push(`Fila ${rowIndex + 1}: "${field.name}" debe ser booleano.`);
          }
          if (field.type === "date" && Number.isNaN(new Date(String(value)).getTime())) {
            accumulator.push(`Fila ${rowIndex + 1}: "${field.name}" debe ser una fecha válida.`);
          }
        });
        return accumulator;
      }, []);

      setPreviewColumns(nextColumns);
      setPreviewRows(rows);
      setTotalSourceRows(rows.length);
      setTypeWarnings(warnings.slice(0, 6));
      setImportSummary(null);
      setError("");
      setFileName(file.name);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo leer el archivo.");
      setPreviewColumns([]);
      setPreviewRows([]);
      setTypeWarnings([]);
      setTotalSourceRows(0);
    }
  }

  function mappedRowsForImport() {
    const activeColumns = previewColumns.filter((column) => column.fieldKey !== "skip");
    return previewRows.map((row) =>
      activeColumns.reduce<Record<string, unknown>>((accumulator, column) => {
        accumulator[column.fieldKey] = row[column.sourceKey];
        return accumulator;
      }, {}),
    );
  }

  async function runImport() {
    if (!selectedObject || previewColumns.length === 0 || previewRows.length === 0 || isImporting) {
      return;
    }

    const mappedRows = mappedRowsForImport();
    if (mappedRows.length === 0) {
      setError("Debes mapear al menos una columna a un campo.");
      return;
    }

    setIsImporting(true);
    setError("");
    try {
      let imported = 0;
      let skipped = 0;
      for (let index = 0; index < mappedRows.length; index += IMPORT_BATCH_SIZE) {
        const batch = mappedRows.slice(index, index + IMPORT_BATCH_SIZE);
        const response = await fetch(`/api/workspaces/${workspaceSlug}/imports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectId: selectedObject.id,
            rows: batch,
            dedupeFieldKey: dedupeFieldKey === "none" ? undefined : dedupeFieldKey,
            fileName,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          import?: ImportSummary;
        };
        if (!response.ok || !payload.import) {
          throw new Error(payload.error ?? "No se pudo ejecutar la importación.");
        }
        imported += payload.import.rowsImported;
        skipped += payload.import.rowsSkipped;
      }

      setImportSummary({
        rowsTotal: mappedRows.length,
        rowsImported: imported,
        rowsSkipped: skipped,
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo ejecutar la importación.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Importaciones"
        title="Importar datos"
        description="Sube CSV o XLSX, revisa mapeo, valida muestra y ejecuta carga por lotes."
      >
        <div style={toolbarStyle}>
          <div style={pickerGroupStyle}>
            <label style={inputLabelStyle}>
              Objeto destino
              <select value={selectedObjectId} onChange={(event) => setSelectedObjectId(event.target.value)} style={inputStyle}>
                {objects.map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={inputLabelStyle}>
              Dedupe por campo
              <select value={dedupeFieldKey} onChange={(event) => setDedupeFieldKey(event.target.value)} style={inputStyle}>
                <option value="none">Sin dedupe</option>
                {selectedFields.map((field) => (
                  <option key={field.id} value={field.key}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={actionButtonStyle}>
            <Upload size={14} />
            Cargar archivo
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void loadImportFile(file);
              }}
            />
          </label>
        </div>

        {error ? <p style={inlineErrorStyle}>{error}</p> : null}
        {importSummary ? (
          <div style={statusRowStyle}>
            <StatusPill tone="success">Importadas: {importSummary.rowsImported}</StatusPill>
            <StatusPill tone="warning">Omitidas: {importSummary.rowsSkipped}</StatusPill>
            <StatusPill tone="neutral">Total: {importSummary.rowsTotal}</StatusPill>
          </div>
        ) : null}
        {typeWarnings.length > 0 ? (
          <div style={warningListStyle}>
            {typeWarnings.map((warning) => (
              <p key={warning} style={warningTextStyle}>
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        {previewColumns.length > 0 ? (
          <div style={stackStyle}>
            <div style={panelHeaderInlineStyle}>
              <p style={panelDescriptionStyle}>
                Archivo: {fileName || "sin nombre"} · {totalSourceRows} filas detectadas
              </p>
              <button type="button" style={primaryButtonStyle} onClick={() => void runImport()} disabled={isImporting}>
                {isImporting ? "Importando..." : "Ejecutar importación"}
              </button>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeadStyle}>Columna origen</th>
                    <th style={tableHeadStyle}>Campo destino</th>
                  </tr>
                </thead>
                <tbody>
                  {previewColumns.map((column, index) => (
                    <tr key={`${column.sourceKey}-${index}`}>
                      <td style={tableCellStyle}>{column.sourceKey}</td>
                      <td style={tableCellStyle}>
                        <select
                          value={column.fieldKey}
                          onChange={(event) =>
                            setPreviewColumns((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, fieldKey: event.target.value } : entry,
                              ),
                            )
                          }
                          style={inputStyle}
                        >
                          <option value="skip">Omitir columna</option>
                          {selectedFields.map((field) => (
                            <option key={field.id} value={field.key}>
                              {field.name} ({field.key})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column.sourceKey} style={tableHeadStyle}>
                        {column.sourceKey}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, IMPORT_PREVIEW_ROWS).map((row, rowIndex) => (
                    <tr key={`preview-${rowIndex}`}>
                      {previewColumns.map((column) => (
                        <td key={`${rowIndex}-${column.sourceKey}`} style={tableCellStyle}>
                          {String(row[column.sourceKey] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Download}
            title="Importa hasta 500 filas por lote"
            description="Sube un CSV/XLSX para mapear columnas y cargar datos con dedupe opcional."
          />
        )}

        {history.length > 0 ? (
          <div style={historyStyle}>
            <h4 style={historyTitleStyle}>Historial reciente</h4>
            <div style={historyListStyle}>
              {history.map((entry) => (
                <div key={entry.id} style={historyItemStyle}>
                  <div>
                    <p style={historyFileStyle}>{entry.fileName}</p>
                    <p style={historyMetaStyle}>
                      Total {entry.rowsTotal} · Importadas {entry.rowsImported} · Omitidas {entry.rowsSkipped}
                    </p>
                  </div>
                  <p style={historyMetaStyle}>{new Date(entry.createdAt).toLocaleString("es-MX")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

export function FieldsPanel({ workspaceSlug, currentRole, objects, fields }: FieldsPanelProps) {
  const canManage = currentRole === "admin";
  const [selectedObjectId, setSelectedObjectId] = useState<string>(objects[0]?.id ?? "");
  const [localFields, setLocalFields] = useState<PrismaWorkspaceField[]>(fields);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    key: "",
    type: "text",
    required: false,
    optionsRaw: "",
  });

  useEffect(() => {
    setLocalFields(fields);
  }, [fields]);

  const selectedFields = useMemo(
    () => localFields.filter((field) => field.objectId === selectedObjectId).sort((a, b) => a.sortOrder - b.sortOrder),
    [localFields, selectedObjectId],
  );

  function resetDraft() {
    setDraft({ name: "", key: "", type: "text", required: false, optionsRaw: "" });
    setEditingFieldId(null);
  }

  async function saveField() {
    if (!canManage || isSaving || !selectedObjectId) return;
    const name = draft.name.trim();
    const key = (draft.key.trim() || normalizeColumnKey(name)).toLowerCase();
    if (!name || !key) {
      setError("Nombre y clave son obligatorios.");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const options = draft.optionsRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (editingFieldId) {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/fields/${editingFieldId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            required: draft.required,
            options: options.length > 0 ? { values: options } : {},
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          field?: PrismaWorkspaceField;
        };
        if (!response.ok || !payload.field) {
          throw new Error(payload.error ?? "No se pudo actualizar el campo.");
        }
        setLocalFields((current) => current.map((field) => (field.id === payload.field!.id ? payload.field! : field)));
        setSuccess("Campo actualizado.");
      } else {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/fields`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectId: selectedObjectId,
            name,
            key,
            type: draft.type,
            required: draft.required,
            options: options.length > 0 ? { values: options } : {},
            sortOrder: selectedFields.length + 1,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          field?: PrismaWorkspaceField;
        };
        if (!response.ok || !payload.field) {
          throw new Error(payload.error ?? "No se pudo crear el campo.");
        }
        setLocalFields((current) => [...current, payload.field!]);
        setSuccess("Campo creado.");
      }
      resetDraft();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar el campo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteField(fieldId: string) {
    if (!canManage || isSaving) return;
    const confirmed = window.confirm("Esta acción eliminará el campo. ¿Deseas continuar?");
    if (!confirmed) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/fields/${fieldId}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; deletedFieldId?: string };
      if (!response.ok || !payload.deletedFieldId) {
        throw new Error(payload.error ?? "No se pudo eliminar el campo.");
      }
      setLocalFields((current) => current.filter((field) => field.id !== payload.deletedFieldId));
      if (editingFieldId === fieldId) resetDraft();
      setSuccess("Campo eliminado.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo eliminar el campo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveField(field: PrismaWorkspaceField, direction: "up" | "down") {
    if (!canManage || isSaving) return;
    const ordered = [...selectedFields];
    const index = ordered.findIndex((entry) => entry.id === field.id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const target = ordered[targetIndex];

    setIsSaving(true);
    setError("");
    try {
      const [first, second] = await Promise.all([
        fetch(`/api/workspaces/${workspaceSlug}/fields/${field.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: target.sortOrder }),
        }),
        fetch(`/api/workspaces/${workspaceSlug}/fields/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: field.sortOrder }),
        }),
      ]);
      const firstPayload = (await first.json().catch(() => ({}))) as { error?: string; field?: PrismaWorkspaceField };
      const secondPayload = (await second.json().catch(() => ({}))) as { error?: string; field?: PrismaWorkspaceField };
      if (!first.ok || !second.ok || !firstPayload.field || !secondPayload.field) {
        throw new Error(firstPayload.error ?? secondPayload.error ?? "No se pudo reordenar.");
      }
      setLocalFields((current) =>
        current.map((entry) => {
          if (entry.id === firstPayload.field!.id) return firstPayload.field!;
          if (entry.id === secondPayload.field!.id) return secondPayload.field!;
          return entry;
        }),
      );
      setSuccess("Orden actualizado.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo reordenar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Campos"
        title="Gestionar campos"
        description="Administra esquema por objeto: crear, editar, eliminar y ordenar campos."
      >
        <div style={toolbarStyle}>
          <label style={inputLabelStyle}>
            Objeto
            <select value={selectedObjectId} onChange={(event) => setSelectedObjectId(event.target.value)} style={inputStyle}>
              {objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </select>
          </label>
          {!canManage ? <StatusPill tone="warning">Solo administradores pueden editar campos</StatusPill> : null}
        </div>

        {error ? <p style={inlineErrorStyle}>{error}</p> : null}
        {success ? <p style={inlineSuccessStyle}>{success}</p> : null}

        <div style={fieldsLayoutStyle}>
          <div style={fieldsListStyle}>
            {selectedFields.length > 0 ? (
              selectedFields.map((field) => (
                <div key={field.id} style={fieldItemStyle}>
                  <div>
                    <p style={fieldNameStyle}>
                      {field.name} <span style={fieldKeyStyle}>({field.key})</span>
                    </p>
                    <p style={fieldMetaStyle}>
                      {formatStatusLabel(field.type)} · {field.required ? "Obligatorio" : "Opcional"}
                    </p>
                  </div>
                  <div style={fieldActionsStyle}>
                    <button type="button" style={actionButtonStyle} onClick={() => void moveField(field, "up")} disabled={!canManage || isSaving}>
                      Arriba
                    </button>
                    <button type="button" style={actionButtonStyle} onClick={() => void moveField(field, "down")} disabled={!canManage || isSaving}>
                      Abajo
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle}
                      onClick={() => {
                        setEditingFieldId(field.id);
                        setDraft({
                          name: field.name,
                          key: field.key,
                          type: field.type,
                          required: field.required,
                          optionsRaw: parseSelectOptions(field).join(", "),
                        });
                      }}
                      disabled={!canManage || isSaving}
                    >
                      Editar
                    </button>
                    <button type="button" style={dangerButtonStyle} onClick={() => void deleteField(field.id)} disabled={!canManage || isSaving}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                icon={FileStack}
                title="Sin campos en este objeto"
                description="Agrega tu primer campo para habilitar captura y vistas."
              />
            )}
          </div>

          <div style={fieldEditorStyle}>
            <h4 style={fieldEditorTitleStyle}>{editingFieldId ? "Editar campo" : "Nuevo campo"}</h4>
            <label style={inputLabelStyle}>
              Nombre
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                    key: current.key || normalizeColumnKey(event.target.value),
                  }))
                }
                style={inputStyle}
                disabled={!canManage || isSaving}
              />
            </label>
            <label style={inputLabelStyle}>
              Clave
              <input
                value={draft.key}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    key: normalizeColumnKey(event.target.value),
                  }))
                }
                style={inputStyle}
                disabled={Boolean(editingFieldId) || !canManage || isSaving}
              />
            </label>
            <label style={inputLabelStyle}>
              Tipo
              <select
                value={draft.type}
                onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
                style={inputStyle}
                disabled={Boolean(editingFieldId) || !canManage || isSaving}
              >
                {["text", "number", "currency", "date", "boolean", "select", "status", "file", "relation"].map((type) => (
                  <option key={type} value={type}>
                    {formatStatusLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label style={inputLabelStyle}>
              Opciones (CSV)
              <input
                value={draft.optionsRaw}
                onChange={(event) => setDraft((current) => ({ ...current, optionsRaw: event.target.value }))}
                style={inputStyle}
                disabled={!canManage || isSaving}
              />
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))}
                disabled={!canManage || isSaving}
              />
              Campo obligatorio
            </label>
            <div style={fieldEditorActionsStyle}>
              <button type="button" style={primaryButtonStyle} onClick={() => void saveField()} disabled={!canManage || isSaving}>
                {isSaving ? "Guardando..." : editingFieldId ? "Guardar cambios" : "Crear campo"}
              </button>
              {editingFieldId ? (
                <button type="button" style={actionButtonStyle} onClick={resetDraft} disabled={isSaving}>
                  Cancelar edición
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function ChannelsPanel({ workspaceSlug, currentRole, agents }: ChannelsPanelProps) {
  const channelAgents = agents.filter((agent) => agent.type === "channel");
  const [selectedAgentId, setSelectedAgentId] = useState<string>(channelAgents[0]?.id ?? "");
  const [channelConfigDraft, setChannelConfigDraft] = useState("{}");
  const [statusMessage, setStatusMessage] = useState("");
  const [gatewayStatus, setGatewayStatus] = useState<{
    status?: string;
    paired?: boolean;
    qr?: string | null;
    lastSeen?: string | null;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");
  const [runtimeState, setRuntimeState] = useState<"reachable" | "unreachable" | "missing_endpoint" | "missing_api_key" | "unknown">("unknown");
  const [runtimeMessage, setRuntimeMessage] = useState<string>("Aún no se ha validado el runtime.");
  const [conversations, setConversations] = useState<Array<{
    id: string;
    title: string;
    messageCount: number;
    lastMessageAt: string | null;
  }>>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [conversationMessages, setConversationMessages] = useState<Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }>>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const selectedAgent = channelAgents.find((agent) => agent.id === selectedAgentId) ?? channelAgents[0] ?? null;
  const canManage = currentRole === "admin";

  const loadConversationThread = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/conversations/${conversationId}/messages?includeShared=true&limit=120`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        messages?: Array<{
          id: string;
          role: string;
          content: string;
          createdAt: string;
        }>;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cargar el transcript.");
      }
      setConversationMessages(payload.messages ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el transcript.");
      setConversationMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [workspaceSlug]);

  const loadChannelConversations = useCallback(async (agentId: string) => {
    setIsLoadingConversations(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/conversations?agentId=${encodeURIComponent(agentId)}&includeShared=true&limit=30`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversations?: Array<{
          id: string;
          title: string;
          messageCount: number;
          lastMessageAt: string | null;
        }>;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudieron cargar las conversaciones de canal.");
      }
      const nextConversations = payload.conversations ?? [];
      setConversations(nextConversations);
      setSelectedConversationId((current) => {
        if (current && nextConversations.some((conversation) => conversation.id === current)) {
          return current;
        }
        return nextConversations[0]?.id ?? "";
      });
      if (nextConversations.length === 0) {
        setConversationMessages([]);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudieron cargar las conversaciones.");
      setConversations([]);
      setConversationMessages([]);
      setSelectedConversationId("");
    } finally {
      setIsLoadingConversations(false);
    }
  }, [workspaceSlug]);

  function defaultChannelConfig(agentName: string) {
    return {
      provider: "whatsapp",
      mode: "gateway",
      phoneLabel: agentName,
    };
  }

  const loadAgentChannelStatus = useCallback(async (agentId: string, fallbackName: string) => {
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/agents/${agentId}?channelStatus=true`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: {
          channelConfig?: Record<string, unknown>;
          status?: string;
          lastHealthCheckAt?: string | null;
          channelStatus?: {
            status?: string;
            paired?: boolean;
            qr?: string | null;
            lastSeen?: string | null;
          } | null;
          runtimeDiagnostics?: {
            runtimeState?: "reachable" | "unreachable" | "missing_endpoint" | "missing_api_key";
            message?: string;
          };
        };
      };
      if (!response.ok || !payload.agent) {
        throw new Error(payload.error ?? "No se pudo cargar la configuración del canal.");
      }

      const config =
        payload.agent.channelConfig && typeof payload.agent.channelConfig === "object"
          ? payload.agent.channelConfig
          : defaultChannelConfig(fallbackName);
      setChannelConfigDraft(JSON.stringify(config, null, 2));
      if (payload.agent.channelStatus) {
        setGatewayStatus({
          status: payload.agent.channelStatus.status ?? payload.agent.status ?? "sin verificar",
          paired:
            payload.agent.channelStatus.paired === true ||
            payload.agent.status === "active",
          qr: payload.agent.channelStatus.qr ?? null,
          lastSeen:
            payload.agent.channelStatus.lastSeen ??
            payload.agent.lastHealthCheckAt ??
            null,
        });
      } else {
        setGatewayStatus({
          status: payload.agent.status ?? "sin verificar",
          paired: payload.agent.status === "active",
          qr: null,
          lastSeen: payload.agent.lastHealthCheckAt ?? null,
        });
      }
      const diagnostics = payload.agent.runtimeDiagnostics;
      setRuntimeState(diagnostics?.runtimeState ?? "unknown");
      setRuntimeMessage(diagnostics?.message ?? "No se recibieron diagnósticos del runtime.");
    } catch {
      setChannelConfigDraft(JSON.stringify(defaultChannelConfig(fallbackName), null, 2));
      setGatewayStatus(null);
      setRuntimeState("unknown");
      setRuntimeMessage("No fue posible cargar el estado del runtime.");
    }
  }, [workspaceSlug]);

  useEffect(() => {
    if (!selectedAgent) return;
    setStatusMessage("");
    setError("");
    void loadAgentChannelStatus(selectedAgent.id, selectedAgent.name ?? "Canal");
    void loadChannelConversations(selectedAgent.id);
  }, [loadAgentChannelStatus, loadChannelConversations, selectedAgent]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }
    void loadConversationThread(selectedConversationId);
  }, [loadConversationThread, selectedConversationId]);

  async function saveChannelConfig() {
    if (!selectedAgent || !canManage || isSaving) return;
    setIsSaving(true);
    setError("");
    setStatusMessage("");
    try {
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(channelConfigDraft) as Record<string, unknown>;
      } catch {
        throw new Error("El JSON de configuración de canal no es válido.");
      }
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelConfig: parsedConfig,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la configuración de canal.");
      setStatusMessage("Configuración de canal guardada.");
      await loadAgentChannelStatus(selectedAgent.id, selectedAgent.name ?? "Canal");
      await loadChannelConversations(selectedAgent.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function verifyChannelHealth() {
    if (!selectedAgent || !canManage || isChecking) return;
    setIsChecking(true);
    setError("");
    setStatusMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        health?: { ok?: boolean };
        channelStatus?: {
          status?: string;
          paired?: boolean;
          qr?: string | null;
          lastSeen?: string | null;
        } | null;
        cron?: { configured?: number; registered?: boolean; error?: string };
      };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo verificar.");
      setGatewayStatus({
        status: payload.channelStatus?.status ?? (payload.health?.ok ? "conectado" : "desconectado"),
        paired:
          payload.channelStatus?.paired === true ||
          payload.health?.ok === true,
        qr: payload.channelStatus?.qr ?? null,
        lastSeen: payload.channelStatus?.lastSeen ?? new Date().toISOString(),
      });
      setRuntimeState(payload.health?.ok ? "reachable" : "unreachable");
      setRuntimeMessage(payload.health?.ok ? "Hermes reachable." : "Hermes unreachable o API key inválida.");
      if (payload.cron?.error) {
        setStatusMessage(`Salud OK, cron con advertencia: ${payload.cron.error}`);
      } else {
        setStatusMessage(payload.health?.ok ? "Canal conectado y saludable." : "Canal sin conexión.");
      }
      await loadChannelConversations(selectedAgent.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo verificar.");
      setRuntimeState("unreachable");
      setRuntimeMessage("No se logró contactar el runtime.");
    } finally {
      setIsChecking(false);
    }
  }

  if (channelAgents.length === 0) {
    return (
      <div style={stackStyle}>
        <Panel
          eyebrow="Canales"
          title="Canales de mensajería"
          description="Administra conexión WhatsApp y estado operativo de agentes de canal."
        >
          <EmptyState
            icon={MessageSquare}
            title="No hay agentes de canal"
            description="Crea un agente tipo canal desde Agentes para habilitar WhatsApp."
          />
        </Panel>
      </div>
    );
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Canales"
        title="Canales de WhatsApp"
        description="Configura gateway, verifica salud y monitorea emparejamiento del canal."
      >
        <div style={toolbarStyle}>
          <label style={inputLabelStyle}>
            Agente de canal
            <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} style={inputStyle}>
              {channelAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {formatStatusLabel(agent.status)}
                </option>
              ))}
            </select>
          </label>
          {!canManage ? <StatusPill tone="warning">Solo administradores</StatusPill> : null}
        </div>

        {error ? <p style={inlineErrorStyle}>{error}</p> : null}
        {statusMessage ? <p style={inlineSuccessStyle}>{statusMessage}</p> : null}
        <div style={statusRowStyle}>
          <StatusPill
            tone={
              runtimeState === "reachable"
                ? "success"
                : runtimeState === "missing_endpoint" || runtimeState === "missing_api_key"
                  ? "warning"
                  : runtimeState === "unreachable"
                    ? "danger"
                    : "neutral"
            }
          >
            Runtime: {runtimeState.replace(/_/g, " ")}
          </StatusPill>
          <p style={{ ...panelDescriptionStyle, margin: 0 }}>{runtimeMessage}</p>
        </div>

        <div style={channelsGridStyle}>
          <div style={channelCardStyle}>
            <h4 style={channelCardTitleStyle}>Configuración de canal</h4>
            <p style={channelCardCopyStyle}>Define proveedor, modo y metadata en formato JSON.</p>
            <textarea
              value={channelConfigDraft}
              onChange={(event) => setChannelConfigDraft(event.target.value)}
              rows={10}
              style={textareaStyle}
              disabled={!canManage || isSaving}
            />
            <div style={channelActionsStyle}>
              <button type="button" style={primaryButtonStyle} onClick={() => void saveChannelConfig()} disabled={!canManage || isSaving}>
                {isSaving ? "Guardando..." : "Guardar configuración"}
              </button>
              <button type="button" style={actionButtonStyle} onClick={() => void verifyChannelHealth()} disabled={!canManage || isChecking}>
                {isChecking ? "Verificando..." : "Verificar conexión"}
              </button>
            </div>
          </div>

          <div style={channelCardStyle}>
            <h4 style={channelCardTitleStyle}>Estado del gateway</h4>
            <div style={statusRowStyle}>
              <StatusPill tone={gatewayStatus?.paired ? "success" : "warning"}>
                {gatewayStatus?.paired ? "Emparejado" : "Pendiente"}
              </StatusPill>
              <StatusPill tone="neutral">Estado: {gatewayStatus?.status ?? "sin verificar"}</StatusPill>
            </div>
            <p style={channelCardCopyStyle}>
              {gatewayStatus?.lastSeen
                ? `Última verificación: ${new Date(gatewayStatus.lastSeen).toLocaleString("es-MX")}`
                : "Aún no se ha ejecutado una verificación."}
            </p>
            {gatewayStatus?.qr ? (
              <img src={gatewayStatus.qr} alt="QR de emparejamiento de WhatsApp" style={qrImageStyle} />
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="QR no disponible"
                description="Cuando el runtime exponga QR se mostrará aquí para completar emparejamiento."
              />
            )}
          </div>
        </div>

        <div style={channelCardStyle}>
          <h4 style={channelCardTitleStyle}>Transcript del canal</h4>
          <p style={channelCardCopyStyle}>
            Conversaciones recientes vinculadas a este agente de canal.
          </p>
          {isLoadingConversations ? <p style={panelDescriptionStyle}>Cargando conversaciones...</p> : null}
          {conversations.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 8 }}>
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    style={{
                      ...actionButtonStyle,
                      justifyContent: "space-between",
                      borderColor:
                        selectedConversationId === conversation.id
                          ? "rgba(51, 92, 255, 0.26)"
                          : "var(--workspace-border)",
                      background:
                        selectedConversationId === conversation.id
                          ? "rgba(51, 92, 255, 0.08)"
                          : "var(--workspace-panel)",
                    }}
                  >
                    <span>{conversation.title}</span>
                    <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
                      {conversation.messageCount} mensajes
                    </span>
                  </button>
                ))}
              </div>
              <div style={tableWrapStyle}>
                <div style={{ display: "grid", gap: 8, padding: 12, maxHeight: 300, overflowY: "auto" }}>
                  {isLoadingMessages ? <p style={panelDescriptionStyle}>Cargando transcript...</p> : null}
                  {!isLoadingMessages && conversationMessages.length === 0 ? (
                    <p style={panelDescriptionStyle}>No hay mensajes para esta conversación.</p>
                  ) : null}
                  {conversationMessages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        border: "1px solid var(--workspace-border)",
                        borderRadius: 12,
                        background:
                          message.role === "user"
                            ? "rgba(51, 92, 255, 0.08)"
                            : "var(--workspace-panel)",
                        padding: "10px 12px",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "var(--workspace-muted)" }}>
                        {message.role === "user" ? "Usuario" : "Agente"} · {new Date(message.createdAt).toLocaleString("es-MX")}
                      </p>
                      <p style={{ margin: 0, fontSize: 14, color: "var(--workspace-text)", lineHeight: 1.5 }}>
                        {message.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Sin transcript todavía"
              description="Cuando este canal reciba o envíe mensajes, aparecerán aquí."
            />
          )}
        </div>
      </Panel>
    </div>
  );
}

export function ActivityPanel({ workspaceSlug, agents, initialActivity }: ActivityPanelProps) {
  const [agentFilter, setAgentFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [daysFilter, setDaysFilter] = useState(14);
  const [activity, setActivity] = useState(initialActivity);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const actionOptions = useMemo(() => {
    const fromInitial = Array.from(
      new Set([...initialActivity.map((entry) => entry.action), ...activity.map((entry) => entry.action)]),
    ).sort();
    return fromInitial;
  }, [initialActivity, activity]);

  useEffect(() => {
    let active = true;
    async function fetchActivity() {
      setIsLoading(true);
      setError("");
      try {
        const from = new Date(Date.now() - daysFilter * 24 * 60 * 60 * 1000).toISOString();
        const params = new URLSearchParams({
          from,
          limit: "80",
        });
        if (agentFilter !== "all") params.set("agentId", agentFilter);
        if (actionFilter !== "all") params.set("actions", actionFilter);
        const response = await fetch(`/api/workspaces/${workspaceSlug}/activity?${params.toString()}`);
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          activity?: PrismaWorkspaceActivity[];
        };
        if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar actividad.");
        if (active) {
          setActivity(payload.activity ?? []);
        }
      } catch (caughtError) {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar actividad.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void fetchActivity();
    const intervalId = setInterval(() => {
      void fetchActivity();
    }, 15000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [workspaceSlug, agentFilter, actionFilter, daysFilter]);

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Actividad"
        title="Actividad de agentes"
        description="Filtra por agente, tipo y ventana temporal. Se actualiza cada 15s."
      >
        <div style={toolbarStyle}>
          <label style={inputLabelStyle}>
            Agente
            <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} style={inputStyle}>
              <option value="all">Todos</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          <label style={inputLabelStyle}>
            Acción
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} style={inputStyle}>
              <option value="all">Todas</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {humanizeActivityAction(action)}
                </option>
              ))}
            </select>
          </label>

          <label style={inputLabelStyle}>
            Ventana (días)
            <select value={String(daysFilter)} onChange={(event) => setDaysFilter(Number(event.target.value))} style={inputStyle}>
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
            </select>
          </label>
        </div>

        {error ? <p style={inlineErrorStyle}>{error}</p> : null}
        {isLoading ? <p style={panelDescriptionStyle}>Actualizando actividad...</p> : null}

        {activity.length > 0 ? (
          <div style={activityListStyle}>
            {activity.map((entry) => {
              const activityMetaEntries = Object.entries(entry.details)
                .slice(0, 3)
                .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);
              return (
                <div key={entry.id} style={activityItemStyle}>
                  <div>
                    <p style={activityTitleStyle}>{humanizeActivityAction(entry.action)}</p>
                    <p style={activityMetaStyle}>
                      {activityMetaEntries.join(" · ") || "Sin detalle"}
                    </p>
                  </div>
                  <p style={activityMetaStyle}>{new Date(entry.createdAt).toLocaleString("es-MX")}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Sin actividad en el filtro actual"
            description="Ajusta filtros o espera nuevas ejecuciones de agentes."
          />
        )}
      </Panel>
    </div>
  );
}

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: 20,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 24,
  background: "var(--workspace-panel)",
  padding: 22,
  display: "grid",
  gap: 16,
};

const panelHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const panelHeaderInlineStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-faint)",
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
  fontFamily: "var(--font-display)",
  color: "var(--workspace-text)",
};

const panelDescriptionStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  lineHeight: 1.6,
  fontSize: 14,
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const pickerGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const inputLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const inputStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "10px 12px",
  minWidth: 180,
  font: "inherit",
};

const textareaStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "12px 14px",
  width: "100%",
  font: "inherit",
  resize: "vertical",
};

const primaryButtonStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(51, 92, 255, 0.16)",
  background: "rgba(51, 92, 255, 0.12)",
  color: "#2947cc",
  padding: "10px 16px",
  fontWeight: 700,
  font: "inherit",
  cursor: "pointer",
};

const actionButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  color: "var(--workspace-text)",
  padding: "9px 12px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const dangerButtonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(220, 38, 38, 0.24)",
  background: "rgba(220, 38, 38, 0.12)",
  color: "#b42318",
  padding: "9px 12px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 700,
};

const emptyStateStyle: React.CSSProperties = {
  display: "grid",
  justifyItems: "start",
  gap: 12,
  border: "1px dashed var(--workspace-border)",
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.35)",
};

const emptyIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--workspace-text)",
};

const emptyTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontWeight: 700,
};

const emptyCopyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 14,
  lineHeight: 1.6,
};

const inlineErrorStyle: React.CSSProperties = {
  margin: 0,
  color: "#b42318",
  fontSize: 13,
};

const inlineSuccessStyle: React.CSSProperties = {
  margin: 0,
  color: "#0f8a52",
  fontSize: 13,
};

const warningListStyle: React.CSSProperties = {
  border: "1px solid rgba(245, 158, 11, 0.26)",
  borderRadius: 12,
  background: "rgba(245, 158, 11, 0.09)",
  padding: "10px 12px",
  display: "grid",
  gap: 6,
};

const warningTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#92400e",
  fontSize: 13,
  lineHeight: 1.5,
};

const statusRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const tableHeadStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--workspace-muted)",
  fontWeight: 600,
  borderBottom: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
};

const tableCellStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  fontSize: 14,
  verticalAlign: "top",
};

const historyStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-panel-soft)",
  padding: 14,
  display: "grid",
  gap: 10,
};

const historyTitleStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const historyListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const historyItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  border: "1px solid var(--workspace-border)",
  borderRadius: 12,
  background: "var(--workspace-panel)",
  padding: "10px 12px",
};

const historyFileStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const historyMetaStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const fieldsLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)",
  gap: 14,
};

const fieldsListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignContent: "start",
};

const fieldItemStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 14,
  background: "var(--workspace-panel-soft)",
  padding: 12,
  display: "grid",
  gap: 8,
};

const fieldNameStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontWeight: 700,
};

const fieldKeyStyle: React.CSSProperties = {
  color: "var(--workspace-muted)",
  fontWeight: 500,
  fontSize: 12,
};

const fieldMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const fieldActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const fieldEditorStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-panel)",
  padding: 14,
  display: "grid",
  gap: 10,
  alignContent: "start",
};

const fieldEditorTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontSize: 18,
  fontWeight: 700,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--workspace-text)",
  fontSize: 14,
};

const fieldEditorActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const channelsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const channelCardStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-panel-soft)",
  padding: 14,
  display: "grid",
  gap: 12,
  alignContent: "start",
};

const channelCardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const channelCardCopyStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 14,
  lineHeight: 1.6,
};

const channelActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const qrImageStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 260,
  borderRadius: 12,
  border: "1px solid var(--workspace-border)",
};

const activityListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const activityItemStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 14,
  background: "var(--workspace-panel-soft)",
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const activityTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontWeight: 700,
};

const activityMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};
