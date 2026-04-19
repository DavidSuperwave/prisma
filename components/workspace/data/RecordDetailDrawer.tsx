"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ClipboardList, Trash2, X } from "lucide-react";
import type { PrismaWorkspaceField, PrismaWorkspaceRecord } from "@/lib/workspaceStore";
import { getRecordFieldValue } from "@/lib/workspaceStore";
import { Button } from "@/components/workspace/ui";
import { AttachImageButton } from "@/components/workspace/data/AttachImageButton";

type RecordActivity = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  data: Record<string, unknown>;
  authorUserId: string | null;
  occurredAt: string;
};

type Props = {
  workspaceSlug: string;
  record: PrismaWorkspaceRecord;
  objectName: string;
  fields: PrismaWorkspaceField[];
  canWrite: boolean;
  onClose: () => void;
  onPatchRecord: (record: PrismaWorkspaceRecord, data: Record<string, unknown>) => Promise<void>;
  onDeleteRecord: (recordId: string) => void;
  formatStatusLabel: (value: string) => string;
};

function parseSelectOptions(field: PrismaWorkspaceField): string[] {
  const raw = Array.isArray(field.options.values)
    ? field.options.values
    : Array.isArray(field.options.options)
      ? field.options.options
      : [];
  return raw.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function renderDiffLine(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const row = entry as { field?: unknown; from?: unknown; to?: unknown };
  const field = String(row.field ?? "");
  const from = row.from === null || row.from === undefined || row.from === "" ? "—" : String(row.from);
  const to = row.to === null || row.to === undefined || row.to === "" ? "—" : String(row.to);
  return `${field}: ${from} → ${to}`;
}

export function RecordDetailDrawer({
  workspaceSlug,
  record,
  objectName,
  fields,
  canWrite,
  onClose,
  onPatchRecord,
  onDeleteRecord,
  formatStatusLabel,
}: Props) {
  const [activities, setActivities] = useState<RecordActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/records/${encodeURIComponent(record.id)}/activities?limit=50`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { activities?: RecordActivity[] };
        if (!cancelled && Array.isArray(payload.activities)) {
          setActivities(payload.activities);
        }
      } catch {
        /* silent */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, record.id, record.updatedAt]);

  const titleFieldValue =
    getRecordFieldValue(record, "name") ??
    getRecordFieldValue(record, "title") ??
    record.id.slice(0, 8);

  async function save(fieldKey: string, nextValue: unknown) {
    const existing = record.data[fieldKey];
    if (JSON.stringify(existing) === JSON.stringify(nextValue)) return;
    try {
      setError(null);
      await onPatchRecord(record, { ...record.data, [fieldKey]: nextValue });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando el registro.");
    }
  }

  return (
    <div style={backdropStyle} onClick={onClose}>
      <aside
        style={drawerStyle}
        onClick={(event) => event.stopPropagation()}
        role="complementary"
        aria-label="Detalle de registro"
      >
        <header style={headerStyle}>
          <div>
            <span style={eyebrowStyle}>{objectName}</span>
            <h2 style={titleStyle}>{String(titleFieldValue)}</h2>
          </div>
          <Button variant="ghost" compact onClick={onClose} leadingIcon={<X size={14} aria-hidden />}>
            Cerrar
          </Button>
        </header>

        <div style={bodyStyle}>
          {error ? <div style={errorStyle}>{error}</div> : null}

          <section style={sectionStyle}>
            <span style={labelStyle}>Campos</span>
            {fields.map((field) => {
              const value = record.data[field.key] ?? "";
              const options = parseSelectOptions(field);
              return (
                <div key={field.id} style={rowStyle}>
                  <span style={fieldLabelStyle}>
                    {field.name}
                    {field.required ? " *" : ""}
                  </span>
                  {field.type === "status" || field.type === "select" ? (
                    <select
                      className="ws-input"
                      value={String(value ?? "")}
                      onChange={(event) => {
                        void save(field.key, event.target.value || null);
                      }}
                      disabled={!canWrite}
                    >
                      <option value="">Sin valor</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {formatStatusLabel(option)}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "boolean" ? (
                    <select
                      className="ws-input"
                      value={String(Boolean(value))}
                      onChange={(event) => {
                        void save(field.key, event.target.value === "true");
                      }}
                      disabled={!canWrite}
                    >
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      className="ws-input"
                      key={`${record.id}-${field.key}-${record.updatedAt}`}
                      type={
                        field.type === "number" || field.type === "currency"
                          ? "number"
                          : field.type === "date"
                            ? "date"
                            : "text"
                      }
                      defaultValue={String(value ?? "")}
                      onBlur={(event) => {
                        const raw = event.target.value;
                        const parsed =
                          field.type === "number" || field.type === "currency"
                            ? raw === ""
                              ? field.required
                                ? ""
                                : null
                              : Number(raw)
                            : raw === ""
                              ? field.required
                                ? ""
                                : null
                              : raw;
                        void save(field.key, parsed);
                      }}
                      disabled={!canWrite}
                    />
                  )}
                </div>
              );
            })}
          </section>

          {(() => {
            const imageField = fields.find((f) => f.key === "image" || f.type === "image");
            if (!imageField) return null;
            const currentImage = String(record.data[imageField.key] ?? "");
            const promptParts = [
              record.data.year,
              record.data.make,
              record.data.model,
              record.data.trim,
            ]
              .map((v) => (v == null ? "" : String(v).trim()))
              .filter(Boolean);
            const seed = promptParts.length > 0 ? promptParts.join(" ") : String(titleFieldValue ?? "");
            return (
              <section style={sectionStyle}>
                <span style={labelStyle}>Imagen</span>
                {currentImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentImage}
                    alt=""
                    style={{
                      width: "100%",
                      maxHeight: 180,
                      objectFit: "cover",
                      borderRadius: 6,
                      background: "#f3f4f6",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      border: "1px dashed var(--ws-border, #e5e7eb)",
                      borderRadius: 6,
                      textAlign: "center",
                      color: "#6b7280",
                      fontSize: 12,
                    }}
                  >
                    Sin imagen adjunta
                  </div>
                )}
                {canWrite ? (
                  <AttachImageButton
                    workspaceSlug={workspaceSlug}
                    recordId={record.id}
                    defaultPrompt={seed}
                    label={currentImage ? "Cambiar imagen" : "Adjuntar imagen"}
                    onSaved={(result) => {
                      const url = result.publicUrl ?? result.signedUrl;
                      if (!url) return;
                      void save(imageField.key, url);
                    }}
                  />
                ) : null}
              </section>
            );
          })()}

          <section style={sectionStyle}>
            <span style={labelStyle}>Actividad ({activities.length})</span>
            {activities.length === 0 ? (
              <div style={activityEmptyStyle}>
                <ClipboardList size={18} color="var(--workspace-muted)" aria-hidden />
                <p style={emptyTextStyle}>
                  Sin actividad registrada todavía. Los cambios en este registro aparecerán aquí.
                </p>
              </div>
            ) : (
              <ul style={activityListStyle}>
                {activities.map((activity) => (
                  <li key={activity.id} style={activityItemStyle}>
                    <div style={activityHeaderStyle}>
                      <strong style={{ fontSize: 12 }}>
                        {formatActivityType(activity.type)}
                      </strong>
                      <span style={activityTimeStyle}>
                        {new Date(activity.occurredAt).toLocaleString("es-MX")}
                      </span>
                    </div>
                    {activity.subject ? (
                      <p style={activitySubjectStyle}>{activity.subject}</p>
                    ) : null}
                    {renderActivityDetails(activity)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canWrite ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
              <Button
                variant="danger"
                compact
                leadingIcon={<Trash2 size={12} aria-hidden />}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")
                  ) {
                    onDeleteRecord(record.id);
                    onClose();
                  }
                }}
              >
                Eliminar registro
              </Button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function formatActivityType(type: string): string {
  if (type === "record.updated") return "Registro actualizado";
  if (type === "record.created") return "Registro creado";
  if (type === "record.deleted") return "Registro eliminado";
  return type.replace(/[._]/g, " ");
}

function renderActivityDetails(activity: RecordActivity) {
  const diff = Array.isArray(activity.data?.diff) ? (activity.data.diff as unknown[]) : null;
  if (diff && diff.length > 0) {
    return (
      <ul style={diffListStyle}>
        {diff.slice(0, 10).map((entry, index) => (
          <li key={index} style={diffItemStyle}>
            {renderDiffLine(entry)}
          </li>
        ))}
        {diff.length > 10 ? <li style={diffItemStyle}>…y {diff.length - 10} campos más</li> : null}
      </ul>
    );
  }
  if (activity.body) {
    return <p style={activityBodyStyle}>{activity.body}</p>;
  }
  return null;
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.25)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 35,
};

const drawerStyle: CSSProperties = {
  width: "min(560px, 100vw)",
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

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-muted)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  color: "var(--workspace-text)",
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

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  alignItems: "center",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-text)",
  fontWeight: 500,
};

const errorStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.25)",
  borderRadius: "var(--radius-md)",
};

const emptyTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const activityEmptyStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 14px",
  background: "var(--workspace-surface-muted, #f8f9fc)",
  border: "1px dashed var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const activityListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const activityItemStyle: CSSProperties = {
  padding: "8px 10px",
  background: "var(--workspace-surface-muted, #f1f3f8)",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const activityHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "var(--workspace-text)",
};

const activityTimeStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const activitySubjectStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "var(--workspace-text)",
};

const activityBodyStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 11,
  color: "var(--workspace-muted)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const diffListStyle: CSSProperties = {
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const diffItemStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
