"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Mail, MessageCircle, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { render, extractMergeTags } from "@/lib/templates/render";
import { sampleTemplateContext } from "@/lib/templates/context";

type Channel = "email" | "sms" | "whatsapp";

export type TemplateListEntry = {
  id: string;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string;
  variables: string[];
  updatedAt: string;
};

type Props = {
  workspaceSlug: string;
  canManage: boolean;
  initialTemplates: TemplateListEntry[];
};

const PANEL_AVAILABLE_TAGS = [
  "first_name",
  "full_name",
  "email",
  "phone",
  "company.name",
  "company.domain",
  "deal.title",
  "deal.amount|currency",
  "deal.stage",
  "deal.expected_close_date",
  "owner.name",
  "user.name",
];

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const tabsWrapStyle: CSSProperties = {
  display: "inline-flex",
  gap: 6,
  padding: 4,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-pill)",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    background: active ? "var(--workspace-accent-soft)" : "transparent",
    color: active ? "var(--workspace-accent-strong)" : "var(--workspace-muted)",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const listItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 14px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  background: "#ffffff",
  cursor: "pointer",
};

const listItemActiveStyle: CSSProperties = {
  ...listItemStyle,
  borderColor: "var(--workspace-accent)",
  background: "var(--workspace-accent-soft)",
};

const panelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 220px",
  gap: 20,
  padding: 18,
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--workspace-surface)",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.04)",
};

const inputStyle: CSSProperties = {
  height: 34,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: 220,
  padding: "10px 12px",
  resize: "vertical",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
};

const previewStyle: CSSProperties = {
  padding: 12,
  borderRadius: "var(--radius-md)",
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  fontSize: 13,
  color: "var(--workspace-text)",
  whiteSpace: "pre-wrap",
  minHeight: 120,
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn: CSSProperties = {
  ...primaryBtn,
  color: "var(--workspace-text)",
  background: "#ffffff",
  borderColor: "var(--workspace-border)",
};

const dangerBtn: CSSProperties = {
  ...ghostBtn,
  color: "#b91c1c",
  borderColor: "rgba(239, 68, 68, 0.32)",
};

const tagChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(17, 24, 39, 0.06)",
  color: "var(--workspace-text)",
  borderRadius: "var(--radius-pill)",
  cursor: "pointer",
  border: "none",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};

const tagsGridStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const channelIcons: Record<Channel, React.ReactNode> = {
  email: <Mail size={14} />,
  sms: <MessageSquare size={14} />,
  whatsapp: <MessageCircle size={14} />,
};

const channelLabels: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

type DraftTemplate = {
  id: string | null;
  name: string;
  channel: Channel;
  subject: string;
  body: string;
};

function emptyDraft(channel: Channel): DraftTemplate {
  return { id: null, name: "", channel, subject: "", body: "" };
}

export function TemplatesPanel({ workspaceSlug, canManage, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<TemplateListEntry[]>(initialTemplates);
  const [channel, setChannel] = useState<Channel>("email");
  const [draft, setDraft] = useState<DraftTemplate>(emptyDraft("email"));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => templates.filter((entry) => entry.channel === channel),
    [channel, templates],
  );

  const sampleContext = useMemo(() => sampleTemplateContext(), []);
  const previewBody = useMemo(() => render(draft.body, sampleContext), [draft.body, sampleContext]);
  const previewSubject = useMemo(
    () => (draft.subject ? render(draft.subject, sampleContext) : ""),
    [draft.subject, sampleContext],
  );

  function openNew() {
    setDraft(emptyDraft(channel));
    setError(null);
  }

  function selectTemplate(entry: TemplateListEntry) {
    setDraft({
      id: entry.id,
      name: entry.name,
      channel: entry.channel,
      subject: entry.subject ?? "",
      body: entry.body,
    });
  }

  async function save() {
    if (!canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = draft.id
        ? `/api/workspaces/${workspaceSlug}/templates/${draft.id}`
        : `/api/workspaces/${workspaceSlug}/templates`;
      const method = draft.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          channel: draft.channel,
          subject: draft.channel === "email" ? draft.subject : null,
          body: draft.body,
          variables: extractMergeTags(`${draft.subject} ${draft.body}`),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { template?: TemplateListEntry; error?: string };
      if (!response.ok || !json.template) {
        setError(json.error ?? "No se pudo guardar la plantilla.");
        return;
      }
      const saved = json.template;
      setTemplates((prev) => {
        const without = prev.filter((entry) => entry.id !== saved.id);
        return [saved, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setDraft({
        id: saved.id,
        name: saved.name,
        channel: saved.channel,
        subject: saved.subject ?? "",
        body: saved.body,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!draft.id || !canManage) return;
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar plantilla?")) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/templates/${draft.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "No se pudo eliminar.");
        return;
      }
      setTemplates((prev) => prev.filter((entry) => entry.id !== draft.id));
      setDraft(emptyDraft(channel));
    } finally {
      setSubmitting(false);
    }
  }

  function insertVariable(tag: string) {
    setDraft((prev) => ({ ...prev, body: `${prev.body}{{${tag}}}` }));
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={tabsWrapStyle}>
          {(Object.keys(channelLabels) as Channel[]).map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                setChannel(key);
                setDraft(emptyDraft(key));
              }}
              style={tabStyle(channel === key)}
            >
              {channelIcons[key]}
              {channelLabels[key]}
            </button>
          ))}
        </div>
        {canManage ? (
          <button type="button" onClick={openNew} style={primaryBtn}>
            <Plus size={14} />
            Nueva plantilla
          </button>
        ) : null}
      </div>

      <div style={panelStyle}>
        <aside style={listStyle}>
          <div style={labelStyle}>Plantillas</div>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--workspace-muted)" }}>Sin plantillas en este canal.</p>
          ) : (
            filtered.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => selectTemplate(entry)}
                style={draft.id === entry.id ? listItemActiveStyle : listItemStyle}
              >
                <strong style={{ fontSize: 13, color: "var(--workspace-text)" }}>{entry.name}</strong>
                {entry.subject ? (
                  <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>{entry.subject}</span>
                ) : null}
              </button>
            ))
          )}
        </aside>

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>Nombre</div>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Saludo inicial"
            style={inputStyle}
            disabled={!canManage}
          />
          {draft.channel === "email" ? (
            <>
              <div style={labelStyle}>Asunto</div>
              <input
                type="text"
                value={draft.subject}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                placeholder="Seguimiento Acme"
                style={inputStyle}
                disabled={!canManage}
              />
            </>
          ) : null}
          <div style={labelStyle}>Cuerpo</div>
          <textarea
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            placeholder="Hola {{first_name}}, sobre {{deal.title}}…"
            style={textareaStyle}
            disabled={!canManage}
          />
          <div style={labelStyle}>Preview (contexto sample)</div>
          {previewSubject ? (
            <div style={{ ...previewStyle, minHeight: 0 }}>
              <strong>{previewSubject}</strong>
            </div>
          ) : null}
          <div style={previewStyle}>{previewBody || "—"}</div>
          {error ? (
            <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{error}</p>
          ) : null}
          {canManage ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={save} disabled={submitting} style={primaryBtn}>
                {draft.id ? "Guardar" : "Crear"}
              </button>
              {draft.id ? (
                <button type="button" onClick={remove} disabled={submitting} style={dangerBtn}>
                  <Trash2 size={14} />
                  Eliminar
                </button>
              ) : null}
              <button type="button" onClick={() => setDraft(emptyDraft(channel))} style={ghostBtn}>
                <X size={14} />
                Limpiar
              </button>
            </div>
          ) : null}
        </section>

        <aside style={tagsGridStyle}>
          <div style={labelStyle}>Variables</div>
          {PANEL_AVAILABLE_TAGS.map((tag) => (
            <button type="button" key={tag} style={tagChipStyle} onClick={() => insertVariable(tag)}>
              {`{{${tag}}}`}
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
