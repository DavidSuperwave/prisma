"use client";

import { useState, type CSSProperties } from "react";
import {
  AlignLeft,
  CalendarDays,
  Calculator,
  CheckSquare,
  DollarSign,
  FileText,
  Hash,
  Link2,
  List,
  Mail,
  MapPin,
  Paperclip,
  PenLine,
  Phone,
  Plus,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import type { PrismaWorkspaceField } from "@/lib/workspaceStore";

type Widget = {
  id: string;
  label: string;
  icon: typeof Type;
  description: string;
};

const WIDGETS: Widget[] = [
  { id: "text", label: "Texto", icon: Type, description: "Campo de texto corto." },
  { id: "long_text", label: "Texto largo", icon: AlignLeft, description: "Párrafo multilínea." },
  { id: "dropdown", label: "Lista desplegable", icon: List, description: "Selección única." },
  { id: "labels", label: "Etiquetas", icon: Tag, description: "Selección múltiple." },
  { id: "status", label: "Estado", icon: CheckSquare, description: "Estado personalizado." },
  { id: "number", label: "Número", icon: Hash, description: "Valor numérico." },
  { id: "money", label: "Monto", icon: DollarSign, description: "Dinero con moneda." },
  { id: "date", label: "Fecha", icon: CalendarDays, description: "Fecha sin hora." },
  { id: "datetime", label: "Fecha y hora", icon: CalendarDays, description: "Fecha con hora." },
  { id: "checkbox", label: "Checkbox", icon: CheckSquare, description: "Booleano sí/no." },
  { id: "people", label: "Personas", icon: Users, description: "Asignar usuarios." },
  { id: "relation", label: "Relación", icon: Link2, description: "Ligar a otro registro." },
  { id: "files", label: "Archivos", icon: Paperclip, description: "Subir archivos." },
  { id: "email", label: "Email", icon: Mail, description: "Formato email." },
  { id: "phone", label: "Teléfono", icon: Phone, description: "Formato teléfono." },
  { id: "website", label: "Sitio web", icon: Link2, description: "URL." },
  { id: "rating", label: "Rating", icon: Star, description: "Estrellas 1-5." },
  { id: "progress", label: "Progreso", icon: Sparkles, description: "Barra 0-100%." },
  { id: "rollup", label: "Rollup", icon: Calculator, description: "Agregado de relación." },
  { id: "formula", label: "Fórmula", icon: Calculator, description: "Expresión calculada." },
  { id: "location", label: "Ubicación", icon: MapPin, description: "Dirección/geolocalización." },
  { id: "signature", label: "Firma", icon: PenLine, description: "Capturar firma." },
];

type Props = {
  workspaceSlug: string;
  fields: PrismaWorkspaceField[];
  currentRole: "admin" | "operator" | "viewer";
  onClose: () => void;
  onFieldsChanged: (fields: PrismaWorkspaceField[]) => void;
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 40,
};

const panelStyle: CSSProperties = {
  width: "min(820px, 94vw)",
  maxHeight: "88vh",
  background: "#ffffff",
  borderRadius: "var(--radius-lg)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 24px 64px rgba(15, 23, 42, 0.25)",
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
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  padding: 18,
  overflowY: "auto",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--workspace-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const widgetGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const widgetButtonStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: 10,
  textAlign: "left",
  background: active ? "var(--workspace-accent-soft)" : "#ffffff",
  border: `1px solid ${active ? "rgba(51, 92, 255, 0.3)" : "var(--workspace-border)"}`,
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--workspace-text)",
});

const fieldRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  marginBottom: 6,
  background: "#ffffff",
};

const inputStyle: CSSProperties = {
  height: 34,
  padding: "0 10px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  fontFamily: "inherit",
  fontSize: 13,
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

const primaryButton: CSSProperties = {
  ...ghostButton,
  background: "var(--workspace-accent-strong, #2563eb)",
  color: "#ffffff",
  border: "none",
};

const errorPillStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.25)",
  borderRadius: "var(--radius-md)",
  margin: "0 0 8px",
};

export function TaskFieldsDialog({ workspaceSlug, fields, currentRole, onClose, onFieldsChanged }: Props) {
  const [widget, setWidget] = useState<string>("text");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customFields = fields.filter((field) => !field.isLocked);
  const lockedFields = fields.filter((field) => field.isLocked);

  const isAdmin = currentRole === "admin";

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/tasks/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), widget }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo crear el campo.");
      onFieldsChanged([...fields, payload.field as PrismaWorkspaceField]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando el campo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(fieldId: string) {
    if (!confirm("¿Eliminar este campo?")) return;
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/fields/${fieldId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "No se pudo eliminar el campo.");
      }
      onFieldsChanged(fields.filter((field) => field.id !== fieldId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando el campo.");
    }
  }

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={panelStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Campos de tareas</h2>
          <button type="button" style={ghostButton} onClick={onClose} aria-label="Cerrar">
            <X size={14} /> Cerrar
          </button>
        </header>

        {error ? <div style={errorPillStyle}>{error}</div> : null}

        <div style={bodyStyle}>
          <section>
            <h3 style={sectionTitleStyle}>Crear campo personalizado</h3>
            {!isAdmin ? (
              <div style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
                Solo admins pueden crear o eliminar campos.
              </div>
            ) : null}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--workspace-muted)", fontWeight: 600 }}>Nombre</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Presupuesto"
                style={inputStyle}
                disabled={!isAdmin}
              />
            </label>

            <h3 style={sectionTitleStyle}>Tipo</h3>
            <div style={widgetGridStyle}>
              {WIDGETS.map((entry) => {
                const Icon = entry.icon;
                const active = widget === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    style={widgetButtonStyle(active)}
                    onClick={() => setWidget(entry.id)}
                    disabled={!isAdmin}
                  >
                    <Icon size={16} style={{ marginTop: 2, color: "var(--workspace-accent-strong)" }} />
                    <span>
                      <strong style={{ fontSize: 12 }}>{entry.label}</strong>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--workspace-muted)" }}>
                        {entry.description}
                      </p>
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                style={primaryButton}
                onClick={handleCreate}
                disabled={!isAdmin || busy || !name.trim()}
              >
                <Plus size={14} /> Agregar campo
              </button>
            </div>
          </section>

          <section>
            <h3 style={sectionTitleStyle}>Campos del sistema</h3>
            <div style={{ marginBottom: 12 }}>
              {lockedFields.map((field) => (
                <div key={field.id} style={{ ...fieldRowStyle, opacity: 0.85 }}>
                  <FileText size={14} color="var(--workspace-muted)" />
                  <strong style={{ fontSize: 13 }}>{field.name}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--workspace-muted)" }}>
                    {field.type}
                  </span>
                </div>
              ))}
            </div>

            <h3 style={sectionTitleStyle}>Campos personalizados</h3>
            {customFields.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--workspace-muted)", padding: 8 }}>
                Aún no hay campos personalizados.
              </div>
            ) : null}
            {customFields.map((field) => (
              <div key={field.id} style={fieldRowStyle}>
                <strong style={{ fontSize: 13 }}>{field.name}</strong>
                <code
                  style={{
                    fontSize: 10,
                    color: "var(--workspace-muted)",
                    background: "var(--workspace-surface-muted, #f1f3f8)",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {field.key}
                </code>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--workspace-muted)" }}>
                  {String(field.options?.widget ?? field.type)}
                </span>
                {isAdmin ? (
                  <button
                    type="button"
                    style={{ ...ghostButton, padding: "4px 8px" }}
                    onClick={() => void handleDelete(field.id)}
                    title="Eliminar"
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
