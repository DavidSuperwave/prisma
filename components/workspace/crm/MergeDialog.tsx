"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { X } from "lucide-react";

type MergeRecord = {
  id: string;
  data: Record<string, unknown>;
  createdAt?: string;
};

type Props = {
  workspaceSlug: string;
  entity: "people" | "companies" | "deals";
  cluster: {
    key: string;
    keyType: string;
    records: MergeRecord[];
  };
  lockedFieldKeys: string[];
  onClose: () => void;
  onMerged: () => void;
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.45)",
  zIndex: 55,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const dialogStyle: CSSProperties = {
  width: "100%",
  maxWidth: 960,
  maxHeight: "90vh",
  background: "#ffffff",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 32px 64px rgba(17, 24, 39, 0.24)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid var(--workspace-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const footerStyle: CSSProperties = {
  padding: 14,
  borderTop: "1px solid var(--workspace-border)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const tableWrapperStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13,
};

const thStyle: CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  background: "#f3f4f6",
  borderBottom: "1px solid var(--workspace-border)",
};

const tdStyle: CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  verticalAlign: "top",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
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

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
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

export function MergeDialog({
  workspaceSlug,
  entity,
  cluster,
  lockedFieldKeys,
  onClose,
  onMerged,
}: Props) {
  const [primaryId, setPrimaryId] = useState<string>(cluster.records[0]?.id ?? "");
  const [fieldChoices, setFieldChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primary = cluster.records.find((r) => r.id === primaryId) ?? cluster.records[0];
  const secondaries = cluster.records.filter((r) => r.id !== primary?.id);

  const allKeys = useMemo(() => {
    const set = new Set<string>(lockedFieldKeys);
    for (const row of cluster.records) {
      for (const key of Object.keys(row.data ?? {})) {
        set.add(key);
      }
    }
    return Array.from(set);
  }, [cluster.records, lockedFieldKeys]);

  async function handleMerge() {
    if (!primary) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/crm/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          primaryRecordId: primary.id,
          secondaryRecordIds: secondaries.map((row) => row.id),
          fieldChoices,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo fusionar.");
        return;
      }
      onMerged();
      onClose();
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  function setChoice(fieldKey: string, choice: string) {
    setFieldChoices((prev) => ({ ...prev, [fieldKey]: choice }));
  }

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true">
      <div style={dialogStyle}>
        <header style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Fusionar duplicados</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
              {cluster.keyType}: {cluster.key} · {cluster.records.length} registros
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostButtonStyle, padding: "0 10px", height: 30 }}>
            <X size={14} />
          </button>
        </header>

        <div style={bodyStyle}>
          <div style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
            Selecciona el registro principal. Para cada campo marca quién gana. Actividades, tareas y notas se unen
            automáticamente en el principal.
          </div>
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Campo</th>
                  {cluster.records.map((row) => (
                    <th key={row.id} style={thStyle}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="radio"
                          checked={primary?.id === row.id}
                          onChange={() => setPrimaryId(row.id)}
                          style={{ accentColor: "var(--workspace-accent)" }}
                        />
                        {typeof row.data.full_name === "string"
                          ? row.data.full_name
                          : typeof row.data.name === "string"
                            ? row.data.name
                            : typeof row.data.title === "string"
                              ? row.data.title
                              : row.id.slice(0, 8)}
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allKeys.map((key) => (
                  <tr key={key}>
                    <td style={tdStyle}>
                      <strong style={{ fontSize: 12 }}>{key}</strong>
                    </td>
                    {cluster.records.map((row) => {
                      const raw = row.data?.[key];
                      const isPrimary = primary?.id === row.id;
                      const choiceKey = isPrimary ? "primary" : `secondary-${row.id}`;
                      const selected = fieldChoices[key] === choiceKey || (!fieldChoices[key] && isPrimary);
                      const display =
                        raw === null || raw === undefined || raw === ""
                          ? "—"
                          : typeof raw === "string"
                            ? raw
                            : JSON.stringify(raw);
                      return (
                        <td key={row.id} style={tdStyle}>
                          <label style={{ display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`field-${key}`}
                              checked={selected}
                              onChange={() => setChoice(key, choiceKey)}
                              style={{ accentColor: "var(--workspace-accent)", marginTop: 3 }}
                            />
                            <span style={{ fontSize: 12, wordBreak: "break-word" }}>{display}</span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-danger)" }}>{error}</p>
          ) : null}
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={onClose} style={ghostButtonStyle}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={busy || !primary}
            style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Fusionando…" : "Fusionar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
