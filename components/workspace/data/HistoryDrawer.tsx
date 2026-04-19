"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { History, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/workspace/ui";

type AgentEvent = {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type Props = {
  workspaceSlug: string;
  objectId: string;
  objectName: string;
  onClose: () => void;
  onOpenRecord?: (recordId: string) => void;
};

export function HistoryDrawer({ workspaceSlug, objectId, objectName, onClose, onOpenRecord }: Props) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/activity?objectId=${encodeURIComponent(objectId)}&limit=50`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("No se pudo cargar el historial.");
      }
      const payload = (await response.json()) as { events?: AgentEvent[] };
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando historial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, objectId]);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <aside
        style={drawerStyle}
        onClick={(event) => event.stopPropagation()}
        role="complementary"
        aria-label="Historial del objeto"
      >
        <header style={headerStyle}>
          <div>
            <span style={eyebrowStyle}>Historial</span>
            <h2 style={titleStyle}>
              <History size={16} style={{ marginRight: 6, verticalAlign: "-2px" }} />
              {objectName}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button
              variant="ghost"
              compact
              onClick={() => void load()}
              disabled={loading}
              leadingIcon={<RefreshCw size={12} aria-hidden />}
            >
              Recargar
            </Button>
            <Button
              variant="ghost"
              compact
              onClick={onClose}
              leadingIcon={<X size={14} aria-hidden />}
            >
              Cerrar
            </Button>
          </div>
        </header>

        <div style={bodyStyle}>
          {error ? <div style={errorStyle}>{error}</div> : null}
          {loading && events.length === 0 ? (
            <div style={loadingStyle}>
              <Loader2
                size={16}
                aria-hidden
                style={{ animation: "ws-spin 1s linear infinite" }}
              />
              <span>Cargando historial…</span>
            </div>
          ) : events.length === 0 ? (
            <div style={drawerEmptyStateStyle}>
              <div style={emptyIconStyle}>
                <History size={22} color="var(--workspace-accent-strong, #2563eb)" aria-hidden />
              </div>
              <h3 style={emptyTitleStyle}>Sin cambios todavía</h3>
              <p style={emptyTextStyle}>
                Aquí verás los cambios recientes en {objectName}: creaciones, ediciones
                y eliminaciones, con quién las hizo y cuándo.
              </p>
            </div>
          ) : (
            <ul style={listStyle}>
              {events.map((event) => {
                const recordId = typeof event.payload?.record_id === "string" ? event.payload.record_id : null;
                const diff = Array.isArray(event.payload?.diff) ? (event.payload.diff as unknown[]) : null;
                return (
                  <li
                    key={event.id}
                    style={itemStyle(Boolean(recordId && onOpenRecord))}
                    onClick={() => {
                      if (recordId && onOpenRecord) onOpenRecord(recordId);
                    }}
                  >
                    <div style={itemHeaderStyle}>
                      <strong style={{ fontSize: 13 }}>{formatEventType(event.event_type)}</strong>
                      <span style={timeStyle}>{new Date(event.created_at).toLocaleString("es-MX")}</span>
                    </div>
                    {diff && diff.length > 0 ? (
                      <ul style={diffListStyle}>
                        {diff.slice(0, 6).map((entry, index) => (
                          <li key={index} style={diffItemStyle}>
                            {renderDiffLine(entry)}
                          </li>
                        ))}
                        {diff.length > 6 ? (
                          <li style={diffItemStyle}>…y {diff.length - 6} campos más</li>
                        ) : null}
                      </ul>
                    ) : null}
                    {recordId ? (
                      <span style={recordIdStyle}>record: {recordId.slice(0, 8)}…</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatEventType(type: string): string {
  if (type === "record.updated") return "Registro actualizado";
  if (type === "record.created") return "Registro creado";
  if (type === "record.deleted") return "Registro eliminado";
  return type.replace(/[._]/g, " ");
}

function renderDiffLine(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const row = entry as { field?: unknown; from?: unknown; to?: unknown };
  const field = String(row.field ?? "");
  const from = row.from === null || row.from === undefined || row.from === "" ? "—" : String(row.from);
  const to = row.to === null || row.to === undefined || row.to === "" ? "—" : String(row.to);
  return `${field}: ${from} → ${to}`;
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.25)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 34,
};

const drawerStyle: CSSProperties = {
  width: "min(520px, 100vw)",
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
  gap: 10,
  flex: 1,
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
  maxWidth: 360,
  lineHeight: 1.5,
};

const drawerEmptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "40px 16px",
  border: "1px dashed var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  background: "#ffffff",
  textAlign: "center",
};

const emptyIconStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "rgba(37, 99, 235, 0.08)",
  border: "1px solid rgba(37, 99, 235, 0.18)",
  marginBottom: 4,
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const loadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "32px 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

function itemStyle(clickable: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    background: "var(--workspace-surface-muted, #f8f9fc)",
    border: "1px solid var(--workspace-border)",
    borderRadius: "var(--radius-md)",
    cursor: clickable ? "pointer" : "default",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };
}

const itemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  color: "var(--workspace-text)",
};

const timeStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const diffListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
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

const recordIdStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--workspace-faint, #94a3b8)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
