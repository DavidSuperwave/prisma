"use client";

import { useEffect, useState, type CSSProperties } from "react";

export type ConnectionModalSubmit = {
  kind: "vault_integration" | "mcp_server";
} & (
  | {
      kind: "vault_integration";
      provider: "close" | "hubspot" | "custom_api";
      label: string;
      apiKey: string;
      baseUrl: string;
      notes: string;
    }
  | {
      kind: "mcp_server";
      label: string;
      url: string;
      bearer: string;
    }
);

type Props = {
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave: (payload: ConnectionModalSubmit) => Promise<void> | void;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 120,
};

const modalStyle: CSSProperties = {
  width: "min(520px, 94vw)",
  maxHeight: "88vh",
  overflow: "auto",
  background: "var(--workspace-panel)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "rgba(99,102,241,0.95)",
  color: "white",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};

export function AddConnectionModal({ open, canEdit, onClose, onSave }: Props) {
  const [kind, setKind] = useState<"vault_integration" | "mcp_server">("vault_integration");
  const [provider, setProvider] = useState<"close" | "hubspot" | "custom_api">("close");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [mcpLabel, setMcpLabel] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpBearer, setMcpBearer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind("vault_integration");
    setProvider("close");
    setLabel("");
    setApiKey("");
    setBaseUrl("");
    setNotes("");
    setMcpLabel("");
    setMcpUrl("");
    setMcpBearer("");
    setSaving(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={() => (saving ? null : onClose())}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--workspace-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Connections
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20, color: "var(--workspace-text)" }}>Anadir conexion</h3>
        </div>

        <label style={labelStyle}>
          Tipo
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value === "mcp_server" ? "mcp_server" : "vault_integration")
            }
            style={inputStyle}
            disabled={saving}
          >
            <option value="vault_integration">API del workspace (cifrada)</option>
            <option value="mcp_server">Servidor MCP</option>
          </select>
        </label>

        {kind === "vault_integration" ? (
          <>
            <label style={labelStyle}>
              Provider
              <select
                value={provider}
                onChange={(event) =>
                  setProvider(
                    event.target.value === "hubspot" || event.target.value === "custom_api"
                      ? event.target.value
                      : "close",
                  )
                }
                style={inputStyle}
                disabled={saving}
              >
                <option value="close">Close CRM</option>
                <option value="hubspot">HubSpot</option>
                <option value="custom_api">Custom API</option>
              </select>
            </label>

            <label style={labelStyle}>
              Nombre de la integracion
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Close production, HubSpot ventas..."
                style={inputStyle}
                disabled={saving}
              />
            </label>

            <label style={labelStyle}>
              API key / token
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk_live_..."
                style={inputStyle}
                disabled={saving}
              />
            </label>

            {provider === "custom_api" ? (
              <label style={labelStyle}>
                Base URL
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://api.vendor.com"
                  style={inputStyle}
                  disabled={saving}
                />
              </label>
            ) : null}

            <label style={labelStyle}>
              Notas (opcional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notas internas o URL de docs..."
                style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                disabled={saving}
              />
            </label>

            <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
              Se guardara como integracion cifrada del workspace, no dentro de `channelConfig`.
            </p>
          </>
        ) : (
          <>
            <label style={labelStyle}>
              Nombre del servidor MCP
              <input
                value={mcpLabel}
                onChange={(event) => setMcpLabel(event.target.value)}
                placeholder="Close MCP, Browser tools..."
                style={inputStyle}
                disabled={saving}
              />
            </label>

            <label style={labelStyle}>
              URL del servidor
              <input
                value={mcpUrl}
                onChange={(event) => setMcpUrl(event.target.value)}
                placeholder="https://mcp.example.com"
                style={inputStyle}
                disabled={saving}
              />
            </label>

            <label style={labelStyle}>
              Bearer token (opcional)
              <input
                type="password"
                value={mcpBearer}
                onChange={(event) => setMcpBearer(event.target.value)}
                placeholder="Bearer token"
                style={inputStyle}
                disabled={saving}
              />
            </label>
          </>
        )}

        {error ? <p style={{ margin: 0, fontSize: 12, color: "#b42318" }}>{error}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={secondaryButtonStyle} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, opacity: !canEdit || saving ? 0.7 : 1, cursor: !canEdit || saving ? "not-allowed" : "pointer" }}
            disabled={!canEdit || saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                if (kind === "vault_integration") {
                  const labelValue = label.trim();
                  const keyValue = apiKey.trim();
                  const baseUrlValue = baseUrl.trim();
                  if (!labelValue || !keyValue) {
                    setError("Nombre y API key son obligatorios.");
                    return;
                  }
                  if (provider === "custom_api" && !baseUrlValue) {
                    setError("Base URL es obligatoria para Custom API.");
                    return;
                  }
                  await onSave({
                    kind: "vault_integration",
                    provider,
                    label: labelValue,
                    apiKey: keyValue,
                    baseUrl: baseUrlValue,
                    notes: notes.trim(),
                  });
                } else {
                  const labelValue = mcpLabel.trim();
                  const urlValue = mcpUrl.trim();
                  if (!labelValue || !urlValue) {
                    setError("Nombre y URL son obligatorios para un servidor MCP.");
                    return;
                  }
                  await onSave({
                    kind: "mcp_server",
                    label: labelValue,
                    url: urlValue,
                    bearer: mcpBearer.trim(),
                  });
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo guardar la conexion.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
