"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Download, Plus, Search, Settings2, X } from "lucide-react";
import { filterRecords, type FilterDsl } from "@/lib/crm/filters";
import { useColumnConfig } from "@/lib/useColumnConfig";
import type { SavedSmartView } from "./SmartViewEditor";
import { SmartViewsBar } from "./SmartViewsBar";
import { BulkActionBar, type BulkActionField } from "./BulkActionBar";
import { ColumnPicker } from "./ColumnPicker";
import { FieldManagerDrawer } from "./FieldManagerDrawer";
import { InlineStageSelect } from "./InlineStageSelect";

type Field = { id: string; key: string; name: string; type: string; isLocked: boolean };
type CrmRow = { id: string; data: Record<string, unknown> };

type Props = {
  workspaceSlug: string;
  records: CrmRow[];
  fields: Field[];
  companies: CrmRow[];
  canWrite: boolean;
  objectId?: string;
  savedViews?: SavedSmartView[];
  initialViewId?: string | null;
  canCreateOrgView?: boolean;
  canManageFields?: boolean;
  sequencesAvailable?: boolean;
  /** Optional initial stage filter applied on mount (e.g. from a Reports drilldown). */
  initialStageFilter?: string | null;
};

const DEFAULT_COLUMNS = ["full_name", "email", "phone", "stage", "company_id", "owner_user_id"];

const PEOPLE_STAGE_OPTIONS: Array<{ value: string; label: string; tone?: "success" | "info" | "danger" | "neutral" }> = [
  { value: "new", label: "New", tone: "neutral" },
  { value: "lead", label: "Lead", tone: "neutral" },
  { value: "qualified", label: "Qualified", tone: "info" },
  { value: "opportunity", label: "Opportunity", tone: "info" },
  { value: "customer", label: "Customer", tone: "success" },
  { value: "lost", label: "Lost", tone: "danger" },
  { value: "unqualified", label: "Unqualified", tone: "danger" },
];

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

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

const bulkBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 14px",
  background: "var(--workspace-accent-soft)",
  border: "1px solid rgba(51, 92, 255, 0.18)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  color: "var(--workspace-accent-strong)",
  fontWeight: 500,
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

const theadRowStyle: CSSProperties = {
  background: "#f3f4f6",
};

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

const thCheckboxStyle: CSSProperties = {
  ...thStyle,
  width: 36,
  padding: "12px 8px 12px 16px",
};

const tdStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  verticalAlign: "middle",
};

const tdCheckboxStyle: CSSProperties = {
  ...tdStyle,
  width: 36,
  padding: "12px 8px 12px 16px",
};

const rowLinkStyle: CSSProperties = {
  color: "var(--workspace-text)",
  fontWeight: 600,
  textDecoration: "none",
};

const mutedCellStyle: CSSProperties = {
  color: "var(--workspace-muted)",
};

const emptyRowStyle: CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const quickFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  padding: 16,
  background: "#f9fafb",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const quickFormInputStyle: CSSProperties = {
  ...inputStyle,
  padding: "8px 12px",
};

const quickFormActionsStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
};

const quickFormErrorStyle: CSSProperties = {
  gridColumn: "1 / -1",
  margin: 0,
  fontSize: 12,
  color: "#b91c1c",
};

const checkboxStyle: CSSProperties = {
  width: 16,
  height: 16,
  accentColor: "var(--workspace-accent)",
  cursor: "pointer",
};

type ChipTone = "success" | "info" | "danger" | "neutral";

function chipTone(value: string): ChipTone {
  const v = value.toLowerCase();
  if (v === "customer" || v === "won") return "success";
  if (v === "qualified" || v === "opportunity") return "info";
  if (v === "lost" || v === "unqualified") return "danger";
  return "neutral";
}

function chipStyle(tone: ChipTone): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: "var(--radius-pill)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  };
  if (tone === "success") {
    return { ...base, background: "rgba(66, 211, 139, 0.14)", color: "#0f8f52" };
  }
  if (tone === "info") {
    return { ...base, background: "rgba(56, 189, 248, 0.14)", color: "#0369a1" };
  }
  if (tone === "danger") {
    return { ...base, background: "rgba(239, 68, 68, 0.14)", color: "#b91c1c" };
  }
  return { ...base, background: "rgba(17, 24, 39, 0.06)", color: "var(--workspace-text)" };
}

export function PeopleView({
  workspaceSlug,
  records,
  fields,
  companies,
  canWrite,
  objectId,
  savedViews: initialSavedViews,
  initialViewId,
  canCreateOrgView = false,
  canManageFields = false,
  sequencesAvailable = false,
  initialStageFilter = null,
}: Props) {
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [managedFields, setManagedFields] = useState<Field[]>(fields);

  useEffect(() => {
    setManagedFields(fields);
  }, [fields]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(initialStageFilter ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedSmartView[]>(initialSavedViews ?? []);
  const [activeViewId, setActiveViewId] = useState<string | null>(initialViewId ?? null);
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

  const activeView = useMemo(
    () => (activeViewId ? savedViews.find((v) => v.id === activeViewId) ?? null : null),
    [activeViewId, savedViews],
  );
  const { columns: visibleColumnKeys, setColumns: setVisibleColumnKeys, reset: resetColumnConfig } =
    useColumnConfig({
      storageKey: `crm:people:${workspaceSlug}`,
      defaultColumns: DEFAULT_COLUMNS.filter((key) => fields.some((f) => f.key === key)),
      activeViewId,
      initialViewColumnConfig: activeView?.columnConfig,
      workspaceSlug,
    });

  const columns = useMemo(() => {
    const available = new Map(fields.map((f) => [f.key, f]));
    return visibleColumnKeys
      .map((key) => available.get(key))
      .filter((field): field is Field => Boolean(field));
  }, [fields, visibleColumnKeys]);

  const columnOptions = useMemo(
    () => fields.map((field) => ({ key: field.key, label: field.name })),
    [fields],
  );

  const companyById = useMemo(
    () => new Map(companies.map((c) => [c.id, c] as const)),
    [companies],
  );

  const stages = useMemo(() => {
    const set = new Set<string>();
    records.forEach((record) => {
      if (typeof record.data.stage === "string") set.add(record.data.stage);
    });
    return Array.from(set).sort();
  }, [records]);

  const dslFiltered = useMemo(
    () => (activeFilter ? filterRecords(records, activeFilter) : records),
    [records, activeFilter],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return dslFiltered.filter((record) => {
      if (stageFilter && record.data.stage !== stageFilter) return false;
      if (!needle) return true;
      const haystack = [record.data.full_name, record.data.email, record.data.phone]
        .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
        .join(" ");
      return haystack.includes(needle);
    });
  }, [dslFiltered, search, stageFilter]);

  const editableFields: BulkActionField[] = useMemo(
    () =>
      fields
        .filter((field) => !field.isLocked)
        .map((field) => ({ key: field.key, name: field.name, type: field.type })),
    [fields],
  );

  const stageOptions = useMemo(
    () => stages.map((stage) => ({ value: stage, label: stage })),
    [stages],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function updatePersonStage(recordId: string, nextStage: string) {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/crm/people/${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: nextStage }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "No se pudo actualizar la etapa.");
    }
    // Soft refresh so the list reflects the latest state.
    // We rely on the router refresh to re-run the server component.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("crm-data-changed"));
    }
  }

  function renderCell(record: CrmRow, field: Field): React.ReactNode {
    const raw = record.data[field.key];
    if (field.key === "company_id" && typeof raw === "string") {
      const company = companyById.get(raw);
      return typeof company?.data.name === "string" ? company.data.name : <span style={mutedCellStyle}>—</span>;
    }
    if (field.key === "stage" && typeof raw === "string") {
      if (!canWrite) return <StageChip value={raw} />;
      return (
        <InlineStageSelect
          value={raw}
          options={PEOPLE_STAGE_OPTIONS}
          onSave={(next) => updatePersonStage(record.id, next)}
        />
      );
    }
    if (raw === null || raw === undefined || raw === "") {
      return <span style={mutedCellStyle}>—</span>;
    }
    return String(raw);
  }

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <div style={searchWrapperStyle}>
          <Search size={15} style={searchIconStyle} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nombre, email, teléfono…"
            style={inputStyle}
          />
        </div>
        <select
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value)}
          style={selectStyle}
        >
          <option value="">Todas las etapas</option>
          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        {objectId ? (
          <SmartViewsBar
            workspaceSlug={workspaceSlug}
            objectId={objectId}
            // Score is a derived lead-score value stored at `data.score` that the
            // server recomputes from the workspace scoring rubric. It is not a
            // declared `workspace_field`, so we inject it virtually here so smart
            // view filters can reference it like any numeric field.
            fields={[
              ...fields.map((f) => ({ key: f.key, name: f.name, type: f.type })),
              { key: "score", name: "Score", type: "number" },
            ]}
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
          href={
            selected.size > 0
              ? `/api/workspaces/${workspaceSlug}/crm/people/export?ids=${Array.from(selected).join(",")}`
              : `/api/workspaces/${workspaceSlug}/crm/people/export`
          }
          style={ghostButtonStyle}
        >
          <Download size={15} />
          Exportar CSV
        </a>
        <Link
          href={`/workspaces/${workspaceSlug}/crm/people/duplicates`}
          style={ghostButtonStyle}
        >
          Duplicados
        </Link>
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
                Nuevo contacto
              </>
            )}
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <QuickCreatePerson
          workspaceSlug={workspaceSlug}
          onDone={() => {
            setShowCreate(false);
            window.location.reload();
          }}
        />
      ) : null}

      {selected.size > 0 && canWrite ? (
        <BulkActionBar
          workspaceSlug={workspaceSlug}
          entity="people"
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

      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              {canWrite ? <th style={thCheckboxStyle} aria-label="select" /> : null}
              {columns.map((field) => (
                <th key={field.id} style={thStyle}>
                  {field.name}
                </th>
              ))}
              <th style={thStyle}>Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => {
              const rawScore = record.data.score;
              const score = typeof rawScore === "number" ? rawScore : null;
              return (
                <tr
                  key={record.id}
                  style={{ background: selected.has(record.id) ? "rgba(51, 92, 255, 0.04)" : "transparent" }}
                >
                  {canWrite ? (
                    <td style={tdCheckboxStyle}>
                      <input
                        type="checkbox"
                        checked={selected.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                        style={checkboxStyle}
                      />
                    </td>
                  ) : null}
                  {columns.map((field, idx) => (
                    <td key={field.id} style={tdStyle}>
                      {idx === 0 ? (
                        <Link
                          href={`/workspaces/${workspaceSlug}/crm/people/${record.id}`}
                          style={rowLinkStyle}
                        >
                          {renderCell(record, field) ?? "Sin nombre"}
                        </Link>
                      ) : (
                        renderCell(record, field)
                      )}
                    </td>
                  ))}
                  <td style={tdStyle}>
                    {score === null ? (
                      <span style={mutedCellStyle}>—</span>
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "var(--radius-pill)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: score >= 70 ? "#0f8f52" : score >= 40 ? "#b45309" : "#6b7280",
                          background:
                            score >= 70
                              ? "rgba(16, 185, 129, 0.14)"
                              : score >= 40
                                ? "rgba(245, 158, 11, 0.14)"
                                : "rgba(17, 24, 39, 0.06)",
                        }}
                      >
                        {score}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (canWrite ? 2 : 1)}
                  style={emptyRowStyle}
                >
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
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

function StageChip({ value }: { value: string }) {
  return <span style={chipStyle(chipTone(value))}>{value}</span>;
}

function QuickCreatePerson({
  workspaceSlug,
  onDone,
}: {
  workspaceSlug: string;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState("lead");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/crm/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          stage,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo crear el contacto.");
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
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        placeholder="Nombre completo"
        style={quickFormInputStyle}
      />
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        style={quickFormInputStyle}
      />
      <input
        type="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="Teléfono"
        style={quickFormInputStyle}
      />
      <select
        value={stage}
        onChange={(event) => setStage(event.target.value)}
        style={selectStyle}
      >
        <option value="lead">Lead</option>
        <option value="qualified">Calificado</option>
        <option value="opportunity">Oportunidad</option>
        <option value="customer">Cliente</option>
      </select>
      {error ? <p style={quickFormErrorStyle}>{error}</p> : null}
      <div style={quickFormActionsStyle}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            ...primaryButtonStyle,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Creando…" : "Crear"}
        </button>
      </div>
    </form>
  );
}
