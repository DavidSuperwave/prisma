"use client";

import { useMemo, useState, useTransition } from "react";

type AgentTemplate = {
  id: string;
  name: string;
  description?: string;
  type: "copilot" | "channel" | "worker" | "chatbot";
  category?: string;
  defaultSoulMd?: string;
  defaultSkills: string[];
  defaultKnowledgeScope: Record<string, unknown>;
  defaultCronJobs: unknown[];
  defaultChannelConfig: Record<string, unknown>;
  defaultMemoryConfig: Record<string, unknown>;
  icon?: string;
  isActive: boolean;
};

type TemplateDraft = {
  id?: string;
  name: string;
  description: string;
  type: AgentTemplate["type"];
  category: string;
  defaultSoulMd: string;
  defaultSkills: string;
  defaultRead: string;
  defaultWrite: string;
  defaultChannels: string;
  defaultCronJobs: string;
  icon: string;
  isActive: boolean;
};

const emptyDraft: TemplateDraft = {
  name: "",
  description: "",
  type: "worker",
  category: "",
  defaultSoulMd: "",
  defaultSkills: "",
  defaultRead: "",
  defaultWrite: "",
  defaultChannels: "",
  defaultCronJobs: "",
  icon: "",
  isActive: true,
};

function parseCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toDraft(template?: AgentTemplate | null): TemplateDraft {
  if (!template) return emptyDraft;

  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    type: template.type,
    category: template.category ?? "",
    defaultSoulMd: template.defaultSoulMd ?? "",
    defaultSkills: template.defaultSkills.join(", "),
    defaultRead: Array.isArray(template.defaultKnowledgeScope.read) ? (template.defaultKnowledgeScope.read as string[]).join(", ") : "",
    defaultWrite: Array.isArray(template.defaultKnowledgeScope.write) ? (template.defaultKnowledgeScope.write as string[]).join(", ") : "",
    defaultChannels: Array.isArray(template.defaultKnowledgeScope.channels) ? (template.defaultKnowledgeScope.channels as string[]).join(", ") : "",
    defaultCronJobs: JSON.stringify(template.defaultCronJobs ?? [], null, 2),
    icon: template.icon ?? "",
    isActive: template.isActive,
  };
}

export default function AgentTemplateManager({ initialTemplates }: { initialTemplates: AgentTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string>(initialTemplates[0]?.id ?? "new");
  const [draft, setDraft] = useState<TemplateDraft>(toDraft(initialTemplates[0] ?? null));
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );

  function selectTemplate(template: AgentTemplate | null) {
    setSelectedId(template?.id ?? "new");
    setDraft(toDraft(template));
    setError("");
    setSuccess("");
  }

  function buildPayload(currentDraft: TemplateDraft) {
    const cronJobs = currentDraft.defaultCronJobs.trim()
      ? JSON.parse(currentDraft.defaultCronJobs)
      : [];

    return {
      id: currentDraft.id,
      name: currentDraft.name.trim(),
      description: currentDraft.description.trim() || undefined,
      type: currentDraft.type,
      category: currentDraft.category.trim() || undefined,
      defaultSoulMd: currentDraft.defaultSoulMd.trim() || undefined,
      defaultSkills: parseCsv(currentDraft.defaultSkills),
      defaultKnowledgeScope: {
        read: parseCsv(currentDraft.defaultRead),
        write: parseCsv(currentDraft.defaultWrite),
        channels: parseCsv(currentDraft.defaultChannels),
      },
      defaultCronJobs: Array.isArray(cronJobs) ? cronJobs : [],
      icon: currentDraft.icon.trim() || undefined,
      isActive: currentDraft.isActive,
    };
  }

  function saveTemplate() {
    setError("");
    setSuccess("");

    startTransition(async () => {
      try {
        const payload = buildPayload(draft);
        if (!payload.name) {
          throw new Error("El nombre es obligatorio.");
        }

        const response = await fetch("/api/admin/templates", {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as { error?: string; template?: AgentTemplate };
        if (!response.ok || !data.template) {
          throw new Error(data.error ?? "No se pudo guardar la plantilla.");
        }

        setTemplates((current) => {
          const next = draft.id
            ? current.map((template) => (template.id === data.template!.id ? data.template! : template))
            : [data.template!, ...current];
          return next;
        });
        setSelectedId(data.template.id);
        setDraft(toDraft(data.template));
        setSuccess(draft.id ? "Plantilla actualizada." : "Plantilla creada.");
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar la plantilla.");
      }
    });
  }

  function removeTemplate(templateId: string) {
    setError("");
    setSuccess("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/templates?id=${encodeURIComponent(templateId)}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo borrar la plantilla.");
        }

        setTemplates((current) => current.filter((template) => template.id !== templateId));
        selectTemplate(null);
        setSuccess("Plantilla eliminada.");
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "No se pudo borrar la plantilla.");
      }
    });
  }

  return (
    <div style={shellStyle}>
      <aside style={listPanelStyle}>
        <div style={listHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Library</h2>
            <p style={sectionCopyStyle}>{templates.length} plantillas disponibles.</p>
          </div>
          <button type="button" style={primaryButtonStyle} onClick={() => selectTemplate(null)}>
            Nueva
          </button>
        </div>

        <div style={listStyle}>
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => selectTemplate(template)}
              style={{
                ...templateCardStyle,
                borderColor: template.id === selectedTemplate?.id ? "rgba(109, 106, 255, 0.5)" : "var(--giga-border)",
              }}
            >
              <div>
                <p style={templateNameStyle}>{template.name}</p>
                <p style={templateMetaStyle}>
                  {template.type} · {template.category ?? "general"}
                </p>
              </div>
              <span style={template.isActive ? activeBadgeStyle : pausedBadgeStyle}>{template.isActive ? "Activa" : "Pausada"}</span>
            </button>
          ))}
        </div>
      </aside>

      <section style={editorPanelStyle}>
        <div style={listHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>{draft.id ? "Editar plantilla" : "Nueva plantilla"}</h2>
            <p style={sectionCopyStyle}>Define defaults reutilizables para el canvas de agentes.</p>
          </div>
          {draft.id ? (
            <button type="button" style={dangerButtonStyle} onClick={() => removeTemplate(draft.id!)} disabled={isPending}>
              Eliminar
            </button>
          ) : null}
        </div>

        <div style={formGridStyle}>
          <label style={fieldStyle}>
            Nombre
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            Tipo
            <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AgentTemplate["type"] }))} style={inputStyle}>
              <option value="copilot">Copilot</option>
              <option value="channel">Channel</option>
              <option value="worker">Worker</option>
              <option value="chatbot">Chatbot</option>
            </select>
          </label>
          <label style={fieldStyle}>
            Categoría
            <input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            Icono
            <input value={draft.icon} onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))} style={inputStyle} />
          </label>
        </div>

        <label style={fieldStyle}>
          Descripción
          <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} style={textAreaStyle} />
        </label>

        <label style={fieldStyle}>
          SOUL.md por default
          <textarea value={draft.defaultSoulMd} onChange={(event) => setDraft((current) => ({ ...current, defaultSoulMd: event.target.value }))} rows={6} style={textAreaStyle} />
        </label>

        <div style={formGridStyle}>
          <label style={fieldStyle}>
            Skills (CSV)
            <input value={draft.defaultSkills} onChange={(event) => setDraft((current) => ({ ...current, defaultSkills: event.target.value }))} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            Lectura (CSV)
            <input value={draft.defaultRead} onChange={(event) => setDraft((current) => ({ ...current, defaultRead: event.target.value }))} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            Escritura (CSV)
            <input value={draft.defaultWrite} onChange={(event) => setDraft((current) => ({ ...current, defaultWrite: event.target.value }))} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            Canales (CSV)
            <input value={draft.defaultChannels} onChange={(event) => setDraft((current) => ({ ...current, defaultChannels: event.target.value }))} style={inputStyle} />
          </label>
        </div>

        <label style={fieldStyle}>
          Cron jobs (JSON array)
          <textarea value={draft.defaultCronJobs} onChange={(event) => setDraft((current) => ({ ...current, defaultCronJobs: event.target.value }))} rows={5} style={textAreaStyle} />
        </label>

        <label style={toggleStyle}>
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
          />
          Plantilla activa
        </label>

        <div style={actionsStyle}>
          <button type="button" style={primaryButtonStyle} onClick={saveTemplate} disabled={isPending}>
            {isPending ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear plantilla"}
          </button>
          {error ? <p style={errorStyle}>{error}</p> : null}
          {success ? <p style={successStyle}>{success}</p> : null}
        </div>
      </section>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 16,
};

const listPanelStyle: React.CSSProperties = {
  border: "1px solid var(--giga-border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--giga-surface)",
  display: "grid",
  gap: 14,
  alignContent: "start",
};

const editorPanelStyle: React.CSSProperties = {
  border: "1px solid var(--giga-border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--giga-surface)",
  display: "grid",
  gap: 14,
};

const listHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
};

const sectionCopyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--giga-muted)",
  fontSize: 13,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const templateCardStyle: React.CSSProperties = {
  border: "1px solid var(--giga-border)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.02)",
  padding: 12,
  color: "var(--giga-text)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  textAlign: "left",
  cursor: "pointer",
};

const templateNameStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 600,
};

const templateMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--giga-muted)",
  fontSize: 12,
};

const activeBadgeStyle: React.CSSProperties = {
  borderRadius: 999,
  background: "rgba(66, 211, 139, 0.16)",
  color: "#42d38b",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const pausedBadgeStyle: React.CSSProperties = {
  ...activeBadgeStyle,
  background: "rgba(245, 158, 11, 0.16)",
  color: "#f59e0b",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--giga-border)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  color: "var(--giga-text)",
  padding: "10px 12px",
  font: "inherit",
};

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
};

const toggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--giga-border)",
  background: "linear-gradient(130deg, #6d6aff 0%, #88a4ff 100%)",
  color: "#fff",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(220, 38, 38, 0.4)",
  background: "rgba(220, 38, 38, 0.12)",
  color: "#fca5a5",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  color: "#fca5a5",
};

const successStyle: React.CSSProperties = {
  margin: 0,
  color: "#42d38b",
};
