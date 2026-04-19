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

type Field = { id: string; key: string; name: string; type: string; isLocked: boolean };
type CrmRow = { id: string; data: Record<string, unknown> };

type Props = {
  workspaceSlug: string;
  records: CrmRow[];
  fields: Field[];
  canWrite: boolean;
  peopleRecords?: CrmRow[];
  dealRecords?: CrmRow[];
  objectId?: string;
  savedViews?: SavedSmartView[];
  initialViewId?: string | null;
  canCreateOrgView?: boolean;
  canManageFields?: boolean;
  sequencesAvailable?: boolean;
};

const DEFAULT_COLUMNS = ["name", "domain", "industry", "size", "owner_user_id"];

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
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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

const quickFormActionsStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
};

export function CompaniesView({
  workspaceSlug,
  records,
  fields,
  canWrite,
  peopleRecords = [],
  dealRecords = [],
  objectId,
  savedViews: initialSavedViews,
  initialViewId,
  canCreateOrgView = false,
  canManageFields = false,
  sequencesAvailable = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
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

  const activeView = useMemo(
    () => (activeViewId ? savedViews.find((v) => v.id === activeViewId) ?? null : null),
    [activeViewId, savedViews],
  );
  const { columns: visibleColumnKeys, setColumns: setVisibleColumnKeys, reset: resetColumnConfig } =
    useColumnConfig({
      storageKey: `crm:companies:${workspaceSlug}`,
      defaultColumns: DEFAULT_COLUMNS.filter((key) => fields.some((f) => f.key === key)),
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

  const dslFiltered = useMemo(
    () => (activeFilter ? filterRecords(records, activeFilter) : records),
    [records, activeFilter],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return dslFiltered;
    return dslFiltered.filter((record) => {
      const haystack = [record.data.name, record.data.domain]
        .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
        .join(" ");
      return haystack.includes(needle);
    });
  }, [dslFiltered, search]);

  const editableFields: BulkActionField[] = useMemo(
    () =>
      fields
        .filter((field) => !field.isLocked)
        .map((field) => ({ key: field.key, name: field.name, type: field.type })),
    [fields],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const peopleCountByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const person of peopleRecords) {
      const companyId = typeof person.data.company_id === "string" ? person.data.company_id : null;
      if (companyId) map.set(companyId, (map.get(companyId) ?? 0) + 1);
    }
    return map;
  }, [peopleRecords]);

  const dealCountByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const deal of dealRecords) {
      const companyId = typeof deal.data.company_id === "string" ? deal.data.company_id : null;
      if (companyId) map.set(companyId, (map.get(companyId) ?? 0) + 1);
    }
    return map;
  }, [dealRecords]);

  const showRelationsColumn = peopleRecords.length > 0 || dealRecords.length > 0;

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <div style={searchWrapperStyle}>
          <Search size={15} style={searchIconStyle} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nombre o dominio…"
            style={inputStyle}
          />
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
          href={`/api/workspaces/${workspaceSlug}/crm/companies/export`}
          style={ghostButtonStyle}
        >
          <Download size={15} />
          Exportar CSV
        </a>
        <Link
          href={`/workspaces/${workspaceSlug}/crm/companies/duplicates`}
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
                Nueva empresa
              </>
            )}
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <QuickCreateCompany
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
          entity="companies"
          selectedIds={Array.from(selected)}
          editableFields={editableFields}
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
              {canWrite ? <th style={{ ...thStyle, width: 36 }} aria-label="select" /> : null}
              {columns.map((field) => (
                <th key={field.id} style={thStyle}>
                  {field.name}
                </th>
              ))}
              {showRelationsColumn ? <th style={thStyle}>Relacionados</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => {
              const peopleCount = peopleCountByCompany.get(record.id) ?? 0;
              const dealCount = dealCountByCompany.get(record.id) ?? 0;
              return (
                <tr
                  key={record.id}
                  style={{ background: selected.has(record.id) ? "rgba(51, 92, 255, 0.04)" : "transparent" }}
                >
                  {canWrite ? (
                    <td style={{ ...tdStyle, width: 36, padding: "12px 8px 12px 16px" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                        style={{ width: 16, height: 16, accentColor: "var(--workspace-accent)", cursor: "pointer" }}
                      />
                    </td>
                  ) : null}
                  {columns.map((field, idx) => {
                    const raw = record.data[field.key];
                    const hasValue = !(raw === null || raw === undefined || raw === "");
                    const display = hasValue ? String(raw) : "—";
                    return (
                      <td key={field.id} style={tdStyle}>
                        {idx === 0 ? (
                          <Link
                            href={`/workspaces/${workspaceSlug}/crm/companies/${record.id}`}
                            style={rowLinkStyle}
                          >
                            {display}
                          </Link>
                        ) : hasValue ? (
                          display
                        ) : (
                          <span style={mutedCellStyle}>—</span>
                        )}
                      </td>
                    );
                  })}
                  {showRelationsColumn ? (
                    <td style={{ ...tdStyle, color: "var(--workspace-muted)", fontSize: 13 }}>
                      {peopleCount} personas · {dealCount} oportunidades
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showRelationsColumn ? 1 : 0) + (canWrite ? 1 : 0)}
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

function QuickCreateCompany({
  workspaceSlug,
  onDone,
}: {
  workspaceSlug: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/crm/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          domain: domain.trim() || undefined,
          industry: industry.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo crear la empresa.");
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
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nombre (requerido)"
        style={plainInputStyle}
      />
      <input
        type="text"
        value={domain}
        onChange={(event) => setDomain(event.target.value)}
        placeholder="Dominio (ej. acme.com)"
        style={plainInputStyle}
      />
      <input
        type="text"
        value={industry}
        onChange={(event) => setIndustry(event.target.value)}
        placeholder="Industria"
        style={plainInputStyle}
      />
      <div style={quickFormActionsStyle}>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          style={{
            ...primaryButtonStyle,
            opacity: submitting || !name.trim() ? 0.5 : 1,
            cursor: submitting ? "wait" : !name.trim() ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Creando…" : "Crear"}
        </button>
      </div>
      {error ? <p style={quickFormErrorStyle}>{error}</p> : null}
    </form>
  );
}
