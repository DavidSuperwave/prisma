"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { AddConnectionModal, type ConnectionModalSubmit } from "@/components/workspace/agents/AddConnectionModal";

type ConnectionRow = {
  name: string;
  apiKey: string | null;
  notes: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
};

type Props = {
  workspaceSlug: string;
  canEdit: boolean;
  isSaving: boolean;
  channelConfig: Record<string, unknown>;
  mcpServerSlugs: string[];
  onSaveChannelConfig: (nextChannelConfig: Record<string, unknown>) => Promise<void> | void;
  onSaveMcpServerSlugs: (nextMcpServerSlugs: string[]) => Promise<void> | void;
};

type WorkspaceConnectionRow = {
  id: string;
  slug: string;
  label: string;
  provider: string;
  authType: string;
  status: "active" | "paused" | "error";
  mode: "http_poll" | "webhook_inbound" | "mcp_server" | "manual";
  baseUrl: string | null;
  webhookPath: string | null;
  hasSecrets: boolean;
  config: Record<string, unknown>;
};

type WorkspaceIntegrationRow = {
  id: string;
  slug: string;
  label: string;
  provider: string;
  authType: string;
  status: "active" | "paused" | "error";
  hasSecrets: boolean;
  config: Record<string, unknown>;
};

type TestResult = {
  ok: boolean;
  status: number;
  preview: string | null;
  error?: string | null;
};

const actionButtonStyle: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};

const addButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  border: "none",
  background: "rgba(99,102,241,0.95)",
  color: "white",
  fontWeight: 600,
};

function maskSecret(value: string | null) {
  if (!value) return "sin key";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

function formatTimestamp(value: string, hydrated: boolean) {
  if (!hydrated) {
    return value.replace("T", " ").replace("Z", " UTC");
  }
  return new Date(value).toLocaleString();
}

function extractRows(config: Record<string, unknown>): ConnectionRow[] {
  const apiCredentialRows =
    config.apiCredentials &&
    typeof config.apiCredentials === "object" &&
    !Array.isArray(config.apiCredentials)
      ? Object.entries(config.apiCredentials as Record<string, unknown>).map(([name, value]) => ({
          name,
          apiKey: typeof value === "string" ? value : null,
          notes: null,
          updatedAt: null,
          raw: { value },
        }))
      : [];
  return [...apiCredentialRows, ...Object.entries(config)
    .map(([name, value]) => {
      if (name === "apiCredentials") return null;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
          name,
          apiKey: null,
          notes: null,
          updatedAt: null,
          raw: {},
        };
      }
      const record = value as Record<string, unknown>;
      const apiKey =
        typeof record.api_key === "string"
          ? record.api_key
          : typeof record.apiKey === "string"
            ? record.apiKey
            : typeof record.token === "string"
              ? record.token
              : typeof record.key === "string"
                ? record.key
                : null;
      const notes = typeof record.notes === "string" ? record.notes : null;
      const updatedAt =
        typeof record.updated_at === "string"
          ? record.updated_at
          : typeof record.added_at === "string"
            ? record.added_at
            : null;
      return {
        name,
        apiKey,
        notes,
        updatedAt,
        raw: record,
      };
    })
    .filter((entry): entry is ConnectionRow => Boolean(entry))]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ConnectionsSection({
  workspaceSlug,
  canEdit,
  isSaving,
  channelConfig,
  mcpServerSlugs,
  onSaveChannelConfig,
  onSaveMcpServerSlugs,
}: Props) {
  const [openModal, setOpenModal] = useState(false);
  const [connections, setConnections] = useState<WorkspaceConnectionRow[]>([]);
  const [integrations, setIntegrations] = useState<WorkspaceIntegrationRow[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [busyConnectionId, setBusyConnectionId] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const rows = useMemo(() => extractRows(channelConfig), [channelConfig]);
  const mcpConnections = useMemo(
    () => connections.filter((row) => row.mode === "mcp_server" || row.authType === "mcp"),
    [connections],
  );
  const allMcpSlugs = useMemo(() => mcpConnections.map((row) => row.slug), [mcpConnections]);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    setConnectionsError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/connections`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        connections?: WorkspaceConnectionRow[];
      };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar las conexiones.");
      }
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } catch (error) {
      setConnectionsError(error instanceof Error ? error.message : "No se pudieron cargar las conexiones.");
    } finally {
      setLoadingConnections(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const loadIntegrations = useCallback(async () => {
    setLoadingIntegrations(true);
    setIntegrationsError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/integrations`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        integrations?: WorkspaceIntegrationRow[];
      };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar las integraciones.");
      }
      setIntegrations(Array.isArray(data.integrations) ? data.integrations : []);
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : "No se pudieron cargar las integraciones.");
    } finally {
      setLoadingIntegrations(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  const buildNextMcpServerSlugs = useCallback(
    (slug: string, enabled: boolean) => {
      const base =
        mcpServerSlugs.length === 0
          ? [...allMcpSlugs]
          : mcpServerSlugs.filter((entry: string, index: number, source: string[]) => source.indexOf(entry) === index);
      if (enabled) {
        return base.includes(slug) ? base : [...base, slug];
      }
      return base.filter((entry: string) => entry !== slug);
    },
    [allMcpSlugs, mcpServerSlugs],
  );

  const isMcpEnabledForAgent = useCallback(
    (slug: string) => {
      if (mcpServerSlugs.length === 0) {
        return allMcpSlugs.includes(slug);
      }
      return mcpServerSlugs.includes(slug);
    },
    [allMcpSlugs, mcpServerSlugs],
  );

  const deleteConnection = async (name: string) => {
    const next = { ...channelConfig };
    if (
      next.apiCredentials &&
      typeof next.apiCredentials === "object" &&
      !Array.isArray(next.apiCredentials)
    ) {
      const credentials = { ...(next.apiCredentials as Record<string, unknown>) };
      delete credentials[name];
      next.apiCredentials = credentials;
    }
    delete next[name];
    await onSaveChannelConfig(next);
  };

  const addConnection = async (payload: ConnectionModalSubmit) => {
    if (payload.kind === "vault_integration") {
      const config =
        payload.provider === "custom_api"
          ? {
              baseUrl: payload.baseUrl,
              authHeader: "Authorization",
              authScheme: "Bearer",
              ...(payload.notes ? { notes: payload.notes } : {}),
            }
          : payload.notes
            ? { notes: payload.notes }
            : {};
      const response = await fetch(`/api/workspaces/${workspaceSlug}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: payload.provider,
          label: payload.label,
          config,
          secrets: {
            apiKey: payload.apiKey,
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        integration?: WorkspaceIntegrationRow;
      };
      if (!response.ok || !data.integration) {
        throw new Error(data.error ?? "No se pudo guardar la integracion cifrada.");
      }
      await loadIntegrations();
      setOpenModal(false);
      return;
    }
    const response = await fetch(`/api/workspaces/${workspaceSlug}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: payload.label,
        provider: "mcp",
        authType: payload.bearer ? "mcp" : "none",
        mode: "mcp_server",
        baseUrl: payload.url,
        config: {
          url: payload.url,
        },
        secrets: payload.bearer ? { bearer: payload.bearer } : {},
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      connection?: WorkspaceConnectionRow;
    };
    if (!response.ok || !data.connection) {
      throw new Error(data.error ?? "No se pudo guardar el servidor MCP.");
    }
    await loadConnections();
    if (mcpServerSlugs.length > 0) {
      await onSaveMcpServerSlugs(buildNextMcpServerSlugs(data.connection.slug, true));
    }
    setOpenModal(false);
  };

  const deleteIntegration = async (integration: WorkspaceIntegrationRow) => {
    setBusyConnectionId(integration.id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/integrations/${integration.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo eliminar la integracion.");
      }
      await loadIntegrations();
    } finally {
      setBusyConnectionId(null);
    }
  };

  const testIntegration = async (integration: WorkspaceIntegrationRow) => {
    setBusyConnectionId(integration.id);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/integrations/${integration.id}/test`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: number;
        preview?: string | null;
        error?: string | null;
      };
      setTestResults((prev) => ({
        ...prev,
        [integration.id]: {
          ok: Boolean(data.ok),
          status: Number(data.status ?? 0),
          preview: data.preview ?? null,
          error: data.error ?? null,
        },
      }));
    } finally {
      setBusyConnectionId(null);
    }
  };

  const deleteWorkspaceConnection = async (connection: WorkspaceConnectionRow) => {
    setBusyConnectionId(connection.id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/connections/${connection.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo eliminar la conexion.");
      }
      if (connection.mode === "mcp_server" && mcpServerSlugs.length > 0 && mcpServerSlugs.includes(connection.slug)) {
        await onSaveMcpServerSlugs(mcpServerSlugs.filter((entry: string) => entry !== connection.slug));
      }
      await loadConnections();
    } finally {
      setBusyConnectionId(null);
    }
  };

  const testWorkspaceConnection = async (connection: WorkspaceConnectionRow) => {
    setBusyConnectionId(connection.id);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/connections/${connection.id}/test`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: number;
        preview?: string | null;
        error?: string | null;
      };
      setTestResults((prev) => ({
        ...prev,
        [connection.id]: {
          ok: Boolean(data.ok),
          status: Number(data.status ?? 0),
          preview: data.preview ?? null,
          error: data.error ?? null,
        },
      }));
    } finally {
      setBusyConnectionId(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
          Conexiones ({rows.length + connections.length + integrations.length})
        </p>
        <button
          type="button"
          style={{ ...addButtonStyle, opacity: !canEdit || isSaving ? 0.7 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
          disabled={!canEdit || isSaving}
          onClick={() => setOpenModal(true)}
        >
          + Anadir conexion
        </button>
      </div>

      {connectionsError ? (
        <p style={{ margin: 0, fontSize: 12, color: "#b42318" }}>{connectionsError}</p>
      ) : null}
      {integrationsError ? (
        <p style={{ margin: 0, fontSize: 12, color: "#b42318" }}>{integrationsError}</p>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--workspace-text)" }}>
          Integraciones cifradas del workspace
        </p>
        {loadingIntegrations ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>Cargando integraciones...</p>
        ) : integrations.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
            No hay integraciones cifradas. Usa la opcion API del workspace (cifrada) para guardar vendors como Close o HubSpot.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {integrations.map((integration) => {
              const test = testResults[integration.id];
              const isBusy = busyConnectionId === integration.id || isSaving;
              const baseUrl =
                typeof integration.config.baseUrl === "string" ? integration.config.baseUrl : null;
              return (
                <div
                  key={integration.id}
                  style={{
                    border: "1px solid var(--workspace-border)",
                    borderRadius: 12,
                    background: "white",
                    padding: "10px 12px",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--workspace-text)" }}>
                        {integration.label}
                      </p>
                      <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                        {integration.provider} · slug `{integration.slug}` · secrets {integration.hasSecrets ? "guardados" : "faltantes"}
                      </p>
                      {baseUrl ? (
                        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--workspace-muted)" }}>
                          {baseUrl}
                        </p>
                      ) : null}
                      {test ? (
                        <p style={{ margin: "5px 0 0", fontSize: 11.5, color: test.ok ? "#0f8a52" : "#b42318" }}>
                          Test {test.ok ? "OK" : "FAIL"} ({test.status}){test.error ? ` - ${test.error}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        style={{ ...actionButtonStyle, padding: "5px 9px", opacity: isBusy ? 0.6 : 1, cursor: isBusy ? "not-allowed" : "pointer" }}
                        disabled={isBusy}
                        onClick={() => void testIntegration(integration)}
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        style={{ ...actionButtonStyle, padding: "5px 9px", opacity: !canEdit || isBusy ? 0.6 : 1, cursor: !canEdit || isBusy ? "not-allowed" : "pointer" }}
                        disabled={!canEdit || isBusy}
                        onClick={() => void deleteIntegration(integration)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--workspace-text)" }}>
          Workspace connections
        </p>
        {loadingConnections ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>Cargando conexiones...</p>
        ) : connections.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
            No hay conexiones compartidas en este workspace.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {connections.map((connection) => {
              const test = testResults[connection.id];
              const isBusy = busyConnectionId === connection.id || isSaving;
              const isMcp = connection.mode === "mcp_server" || connection.authType === "mcp";
              const mcpEnabled = isMcpEnabledForAgent(connection.slug);
              return (
                <div
                  key={connection.id}
                  style={{
                    border: "1px solid var(--workspace-border)",
                    borderRadius: 12,
                    background: "white",
                    padding: "10px 12px",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--workspace-text)" }}>
                        {connection.label}
                      </p>
                      <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                        {connection.mode} · {connection.provider} · slug `{connection.slug}`
                      </p>
                      {connection.baseUrl ? (
                        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--workspace-muted)" }}>
                          {connection.baseUrl}
                        </p>
                      ) : null}
                      {connection.webhookPath ? (
                        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--workspace-muted)" }}>
                          webhook: /api/workspaces/{workspaceSlug}/webhooks/{connection.webhookPath}
                        </p>
                      ) : null}
                      {test ? (
                        <p style={{ margin: "5px 0 0", fontSize: 11.5, color: test.ok ? "#0f8a52" : "#b42318" }}>
                          Test {test.ok ? "OK" : "FAIL"} ({test.status}){test.error ? ` - ${test.error}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        style={{ ...actionButtonStyle, padding: "5px 9px", opacity: isBusy ? 0.6 : 1, cursor: isBusy ? "not-allowed" : "pointer" }}
                        disabled={isBusy}
                        onClick={() => void testWorkspaceConnection(connection)}
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        style={{ ...actionButtonStyle, padding: "5px 9px", opacity: !canEdit || isBusy ? 0.6 : 1, cursor: !canEdit || isBusy ? "not-allowed" : "pointer" }}
                        disabled={!canEdit || isBusy}
                        onClick={() => void deleteWorkspaceConnection(connection)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {isMcp ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--workspace-text)" }}>
                      <input
                        type="checkbox"
                        checked={mcpEnabled}
                        disabled={!canEdit || isSaving}
                        onChange={(event) =>
                          void onSaveMcpServerSlugs(buildNextMcpServerSlugs(connection.slug, event.target.checked))
                        }
                      />
                      Exponer este MCP al agente
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mcpConnections.length > 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--workspace-muted)" }}>
          Si este agente no tiene una lista explicita, hereda todos los MCP activos del workspace.
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--workspace-text)" }}>
          Credenciales legacy del agente
        </p>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--workspace-muted)" }}>
          Estas viven en `channelConfig` y ya no son la ruta recomendada. Conserva solo lo necesario y migra nuevas API keys a integraciones cifradas del workspace.
        </p>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)" }}>
          No hay credenciales legacy configuradas para este agente.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => (
            <div
              key={row.name}
              style={{
                border: "1px solid var(--workspace-border)",
                borderRadius: 12,
                background: "white",
                padding: "10px 12px",
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--workspace-text)" }}>{row.name}</p>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                  {maskSecret(row.apiKey)}
                </p>
                {row.updatedAt ? (
                  <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--workspace-muted)" }}>
                    Updated {formatTimestamp(row.updatedAt, hydrated)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                style={{ ...actionButtonStyle, padding: "5px 9px", opacity: !canEdit || isSaving ? 0.6 : 1, cursor: !canEdit || isSaving ? "not-allowed" : "pointer" }}
                disabled={!canEdit || isSaving}
                onClick={() => void deleteConnection(row.name)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
      </div>

      <a
        href={`/workspaces/${workspaceSlug}/settings/integrations`}
        style={{ fontSize: 12.5, color: "#4338ca", textDecoration: "none" }}
      >
        Abrir integraciones
      </a>

      <AddConnectionModal
        open={openModal}
        canEdit={canEdit}
        onClose={() => (isSaving ? null : setOpenModal(false))}
        onSave={addConnection}
      />
    </div>
  );
}
