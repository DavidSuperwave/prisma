"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Inbox,
  Mail,
  Phone,
  Pin,
  PinOff,
  Search,
  StickyNote,
  Trash2,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type ActivityTimelineEntry = {
  id: string;
  recordId: string;
  type: string;
  subject: string | null;
  body: string | null;
  data: Record<string, unknown>;
  isPinned: boolean;
  occurredAt: string;
  authorUserId: string | null;
  authorAgentId: string | null;
};

export type ActivityType = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
};

type Props = {
  workspaceSlug: string;
  recordId: string;
  activityTypes: ActivityType[];
  currentRole?: "admin" | "operator" | "viewer";
};

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  note: StickyNote,
  inbound: Inbox,
  outbound_email: Mail,
  call_logged: Phone,
  status_change: ArrowRight,
  task_completed: CheckCircle,
  deal_won: Trophy,
  deal_lost: XCircle,
};

function iconForType(type: string): LucideIcon {
  return ICON_BY_TYPE[type] ?? Circle;
}

function formatTimeAgo(input: string) {
  const date = new Date(input);
  const delta = Date.now() - date.getTime();
  if (delta < 60_000) return "hace unos segundos";
  if (delta < 3_600_000) return `hace ${Math.round(delta / 60_000)} min`;
  if (delta < 86_400_000) return `hace ${Math.round(delta / 3_600_000)} h`;
  return date.toLocaleString();
}

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const headerStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const searchWrapperStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
};

const searchIconStyle: CSSProperties = {
  position: "absolute",
  left: 10,
  color: "var(--workspace-muted)",
  pointerEvents: "none",
};

const inputStyle: CSSProperties = {
  height: 32,
  padding: "6px 10px 6px 32px",
  fontSize: 12,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  width: 220,
};

const selectStyle: CSSProperties = {
  height: 32,
  padding: "0 24px 0 10px",
  fontSize: 12,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
};

const pinnedFilterLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--workspace-muted)",
  fontFamily: "inherit",
  cursor: "pointer",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const formTopRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const subjectInputStyle: CSSProperties = {
  flex: "1 1 220px",
  height: 32,
  padding: "6px 10px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
};

const textareaStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  resize: "vertical",
  minHeight: 60,
};

const submitButtonStyle: CSSProperties = {
  alignSelf: "flex-end",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 14px",
  fontSize: 12,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const errorBoxStyle: CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.24)",
  borderRadius: "var(--radius-md)",
};

const pinnedHeaderStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  fontWeight: 600,
};

const pinnedListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const pinnedItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  background: "rgba(245, 158, 11, 0.08)",
  borderLeft: "3px solid #f59e0b",
  border: "1px solid rgba(245, 158, 11, 0.2)",
  borderLeftWidth: 3,
  borderRadius: "var(--radius-sm)",
};

const timelineListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const timelineItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

const iconBubbleStyle: CSSProperties = {
  flex: "0 0 auto",
  width: 32,
  height: 32,
  borderRadius: "var(--radius-pill)",
  background: "var(--workspace-accent-soft)",
  color: "var(--workspace-accent-strong)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 2,
};

const cardStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const typeBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  background: "rgba(17, 24, 39, 0.06)",
  color: "var(--workspace-text)",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "capitalize",
};

const cardActionsStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  color: "var(--workspace-muted)",
  cursor: "pointer",
};

const subjectTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const bodyTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-muted)",
  whiteSpace: "pre-wrap",
};

const loadingTextStyle: CSSProperties = { margin: 0, fontSize: 12, color: "var(--workspace-muted)" };

export function ActivityTimeline({ workspaceSlug, recordId, activityTypes, currentRole }: Props) {
  const [activities, setActivities] = useState<ActivityTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newType, setNewType] = useState("note");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = currentRole !== "viewer";

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (search.trim()) params.set("q", search.trim());
    if (pinnedOnly) params.set("pinned", "true");
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/records/${recordId}/activities?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { activities?: ActivityTimelineEntry[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo cargar la actividad.");
        setActivities([]);
        return;
      }
      setActivities(json.activities ?? []);
    } catch {
      setError("Error de red al cargar actividad.");
    } finally {
      setLoading(false);
    }
  }, [pinnedOnly, recordId, search, typeFilter, workspaceSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pinnedNotes = useMemo(
    () => activities.filter((entry) => entry.isPinned && entry.type === "note"),
    [activities],
  );
  const timelineEntries = useMemo(
    () => activities.filter((entry) => !(entry.isPinned && entry.type === "note")),
    [activities],
  );

  const typeLookup = useMemo(() => new Map(activityTypes.map((t) => [t.key, t])), [activityTypes]);

  async function handleSubmitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newBody.trim() && !newSubject.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/records/${recordId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          subject: newSubject.trim() || null,
          body: newBody.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo crear la nota.");
      } else {
        setNewBody("");
        setNewSubject("");
        await reload();
      }
    } catch {
      setError("Error de red al crear nota.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePin(entry: ActivityTimelineEntry) {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/records/${recordId}/activities/${entry.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPinned: !entry.isPinned }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo fijar la nota.");
      } else {
        await reload();
      }
    } catch {
      setError("Error de red.");
    }
  }

  async function handleDelete(entry: ActivityTimelineEntry) {
    if (!confirm("¿Eliminar esta actividad?")) return;
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/records/${recordId}/activities/${entry.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "No se pudo eliminar.");
      } else {
        await reload();
      }
    } catch {
      setError("Error de red.");
    }
  }

  return (
    <section style={sectionStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Actividad</h2>
        <div style={filterRowStyle}>
          <div style={searchWrapperStyle}>
            <Search size={13} style={searchIconStyle} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar en asunto/cuerpo…"
              style={inputStyle}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            style={selectStyle}
          >
            <option value="">Todos los tipos</option>
            {activityTypes.map((type) => (
              <option key={type.id} value={type.key}>
                {type.name}
              </option>
            ))}
          </select>
          <label style={pinnedFilterLabelStyle}>
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(event) => setPinnedOnly(event.target.checked)}
              style={{ width: 14, height: 14, accentColor: "var(--workspace-accent)" }}
            />
            Solo fijadas
          </label>
        </div>
      </header>

      {canWrite ? (
        <form onSubmit={handleSubmitNote} style={formStyle}>
          <div style={formTopRowStyle}>
            <select
              value={newType}
              onChange={(event) => setNewType(event.target.value)}
              style={selectStyle}
            >
              {activityTypes.map((type) => (
                <option key={type.id} value={type.key}>
                  {type.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newSubject}
              onChange={(event) => setNewSubject(event.target.value)}
              placeholder="Asunto (opcional)"
              style={subjectInputStyle}
            />
          </div>
          <textarea
            value={newBody}
            onChange={(event) => setNewBody(event.target.value)}
            placeholder="Escribe una nota, log de llamada o actualización…"
            rows={2}
            style={textareaStyle}
          />
          <button
            type="submit"
            disabled={submitting || (!newBody.trim() && !newSubject.trim())}
            style={{
              ...submitButtonStyle,
              opacity: submitting || (!newBody.trim() && !newSubject.trim()) ? 0.5 : 1,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {submitting ? "Guardando…" : "Registrar"}
          </button>
        </form>
      ) : null}

      {error ? <div style={errorBoxStyle}>{error}</div> : null}

      {pinnedNotes.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={pinnedHeaderStyle}>Notas fijadas ({pinnedNotes.length}/5)</p>
          <ul style={pinnedListStyle}>
            {pinnedNotes.map((entry) => (
              <li key={entry.id} style={pinnedItemStyle}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {entry.subject ? (
                    <p style={{ ...subjectTextStyle, color: "#78350f" }}>{entry.subject}</p>
                  ) : null}
                  {entry.body ? (
                    <p style={{ ...bodyTextStyle, color: "#92400e" }}>{entry.body}</p>
                  ) : null}
                  <p style={{ margin: 0, fontSize: 11, color: "#a16207" }}>
                    {formatTimeAgo(entry.occurredAt)}
                  </p>
                </div>
                {canWrite ? (
                  <div style={cardActionsStyle}>
                    <button
                      type="button"
                      onClick={() => handleTogglePin(entry)}
                      style={{ ...iconButtonStyle, color: "#a16207" }}
                      title="Quitar pin"
                    >
                      <PinOff size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      style={{ ...iconButtonStyle, color: "#b91c1c" }}
                      title="Borrar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol style={timelineListStyle}>
        {loading ? (
          <li style={{ ...loadingTextStyle }}>Cargando actividad…</li>
        ) : timelineEntries.length === 0 ? (
          <li style={{ ...loadingTextStyle }}>Sin actividad registrada todavía.</li>
        ) : (
          timelineEntries.map((entry) => {
            const typeInfo = typeLookup.get(entry.type);
            const Icon = iconForType(entry.type);
            return (
              <li key={entry.id} style={timelineItemStyle}>
                <span style={iconBubbleStyle}>
                  <Icon size={15} />
                </span>
                <div style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={typeBadgeStyle}>{typeInfo?.name ?? entry.type}</span>
                      <span>{formatTimeAgo(entry.occurredAt)}</span>
                    </span>
                    {canWrite ? (
                      <div style={cardActionsStyle}>
                        {entry.type === "note" ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePin(entry)}
                            style={{
                              ...iconButtonStyle,
                              color: entry.isPinned ? "#b45309" : "var(--workspace-muted)",
                            }}
                            title={entry.isPinned ? "Quitar pin" : "Fijar"}
                          >
                            {entry.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          style={{ ...iconButtonStyle, color: "#b91c1c" }}
                          title="Borrar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {entry.subject ? <p style={subjectTextStyle}>{entry.subject}</p> : null}
                  {entry.body ? <p style={bodyTextStyle}>{entry.body}</p> : null}
                </div>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
