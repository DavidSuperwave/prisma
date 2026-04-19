"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Download, LayoutGrid, List, Plus, Search, Settings2, X } from "lucide-react";
import { filterRecords, type FilterDsl } from "@/lib/crm/filters";
import { useColumnConfig } from "@/lib/useColumnConfig";
import type { SavedSmartView } from "./SmartViewEditor";
import { SmartViewsBar } from "./SmartViewsBar";
import { BulkActionBar, type BulkActionField } from "./BulkActionBar";
import { ColumnPicker } from "./ColumnPicker";
import { FieldManagerDrawer } from "./FieldManagerDrawer";

type Field = { id: string; key: string; name: string; type: string; isLocked: boolean };
type CrmRow = { id: string; data: Record<string, unknown> };
type Pipeline = { id: string; name: string; isDefault: boolean };
type PipelineStage = {
  id: string;
  pipelineId: string;
  name: string;
  stageType: "active" | "won" | "lost";
  probability: number;
  sortOrder: number;
};

type Props = {
  workspaceSlug: string;
  records: CrmRow[];
  fields: Field[];
  pipelines: Pipeline[];
  pipelineStages: PipelineStage[];
  people: CrmRow[];
  companies: CrmRow[];
  canWrite: boolean;
  objectId?: string;
  savedViews?: SavedSmartView[];
  initialViewId?: string | null;
  canCreateOrgView?: boolean;
  canManageFields?: boolean;
  sequencesAvailable?: boolean;
  /** Optional initial pipeline stage filter applied on mount (e.g. from a Reports drilldown). */
  initialStageId?: string | null;
  /** Optional initial pipeline id (used in tandem with initialStageId). */
  initialPipelineId?: string | null;
};

const TABLE_COLUMNS = ["title", "amount", "stage_id", "company_id", "expected_close_date", "owner_user_id"];

function formatCurrency(amount: unknown, currency: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  const code = typeof currency === "string" && currency.length > 0 ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

const containerStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};
const searchWrapperStyle: CSSProperties = {
  position: "relative",
  flex: "1 1 260px",
  minWidth: 240,
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
  height: 34,
  width: "100%",
  padding: "8px 12px 8px 34px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
};
const selectStyle: CSSProperties = {
  height: 34,
  padding: "0 28px 0 12px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
};
const plainInputStyle: CSSProperties = {
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
const primaryButtonStyle: CSSProperties = {
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
  whiteSpace: "nowrap",
  fontFamily: "inherit",
};
const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const segmentedWrapperStyle: CSSProperties = {
  display: "inline-flex",
  height: 34,
  padding: 3,
  background: "#f3f4f6",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  gap: 2,
};

function segmentButtonStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 600,
    color: active ? "#ffffff" : "var(--workspace-muted)",
    background: active ? "var(--workspace-accent)" : "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    height: "100%",
  };
}

type ChipTone = "success" | "info" | "danger" | "neutral";
function chipStyle(tone: ChipTone): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    borderRadius: "var(--radius-pill)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  };
  if (tone === "success") return { ...base, background: "rgba(66, 211, 139, 0.14)", color: "#0f8f52" };
  if (tone === "danger") return { ...base, background: "rgba(239, 68, 68, 0.14)", color: "#b91c1c" };
  if (tone === "info") return { ...base, background: "rgba(56, 189, 248, 0.14)", color: "#0369a1" };
  return { ...base, background: "rgba(17, 24, 39, 0.06)", color: "var(--workspace-text)" };
}

const kanbanScrollStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  overflowX: "auto",
  paddingBottom: 8,
};
const kanbanColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: 300,
  minWidth: 300,
  padding: 12,
  background: "#f3f4f6",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};
const kanbanHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
};
const kanbanStageNameStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
};
const kanbanMetaStyle: CSSProperties = {
  margin: 0,
  marginTop: 2,
  fontSize: 11,
  color: "var(--workspace-muted)",
};
const dealCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 12,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-sm)",
  textDecoration: "none",
  color: "var(--workspace-text)",
  boxShadow: "0 1px 2px rgba(17, 24, 39, 0.04)",
};
const dealCardTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
};
const dealCardMetaStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
};
const kanbanEmptyStyle: CSSProperties = {
  padding: 12,
  textAlign: "center",
  fontSize: 11,
  color: "var(--workspace-muted)",
  border: "1px dashed var(--workspace-border-strong)",
  borderRadius: "var(--radius-sm)",
  background: "rgba(255,255,255,0.5)",
};

const tableWrapperStyle: CSSProperties = {
  overflowX: "auto",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};
const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 14,
};
const theadRowStyle: CSSProperties = { background: "#f3f4f6" };
const thStyle: CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  borderBottom: "1px solid var(--workspace-border)",
  whiteSpace: "nowrap",
};
const tdStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  verticalAlign: "middle",
};
const rowLinkStyle: CSSProperties = {
  color: "var(--workspace-text)",
  fontWeight: 600,
  textDecoration: "none",
};
const mutedCellStyle: CSSProperties = { color: "var(--workspace-muted)" };
const emptyRowStyle: CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const quickFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
  padding: 16,
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const quickFormErrorStyle: CSSProperties = {
  gridColumn: "1 / -1",
  margin: 0,
  fontSize: 12,
  color: "#b91c1c",
};

export function DealsView({
  workspaceSlug,
  records,
  fields,
  pipelines,
  pipelineStages,
  people,
  companies,
  canWrite,
  objectId,
  savedViews: initialSavedViews,
  initialViewId,
  canCreateOrgView = false,
  canManageFields = false,
  sequencesAvailable = false,
  initialStageId = null,
  initialPipelineId = null,
}: Props) {
  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
  const [pipelineId, setPipelineId] = useState<string>(initialPipelineId ?? defaultPipeline?.id ?? "");
  // When a stage drilldown is requested, default to the table view so the filter
  // is immediately visible and predictable.
  const [viewMode, setViewMode] = useState<"kanban" | "table">(initialStageId ? "table" : "kanban");
  const [drilldownStageId, setDrilldownStageId] = useState<string | null>(initialStageId);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedSmartView[]>(initialSavedViews ?? []);
  const [activeViewId, setActiveViewId] = useState<string | null>(initialViewId ?? null);
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [managedFields, setManagedFields] = useState<Field[]>(fields);

  useEffect(() => {
    setManagedFields(fields);
  }, [fields]);
  const [activeFilter, setActiveFilter] = useState<FilterDsl | null>(() => {
    const view = (initialSavedViews ?? []).find((v) => v.id === initialViewId);
    if (view && view.filterDsl && typeof view.filterDsl === "object") {
      return view.filterDsl as FilterDsl;
    }
    return null;
  });

  useEffect(() => {
    if (initialSavedViews) setSavedViews(initialSavedViews);
  }, [initialSavedViews]);

  const activePipelineStages = useMemo(
    () => pipelineStages.filter((stage) => stage.pipelineId === pipelineId),
    [pipelineStages, pipelineId],
  );

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c] as const)), [companies]);
  const stageById = useMemo(
    () => new Map(pipelineStages.map((s) => [s.id, s] as const)),
    [pipelineStages],
  );

  const dslFiltered = useMemo(
    () => (activeFilter ? filterRecords(records, activeFilter) : records),
    [records, activeFilter],
  );

  const filteredRecords = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return dslFiltered.filter((record) => {
      if (pipelineId && record.data.pipeline_id !== pipelineId) return false;
      if (drilldownStageId && record.data.stage_id !== drilldownStageId) return false;
      if (!needle) return true;
      const haystack = typeof record.data.title === "string" ? record.data.title.toLowerCase() : "";
      return haystack.includes(needle);
    });
  }, [dslFiltered, pipelineId, drilldownStageId, search]);

  const editableFields: BulkActionField[] = useMemo(
    () =>
      fields
        .filter((field) => !field.isLocked)
        .map((field) => ({ key: field.key, name: field.name, type: field.type })),
    [fields],
  );

  const stageOptions = useMemo(
    () => activePipelineStages.map((stage) => ({ value: stage.id, label: stage.name })),
    [activePipelineStages],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeView = useMemo(
    () => (activeViewId ? savedViews.find((v) => v.id === activeViewId) ?? null : null),
    [activeViewId, savedViews],
  );

  // When the active saved view exposes a persisted view_mode (M10 Smart Views),
  // adopt it locally. For Deals we only surface two renderers (kanban | table);
  // board/pipeline map to kanban, table/kpi map to table.
  useEffect(() => {
    const persisted = activeView?.viewMode;
    if (!persisted) return;
    if (persisted === "board" || persisted === "pipeline") {
      setViewMode("kanban");
    } else if (persisted === "table" || persisted === "kpi") {
      setViewMode("table");
    }
  }, [activeView?.viewMode]);

  const { columns: visibleColumnKeys, setColumns: setVisibleColumnKeys, reset: resetColumnConfig } =
    useColumnConfig({
      storageKey: `crm:deals:${workspaceSlug}`,
      defaultColumns: TABLE_COLUMNS.filter((key) => fields.some((f) => f.key === key)),
      activeViewId,
      initialViewColumnConfig: activeView?.columnConfig,
      workspaceSlug,
    });

  const columns = useMemo(() => {
    const map = new Map(fields.map((f) => [f.key, f]));
    return visibleColumnKeys
      .map((key) => map.get(key))
      .filter((field): field is Field => Boolean(field));
  }, [fields, visibleColumnKeys]);

  const columnOptions = useMemo(
    () => fields.map((field) => ({ key: field.key, label: field.name })),
    [fields],
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, CrmRow[]>();
    for (const stage of activePipelineStages) grouped.set(stage.id, []);
    for (const record of filteredRecords) {
      const stageId = typeof record.data.stage_id === "string" ? record.data.stage_id : "";
      if (grouped.has(stageId)) {
        grouped.get(stageId)!.push(record);
      }
    }
    return grouped;
  }, [activePipelineStages, filteredRecords]);

  function stageTotal(stageId: string) {
    const deals = dealsByStage.get(stageId) ?? [];
    let total = 0;
    for (const deal of deals) {
      const amount = deal.data.amount;
      if (typeof amount === "number") total += amount;
    }
    return total;
  }

  function stageChipTone(type: PipelineStage["stageType"]): ChipTone {
    if (type === "won") return "success";
    if (type === "lost") return "danger";
    return "neutral";
  }

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        {pipelines.length > 1 ? (
          <select
            value={pipelineId}
            onChange={(event) => setPipelineId(event.target.value)}
            style={selectStyle}
          >
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        ) : null}
        <div style={searchWrapperStyle}>
          <Search size={15} style={searchIconStyle} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar oportunidad…"
            style={inputStyle}
          />
        </div>
        {drilldownStageId ? (
          <button
            type="button"
            onClick={() => setDrilldownStageId(null)}
            title="Quitar filtro de etapa"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 12px",
              borderRadius: "var(--radius-pill)",
              background: "var(--workspace-accent-soft, rgba(51, 92, 255, 0.08))",
              color: "var(--workspace-accent-strong, #1c3fb8)",
              border: "1px solid rgba(51, 92, 255, 0.22)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Etapa: {stageById.get(drilldownStageId)?.name ?? drilldownStageId} ✕
          </button>
        ) : null}
        <div style={segmentedWrapperStyle}>
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            style={segmentButtonStyle(viewMode === "kanban")}
          >
            <LayoutGrid size={14} />
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            style={segmentButtonStyle(viewMode === "table")}
          >
            <List size={14} />
            Tabla
          </button>
        </div>
        {objectId ? (
          <SmartViewsBar
            workspaceSlug={workspaceSlug}
            objectId={objectId}
            fields={fields.map((f) => ({ key: f.key, name: f.name, type: f.type }))}
            records={records}
            savedViews={savedViews}
            activeViewId={activeViewId}
            activeFilter={activeFilter}
            canEdit={canWrite}
            canCreateOrgView={canCreateOrgView}
            onApplyFilter={(filter) => setActiveFilter(filter)}
            onSelectView={(view) => setActiveViewId(view?.id ?? null)}
            onSavedViewsChange={(views) => setSavedViews(views)}
          />
        ) : null}
        <ColumnPicker
          options={columnOptions}
          value={visibleColumnKeys}
          onChange={setVisibleColumnKeys}
          onReset={resetColumnConfig}
        />
        {canManageFields && objectId ? (
          <button type="button" style={ghostButtonStyle} onClick={() => setShowFieldManager(true)}>
            <Settings2 size={15} aria-hidden /> Campos
          </button>
        ) : null}
        <a
          href={`/api/workspaces/${workspaceSlug}/crm/deals/export`}
          style={ghostButtonStyle}
        >
          <Download size={15} />
          Exportar CSV
        </a>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowCreate((prev) => !prev)}
            style={showCreate ? ghostButtonStyle : primaryButtonStyle}
          >
            {showCreate ? (
              <>
                <X size={15} />
                Cancelar
              </>
            ) : (
              <>
                <Plus size={15} strokeWidth={2.2} />
                Nueva oportunidad
              </>
            )}
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <QuickCreateDeal
          workspaceSlug={workspaceSlug}
          pipelineId={pipelineId}
          stages={activePipelineStages}
          people={people}
          companies={companies}
          onDone={() => {
            setShowCreate(false);
            window.location.reload();
          }}
        />
      ) : null}

      {selected.size > 0 && canWrite ? (
        <BulkActionBar
          workspaceSlug={workspaceSlug}
          entity="deals"
          selectedIds={Array.from(selected)}
          editableFields={editableFields}
          stageOptions={stageOptions}
          records={records}
          canDelete={canWrite}
          sequencesAvailable={sequencesAvailable}
          onClear={() => setSelected(new Set())}
          onCompleted={() => {
            setSelected(new Set());
            window.location.reload();
          }}
        />
      ) : null}

      {viewMode === "kanban" ? (
        <div style={kanbanScrollStyle}>
          {activePipelineStages.map((stage) => {
            const deals = dealsByStage.get(stage.id) ?? [];
            const total = stageTotal(stage.id);
            return (
              <div key={stage.id} style={kanbanColumnStyle}>
                <header style={kanbanHeaderStyle}>
                  <div>
                    <h3 style={kanbanStageNameStyle}>{stage.name}</h3>
                    <p style={kanbanMetaStyle}>
                      {deals.length} · {formatCurrency(total, deals[0]?.data.currency ?? "USD")}
                    </p>
                  </div>
                  <span style={chipStyle(stageChipTone(stage.stageType))}>{stage.stageType}</span>
                </header>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {deals.map((deal) => {
                    const companyId = typeof deal.data.company_id === "string" ? deal.data.company_id : null;
                    const company = companyId ? companyById.get(companyId) : null;
                    return (
                      <Link
                        key={deal.id}
                        href={`/workspaces/${workspaceSlug}/crm/deals/${deal.id}`}
                        style={dealCardStyle}
                      >
                        <span style={dealCardTitleStyle}>
                          {typeof deal.data.title === "string" ? deal.data.title : "Oportunidad"}
                        </span>
                        <span style={dealCardMetaStyle}>
                          {formatCurrency(deal.data.amount, deal.data.currency)}
                          {company && typeof company.data.name === "string"
                            ? ` · ${company.data.name}`
                            : ""}
                        </span>
                      </Link>
                    );
                  })}
                  {deals.length === 0 ? (
                    <p style={kanbanEmptyStyle}>Sin oportunidades</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={theadRowStyle}>
                {canWrite ? <th style={{ ...thStyle, width: 36 }} aria-label="select" /> : null}
                {columns.map((field) => (
                  <th key={field.id} style={thStyle}>
                    {field.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((deal) => (
                <tr
                  key={deal.id}
                  style={{ background: selected.has(deal.id) ? "rgba(51, 92, 255, 0.04)" : "transparent" }}
                >
                  {canWrite ? (
                    <td style={{ ...tdStyle, width: 36, padding: "12px 8px 12px 16px" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(deal.id)}
                        onChange={() => toggleSelect(deal.id)}
                        style={{ width: 16, height: 16, accentColor: "var(--workspace-accent)", cursor: "pointer" }}
                      />
                    </td>
                  ) : null}
                  {columns.map((field, idx) => {
                    let display: React.ReactNode = <span style={mutedCellStyle}>—</span>;
                    const raw = deal.data[field.key];
                    if (field.key === "amount") {
                      display = formatCurrency(raw, deal.data.currency);
                    } else if (field.key === "stage_id" && typeof raw === "string") {
                      const stageName = stageById.get(raw)?.name;
                      display = stageName ?? <span style={mutedCellStyle}>—</span>;
                    } else if (field.key === "company_id" && typeof raw === "string") {
                      const company = companyById.get(raw);
                      display = typeof company?.data.name === "string"
                        ? company.data.name
                        : <span style={mutedCellStyle}>—</span>;
                    } else if (raw !== null && raw !== undefined && raw !== "") {
                      display = String(raw);
                    }
                    return (
                      <td key={field.id} style={tdStyle}>
                        {idx === 0 ? (
                          <Link
                            href={`/workspaces/${workspaceSlug}/crm/deals/${deal.id}`}
                            style={rowLinkStyle}
                          >
                            {display}
                          </Link>
                        ) : (
                          display
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (canWrite ? 1 : 0)} style={emptyRowStyle}>
                    Sin oportunidades.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {canManageFields && objectId ? (
        <FieldManagerDrawer
          workspaceSlug={workspaceSlug}
          objectId={objectId}
          initialFields={managedFields}
          open={showFieldManager}
          onClose={() => setShowFieldManager(false)}
          onChange={(next) => setManagedFields(next)}
        />
      ) : null}
    </div>
  );
}

function QuickCreateDeal({
  workspaceSlug,
  pipelineId,
  stages,
  people,
  companies,
  onDone,
}: {
  workspaceSlug: string;
  pipelineId: string;
  stages: PipelineStage[];
  people: CrmRow[];
  companies: CrmRow[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/crm/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          amount: amount ? Number(amount) : undefined,
          currency,
          pipelineId,
          stageId: stageId || undefined,
          companyId: companyId || undefined,
          primaryContactId: contactId || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo crear la oportunidad.");
      } else {
        onDone();
      }
    } catch {
      setError("Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={quickFormStyle}>
      <input
        type="text"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Título"
        style={{ ...plainInputStyle, gridColumn: "span 2" }}
      />
      <input
        type="number"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Monto"
        style={plainInputStyle}
      />
      <select
        value={currency}
        onChange={(event) => setCurrency(event.target.value)}
        style={selectStyle}
      >
        <option>USD</option>
        <option>MXN</option>
        <option>EUR</option>
      </select>
      <select
        value={stageId}
        onChange={(event) => setStageId(event.target.value)}
        style={selectStyle}
      >
        <option value="">Etapa…</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
      <select
        value={companyId}
        onChange={(event) => setCompanyId(event.target.value)}
        style={selectStyle}
      >
        <option value="">Empresa…</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {typeof company.data.name === "string" ? company.data.name : company.id}
          </option>
        ))}
      </select>
      <select
        value={contactId}
        onChange={(event) => setContactId(event.target.value)}
        style={{ ...selectStyle, gridColumn: "span 2" }}
      >
        <option value="">Contacto principal…</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {typeof person.data.full_name === "string" ? person.data.full_name : person.id}
          </option>
        ))}
      </select>
      <div style={{ gridColumn: "span 4", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          style={{
            ...primaryButtonStyle,
            opacity: submitting || !title.trim() ? 0.5 : 1,
            cursor: submitting ? "wait" : !title.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Creando…" : "Crear oportunidad"}
        </button>
      </div>
      {error ? <p style={quickFormErrorStyle}>{error}</p> : null}
    </form>
  );
}
