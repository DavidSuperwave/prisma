"use client";

import { useState, type CSSProperties } from "react";
import { LoaderCircle, Plus, Sparkles } from "lucide-react";

type Props = {
  workspaceSlug: string;
  showDemoSeed?: boolean;
};

const wrapperStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const buttonBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 18px",
  background: "var(--workspace-accent)",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(51, 92, 255, 0.2)",
  transition: "transform 140ms ease, opacity 140ms ease, background-color 140ms ease",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#b91c1c",
  textAlign: "center",
};

const spinnerStyle: CSSProperties = {
  animation: "crm-spin 900ms linear infinite",
};

export function BootstrapCrmButton({ workspaceSlug, showDemoSeed = true }: Props) {
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/crm/bootstrap`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Bootstrap failed (${response.status}).`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo inicializar el CRM.");
      setLoading(false);
    }
  }

  async function handleDemoSeed() {
    setDemoLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/crm/bootstrap`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Bootstrap failed (${response.status}).`);
      }
      const seedResponse = await fetch(`/api/workspaces/${workspaceSlug}/crm/demo-seed`, {
        method: "POST",
      });
      if (!seedResponse.ok) {
        const body = (await seedResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Demo seed failed.");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos demo.");
      setDemoLoading(false);
    }
  }

  return (
    <div style={wrapperStyle}>
      <style>{`@keyframes crm-spin { to { transform: rotate(360deg); } }`}</style>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || demoLoading}
        style={{
          ...buttonBaseStyle,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? (
          <LoaderCircle size={16} style={spinnerStyle} />
        ) : (
          <Plus size={16} strokeWidth={2.2} />
        )}
        <span>{loading ? "Inicializando…" : "Inicializar CRM ahora"}</span>
      </button>
      {showDemoSeed ? (
        <button
          type="button"
          onClick={handleDemoSeed}
          disabled={loading || demoLoading}
          style={{
            ...buttonBaseStyle,
            background: "transparent",
            color: "var(--workspace-text)",
            border: "1px solid var(--workspace-border-strong)",
            boxShadow: "none",
            opacity: demoLoading ? 0.7 : 1,
            cursor: demoLoading ? "wait" : "pointer",
          }}
        >
          {demoLoading ? (
            <LoaderCircle size={16} style={spinnerStyle} />
          ) : (
            <Sparkles size={16} strokeWidth={2.2} />
          )}
          <span>{demoLoading ? "Cargando datos…" : "Inicializar con datos de muestra"}</span>
        </button>
      ) : null}
      {error ? <p style={errorStyle}>{error}</p> : null}
    </div>
  );
}
