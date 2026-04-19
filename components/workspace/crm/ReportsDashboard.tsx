"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BarChart3,
  Bookmark,
  BookmarkPlus,
  Calendar,
  LineChart,
  PieChart,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";

type DateRangePreset = "7d" | "30d" | "90d" | "month" | "quarter" | "all";

type PipelineReport = {
  stages: Array<{
    stage_id: string;
    stage_name: string;
    stage_type: "active" | "won" | "lost";
    pipeline_id: string;
    probability: number;
    count: number;
    total_amount: number;
    weighted_amount: number;
  }>;
  totals: { count: number; total_amount: number; weighted_amount: number };
};

type WinRateReport = {
  overall: { won: number; lost: number; rate: number };
  byOwner: Array<{
    owner_user_id: string;
    won: number;
    lost: number;
    rate: number;
    total_won_amount: number;
  }>;
};

type VelocityReport = {
  avg_days_to_close: number;
  sample_size: number;
  sparkline: Array<{ month: string; avg_days: number; count: number }>;
};

type ForecastReport = {
  months: Array<{ month: string; count: number; total_amount: number; weighted_amount: number }>;
  total_weighted: number;
};

type ActivityReport = {
  days: Array<{ date: string; user_id: string; type: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  total: number;
};

type FunnelReport = {
  stages: Array<{ stage_name: string; count: number }>;
  total: number;
};

type Props = {
  workspaceSlug: string;
};

type ReportBookmark = {
  id: string;
  name: string;
  preset: DateRangePreset;
  createdAt: string;
};

const PRESET_LABELS: Record<DateRangePreset, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  month: "Este mes",
  quarter: "Este trimestre",
  all: "Todo",
};

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const filterChipBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 14px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--workspace-muted)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-pill)",
  cursor: "pointer",
  fontFamily: "inherit",
};

function filterChipStyle(active: boolean): CSSProperties {
  if (!active) return filterChipBase;
  return {
    ...filterChipBase,
    color: "var(--workspace-accent-strong)",
    background: "var(--workspace-accent-soft)",
    borderColor: "rgba(51, 92, 255, 0.25)",
  };
}

const refreshButtonStyle: CSSProperties = {
  ...filterChipBase,
  marginLeft: 0,
};

const bookmarksWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginLeft: "auto",
};

const bookmarksPopoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  minWidth: 280,
  maxHeight: 320,
  overflowY: "auto",
  padding: 6,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.12)",
  zIndex: 20,
};

const bookmarksEmptyStyle: CSSProperties = {
  padding: "12px 10px",
  fontSize: 12,
  color: "var(--workspace-muted)",
  textAlign: "center",
};

const bookmarkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 4px",
};

const bookmarkApplyStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "8px 10px",
  background: "transparent",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const bookmarkNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const bookmarkMetaStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const bookmarkDeleteStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  background: "transparent",
  border: "none",
  borderRadius: 6,
  color: "var(--workspace-muted)",
  cursor: "pointer",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 20,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "0 1px 2px rgba(17, 24, 39, 0.04)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const cardSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const metricValueStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--workspace-text)",
  letterSpacing: "-0.02em",
};

const metricLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-muted)",
  fontWeight: 600,
};

const barRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const barLabelStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  color: "var(--workspace-text)",
};

const barTrackStyle: CSSProperties = {
  position: "relative",
  height: 10,
  background: "#eef1f5",
  borderRadius: 999,
  overflow: "hidden",
};

const wideBarTrackStyle: CSSProperties = {
  position: "relative",
  height: 18,
  background: "#eef1f5",
  borderRadius: 6,
  overflow: "hidden",
  display: "flex",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 12,
};

const thStyle: CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  borderBottom: "1px solid var(--workspace-border)",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  color: "var(--workspace-text)",
  borderBottom: "1px solid var(--workspace-border)",
};

const emptyStyle: CSSProperties = {
  padding: "24px 12px",
  textAlign: "center",
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const drilldownRowStyle: CSSProperties = {
  cursor: "pointer",
};

const drilldownLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  display: "inline-block",
  width: "100%",
};

const funnelRowLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  cursor: "pointer",
  borderRadius: 6,
  padding: "4px 6px",
  margin: "0 -6px",
  transition: "background 120ms ease",
};

function colorForStageType(type: "active" | "won" | "lost") {
  if (type === "won") return "#16a34a";
  if (type === "lost") return "#dc2626";
  return "#335cff";
}

function formatCurrency(amount: number) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(0)}`;
  }
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  try {
    return date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
  } catch {
    return key;
  }
}

export function ReportsDashboard({ workspaceSlug }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [pipeline, setPipeline] = useState<PipelineReport | null>(null);
  const [winRate, setWinRate] = useState<WinRateReport | null>(null);
  const [velocity, setVelocity] = useState<VelocityReport | null>(null);
  const [forecast, setForecast] = useState<ForecastReport | null>(null);
  const [activity, setActivity] = useState<ActivityReport | null>(null);
  const [funnel, setFunnel] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bookmarks, setBookmarks] = useState<ReportBookmark[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const bookmarksKey = `crm:reports:bookmarks:${workspaceSlug}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(bookmarksKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (item): item is ReportBookmark =>
            !!item &&
            typeof item === "object" &&
            typeof (item as ReportBookmark).id === "string" &&
            typeof (item as ReportBookmark).name === "string" &&
            typeof (item as ReportBookmark).preset === "string",
        );
        setBookmarks(valid);
      }
    } catch {
      // ignore corrupt storage
    }
  }, [bookmarksKey]);

  function persistBookmarks(next: ReportBookmark[]) {
    setBookmarks(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(bookmarksKey, JSON.stringify(next));
      } catch {
        // best effort
      }
    }
  }

  function saveCurrentAsBookmark() {
    const defaultName = `${PRESET_LABELS[preset]} · ${new Date().toLocaleDateString("es-MX")}`;
    const name = window.prompt("Nombre del bookmark", defaultName);
    if (!name || !name.trim()) return;
    const bookmark: ReportBookmark = {
      id: `bm_${Date.now().toString(36)}`,
      name: name.trim(),
      preset,
      createdAt: new Date().toISOString(),
    };
    persistBookmarks([bookmark, ...bookmarks].slice(0, 20));
    setBookmarksOpen(true);
  }

  function applyBookmark(bookmark: ReportBookmark) {
    setPreset(bookmark.preset);
    setBookmarksOpen(false);
  }

  function removeBookmark(id: string) {
    persistBookmarks(bookmarks.filter((bm) => bm.id !== id));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      setError(null);
      const base = `/api/workspaces/${workspaceSlug}/crm/reports`;
      const rangeQuery = `range=${preset}`;
      try {
        const [p, w, v, f, a, fn] = await Promise.all([
          fetch(`${base}/pipeline?${rangeQuery}`).then((r) => r.json()),
          fetch(`${base}/win-rate?${rangeQuery}`).then((r) => r.json()),
          fetch(`${base}/velocity`).then((r) => r.json()),
          fetch(`${base}/forecast`).then((r) => r.json()),
          fetch(`${base}/activity?days=30`).then((r) => r.json()),
          fetch(`${base}/funnel?${rangeQuery}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setPipeline(p as PipelineReport);
        setWinRate(w as WinRateReport);
        setVelocity(v as VelocityReport);
        setForecast(f as ForecastReport);
        setActivity(a as ActivityReport);
        setFunnel(fn as FunnelReport);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error cargando reportes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, preset, refreshKey]);

  const pipelineMaxAmount = useMemo(() => {
    if (!pipeline) return 0;
    return pipeline.stages.reduce((max, stage) => Math.max(max, stage.total_amount), 0);
  }, [pipeline]);

  const forecastMax = useMemo(() => {
    if (!forecast) return 0;
    return forecast.months.reduce((max, m) => Math.max(max, m.weighted_amount), 0);
  }, [forecast]);

  const funnelMax = useMemo(() => {
    if (!funnel) return 0;
    return funnel.stages.reduce((max, entry) => Math.max(max, entry.count), 0);
  }, [funnel]);

  const velocitySparkMax = useMemo(() => {
    if (!velocity) return 0;
    return velocity.sparkline.reduce((max, m) => Math.max(max, m.avg_days), 0);
  }, [velocity]);

  return (
    <div style={rootStyle}>
      <div style={filterBarStyle}>
        {(Object.keys(PRESET_LABELS) as DateRangePreset[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreset(key)}
            style={filterChipStyle(preset === key)}
          >
            <Calendar size={13} />
            {PRESET_LABELS[key]}
          </button>
        ))}
        <div style={bookmarksWrapStyle}>
          <button
            type="button"
            onClick={saveCurrentAsBookmark}
            style={filterChipBase}
            title="Guardar bookmark del reporte actual"
          >
            <BookmarkPlus size={13} />
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setBookmarksOpen((open) => !open)}
            style={filterChipBase}
            aria-haspopup="menu"
            aria-expanded={bookmarksOpen}
          >
            <Bookmark size={13} />
            Bookmarks ({bookmarks.length})
          </button>
          {bookmarksOpen ? (
            <div role="menu" style={bookmarksPopoverStyle}>
              {bookmarks.length === 0 ? (
                <div style={bookmarksEmptyStyle}>Sin bookmarks guardados.</div>
              ) : (
                bookmarks.map((bookmark) => (
                  <div key={bookmark.id} style={bookmarkRowStyle}>
                    <button
                      type="button"
                      onClick={() => applyBookmark(bookmark)}
                      style={bookmarkApplyStyle}
                      title={`${PRESET_LABELS[bookmark.preset]} · ${new Date(
                        bookmark.createdAt,
                      ).toLocaleDateString("es-MX")}`}
                    >
                      <span style={bookmarkNameStyle}>{bookmark.name}</span>
                      <span style={bookmarkMetaStyle}>{PRESET_LABELS[bookmark.preset]}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBookmark(bookmark.id)}
                      style={bookmarkDeleteStyle}
                      aria-label={`Eliminar bookmark ${bookmark.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((n) => n + 1)}
          style={refreshButtonStyle}
          disabled={loading}
        >
          <RefreshCw size={13} />
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            padding: "12px 16px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "var(--radius-md)",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={gridStyle}>
        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>
              <BarChart3 size={16} /> Pipeline
            </h3>
            <span style={cardSubtitleStyle}>
              {pipeline ? `${pipeline.totals.count} oportunidades` : "—"}
            </span>
          </div>
          {pipeline ? (
            <>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <p style={metricLabelStyle}>Total</p>
                  <p style={metricValueStyle}>{formatCurrency(pipeline.totals.total_amount)}</p>
                </div>
                <div>
                  <p style={metricLabelStyle}>Ponderado</p>
                  <p style={{ ...metricValueStyle, color: "var(--workspace-accent-strong)" }}>
                    {formatCurrency(pipeline.totals.weighted_amount)}
                  </p>
                </div>
              </div>
              {pipeline.stages.length === 0 ? (
                <div style={emptyStyle}>Sin oportunidades en el rango.</div>
              ) : (
                <>
                  <div style={wideBarTrackStyle}>
                    {pipeline.stages.map((stage) => {
                      const totalCount = pipeline.totals.count || 1;
                      const width = `${Math.max((stage.count / totalCount) * 100, 0)}%`;
                      return (
                        <div
                          key={stage.stage_id}
                          style={{
                            width,
                            background: colorForStageType(stage.stage_type),
                            opacity: 0.85,
                          }}
                          title={`${stage.stage_name}: ${stage.count}`}
                        />
                      );
                    })}
                  </div>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Etapa</th>
                        <th style={thStyle}>Cant.</th>
                        <th style={thStyle}>Total</th>
                        <th style={thStyle}>Ponderado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipeline.stages.map((stage) => {
                        const drilldownHref = `/workspaces/${workspaceSlug}/crm/deals?stage_id=${encodeURIComponent(
                          stage.stage_id,
                        )}&pipeline_id=${encodeURIComponent(stage.pipeline_id)}`;
                        return (
                          <tr key={stage.stage_id} style={drilldownRowStyle}>
                            <td style={tdStyle}>
                              <Link href={drilldownHref} style={drilldownLinkStyle} title="Ver oportunidades">
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    background: colorForStageType(stage.stage_type),
                                    marginRight: 8,
                                    verticalAlign: "middle",
                                  }}
                                />
                                {stage.stage_name}
                              </Link>
                            </td>
                            <td style={tdStyle}>
                              <Link href={drilldownHref} style={drilldownLinkStyle}>
                                {stage.count}
                              </Link>
                            </td>
                            <td style={tdStyle}>{formatCurrency(stage.total_amount)}</td>
                            <td style={tdStyle}>{formatCurrency(stage.weighted_amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : (
            <div style={emptyStyle}>—</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>
              <Target size={16} /> Win Rate
            </h3>
            <span style={cardSubtitleStyle}>{PRESET_LABELS[preset]}</span>
          </div>
          {winRate ? (
            <>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <p style={metricLabelStyle}>Tasa</p>
                  <p style={metricValueStyle}>{winRate.overall.rate}%</p>
                </div>
                <div>
                  <p style={metricLabelStyle}>Ganadas</p>
                  <p style={{ ...metricValueStyle, fontSize: 20 }}>{winRate.overall.won}</p>
                </div>
                <div>
                  <p style={metricLabelStyle}>Perdidas</p>
                  <p style={{ ...metricValueStyle, fontSize: 20 }}>{winRate.overall.lost}</p>
                </div>
              </div>
              {winRate.byOwner.length === 0 ? (
                <div style={emptyStyle}>Aún no hay cierres en el periodo.</div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Owner</th>
                      <th style={thStyle}>G</th>
                      <th style={thStyle}>P</th>
                      <th style={thStyle}>Tasa</th>
                      <th style={thStyle}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winRate.byOwner.map((owner) => (
                      <tr key={owner.owner_user_id}>
                        <td style={tdStyle}>{owner.owner_user_id}</td>
                        <td style={tdStyle}>{owner.won}</td>
                        <td style={tdStyle}>{owner.lost}</td>
                        <td style={tdStyle}>{owner.rate}%</td>
                        <td style={tdStyle}>{formatCurrency(owner.total_won_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <div style={emptyStyle}>—</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>
              <LineChart size={16} /> Velocidad de ventas
            </h3>
            <span style={cardSubtitleStyle}>Últimos 90 días</span>
          </div>
          {velocity ? (
            <>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <p style={metricLabelStyle}>Días a cierre (avg)</p>
                  <p style={metricValueStyle}>{velocity.avg_days_to_close || "—"}</p>
                </div>
                <div>
                  <p style={metricLabelStyle}>Muestra</p>
                  <p style={{ ...metricValueStyle, fontSize: 20 }}>{velocity.sample_size}</p>
                </div>
              </div>
              {velocity.sparkline.length === 0 ? (
                <div style={emptyStyle}>Sin cierres ganados en el periodo.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                  {velocity.sparkline.map((m) => {
                    const height =
                      velocitySparkMax > 0 ? (m.avg_days / velocitySparkMax) * 100 : 0;
                    return (
                      <div
                        key={m.month}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <div
                          title={`${m.month}: ${m.avg_days}d`}
                          style={{
                            width: "100%",
                            height: `${Math.max(height, 4)}%`,
                            background: "var(--workspace-accent)",
                            borderRadius: 4,
                          }}
                        />
                        <span style={{ fontSize: 10, color: "var(--workspace-muted)" }}>
                          {formatMonth(m.month)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={emptyStyle}>—</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>
              <TrendingUp size={16} /> Forecast
            </h3>
            <span style={cardSubtitleStyle}>Próximos 6 meses</span>
          </div>
          {forecast ? (
            <>
              <div>
                <p style={metricLabelStyle}>Ponderado total</p>
                <p style={metricValueStyle}>{formatCurrency(forecast.total_weighted)}</p>
              </div>
              {forecast.months.length === 0 ? (
                <div style={emptyStyle}>Sin pronóstico disponible.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {forecast.months.map((m) => {
                    const width =
                      forecastMax > 0 ? (m.weighted_amount / forecastMax) * 100 : 0;
                    return (
                      <div key={m.month} style={barRowStyle}>
                        <div style={barLabelStyle}>
                          <span>
                            {formatMonth(m.month)} · {m.count}
                          </span>
                          <span>{formatCurrency(m.weighted_amount)}</span>
                        </div>
                        <div style={barTrackStyle}>
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: `${Math.max(width, 2)}%`,
                              background: "var(--workspace-accent)",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={emptyStyle}>—</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>
              <BarChart3 size={16} /> Actividad
            </h3>
            <span style={cardSubtitleStyle}>Últimos 30 días</span>
          </div>
          {activity ? (
            <>
              <div>
                <p style={metricLabelStyle}>Total</p>
                <p style={metricValueStyle}>{activity.total}</p>
              </div>
              {activity.byType.length === 0 ? (
                <div style={emptyStyle}>Sin actividades registradas.</div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Conteo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.byType.slice(0, 8).map((row) => (
                      <tr key={row.type}>
                        <td style={tdStyle}>{row.type}</td>
                        <td style={tdStyle}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <div style={emptyStyle}>—</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h3 style={cardTitleStyle}>
              <PieChart size={16} /> Funnel de leads
            </h3>
            <span style={cardSubtitleStyle}>
              {funnel ? `${funnel.total} personas` : "—"}
            </span>
          </div>
          {funnel ? (
            funnel.stages.length === 0 ? (
              <div style={emptyStyle}>Sin personas en el rango.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {funnel.stages.map((stage) => {
                  const width =
                    funnelMax > 0 ? (stage.count / funnelMax) * 100 : 0;
                  const drilldownHref = `/workspaces/${workspaceSlug}/crm/people?stage=${encodeURIComponent(
                    stage.stage_name,
                  )}`;
                  return (
                    <Link
                      key={stage.stage_name}
                      href={drilldownHref}
                      style={{ ...barRowStyle, ...funnelRowLinkStyle }}
                      title={`Ver personas en etapa ${stage.stage_name}`}
                    >
                      <div style={barLabelStyle}>
                        <span style={{ textTransform: "capitalize" }}>{stage.stage_name}</span>
                        <span>{stage.count}</span>
                      </div>
                      <div style={barTrackStyle}>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: `${Math.max(width, 2)}%`,
                            background: "var(--workspace-accent)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          ) : (
            <div style={emptyStyle}>—</div>
          )}
        </section>
      </div>
    </div>
  );
}
