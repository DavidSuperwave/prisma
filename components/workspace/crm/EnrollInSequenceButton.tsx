"use client";

import { useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";

type SequenceOption = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  recordId: string;
  sequences: SequenceOption[];
  canManage: boolean;
};

const wrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  background: "#ffffff",
};

const select: CSSProperties = {
  height: 34,
  padding: "6px 10px",
  fontSize: 13,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

export function EnrollInSequenceButton({ workspaceSlug, recordId, sequences, canManage }: Props) {
  const [sequenceId, setSequenceId] = useState<string>(sequences[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!canManage || sequences.length === 0) return null;

  async function enroll() {
    if (!sequenceId) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/sequences/${sequenceId}/enrollments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId }),
        },
      );
      const json = (await response.json().catch(() => ({}))) as { enrollmentId?: string; error?: string };
      if (!response.ok || !json.enrollmentId) {
        setError(json.error ?? "No se pudo inscribir.");
        return;
      }
      setStatus("Inscrito");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <strong style={{ fontSize: 13 }}>Inscribir en secuencia</strong>
      <div style={{ display: "flex", gap: 6 }}>
        <select value={sequenceId} onChange={(event) => setSequenceId(event.target.value)} style={{ ...select, flex: 1 }}>
          {sequences.map((seq) => (
            <option key={seq.id} value={seq.id}>
              {seq.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={enroll} disabled={submitting} style={primaryBtn}>
          <Plus size={14} />
          Inscribir
        </button>
      </div>
      {error ? <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{error}</p> : null}
      {status ? <p style={{ color: "#047857", fontSize: 12, margin: 0 }}>{status}</p> : null}
    </div>
  );
}
