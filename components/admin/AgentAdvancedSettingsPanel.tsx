"use client";

import { useEffect, useMemo, useState } from "react";

type AgentAdvancedSettingsPanelProps = {
  workspaceSlug: string;
  agentId: string;
};

type AgentPayload = {
  id: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  legacyRole?: string | null;
  status: "active" | "paused" | "deploying" | "error";
  description: string | null;
  tools: string[];
  read: string[];
  write: string[];
  channels: string[];
  cronJobs: unknown[];
  soulMd?: string | null;
  apiEndpoint?: string;
  containerName?: string;
  channelConfig?: Record<string, unknown>;
  runtimeDiagnostics?: {
    hasEndpoint?: boolean;
    hasApiKey?: boolean;
    runtimeReachable?: boolean;
    runtimeState?: string;
    message?: string;
  } | null;
};

function parseCsvList(input: string) {
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function roleFromType(type: AgentPayload["type"]) {
  if (type === "copilot") return "intake_assistant";
  if (type === "channel") return "lead_qualifier";
  return "crm_updater";
}

export default function AgentAdvancedSettingsPanel({
  workspaceSlug,
  agentId,
}: AgentAdvancedSettingsPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDeployment, setIsSavingDeployment] = useState(false);
  const [isSavingRaw, setIsSavingRaw] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [agent, setAgent] = useState<AgentPayload | null>(null);

  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [containerName, setContainerName] = useState("");
  const [role, setRole] = useState("custom");
  const [soulMd, setSoulMd] = useState("");
  const [skillsCsv, setSkillsCsv] = useState("");
  const [readCsv, setReadCsv] = useState("");
  const [writeCsv, setWriteCsv] = useState("");
  const [channelsCsv, setChannelsCsv] = useState("");
  const [cronJobsJson, setCronJobsJson] = useState("[]");
  const [channelConfigJson, setChannelConfigJson] = useState("{}");
  const [isActive, setIsActive] = useState(true);

  const runtimeMessage = useMemo(
    () => agent?.runtimeDiagnostics?.message ?? "Sin diagnóstico.",
    [agent?.runtimeDiagnostics?.message],
  );

  useEffect(() => {
    async function loadAgent() {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/agents/${agentId}?channelStatus=true`,
        );
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          agent?: AgentPayload;
        };
        if (!response.ok || !payload.agent) {
          throw new Error(payload.error ?? "No se pudo cargar el agente.");
        }
        const loaded = payload.agent;
        setAgent(loaded);
        setApiEndpoint(loaded.apiEndpoint ?? "");
        setContainerName(loaded.containerName ?? "");
        setRole(loaded.legacyRole ?? roleFromType(loaded.type));
        setSoulMd(loaded.soulMd ?? "");
        setSkillsCsv((loaded.tools ?? []).join(", "));
        setReadCsv((loaded.read ?? []).join(", "));
        setWriteCsv((loaded.write ?? []).join(", "));
        setChannelsCsv((loaded.channels ?? []).join(", "));
        setCronJobsJson(formatJson(loaded.cronJobs ?? []));
        setChannelConfigJson(formatJson(loaded.channelConfig ?? {}));
        setIsActive(loaded.status !== "paused");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se pudo cargar el agente.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadAgent();
  }, [agentId, workspaceSlug]);

  async function saveDeployment() {
    if (!agent) return;
    if (!apiEndpoint.trim()) {
      setError("El endpoint del agente es obligatorio.");
      return;
    }
    if (!containerName.trim()) {
      setError("El nombre del contenedor es obligatorio.");
      return;
    }

    setIsSavingDeployment(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiEndpoint: apiEndpoint.trim(),
          containerName: containerName.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: AgentPayload;
      };
      if (!response.ok || !payload.agent) {
        throw new Error(payload.error ?? "No se pudo guardar el despliegue.");
      }

      setAgent(payload.agent);
      setApiEndpoint(payload.agent.apiEndpoint ?? apiEndpoint);
      setContainerName(payload.agent.containerName ?? containerName);
      setApiKey("");
      setSuccess("Configuración de despliegue guardada.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar el despliegue.",
      );
    } finally {
      setIsSavingDeployment(false);
    }
  }

  async function saveRawSettings() {
    if (!agent) return;

    setIsSavingRaw(true);
    setError("");
    setSuccess("");
    try {
      const cronJobs = JSON.parse(cronJobsJson);
      if (!Array.isArray(cronJobs)) {
        throw new Error("cronJobs debe ser un arreglo JSON.");
      }
      const channelConfig = JSON.parse(channelConfigJson);
      if (!channelConfig || typeof channelConfig !== "object" || Array.isArray(channelConfig)) {
        throw new Error("channelConfig debe ser un objeto JSON.");
      }

      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          soulMd,
          skills: parseCsvList(skillsCsv),
          knowledgeScope: {
            read: parseCsvList(readCsv),
            write: parseCsvList(writeCsv),
            channels: parseCsvList(channelsCsv),
          },
          cronJobs,
          channelConfig,
          isActive,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: AgentPayload;
      };
      if (!response.ok || !payload.agent) {
        throw new Error(payload.error ?? "No se pudo guardar la configuración avanzada.");
      }
      setAgent(payload.agent);
      setRole(payload.agent.legacyRole ?? roleFromType(payload.agent.type));
      setSuccess("Configuración avanzada guardada.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la configuración avanzada.",
      );
    } finally {
      setIsSavingRaw(false);
    }
  }

  async function checkHealth() {
    if (!agent) return;
    setIsCheckingHealth(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${agent.id}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo verificar el runtime.");
      }
      setSuccess("Verificación ejecutada. Recarga para ver telemetría actualizada.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo verificar el runtime.",
      );
    } finally {
      setIsCheckingHealth(false);
    }
  }

  if (isLoading) {
    return <p style={copyStyle}>Cargando configuración avanzada...</p>;
  }

  if (!agent) {
    return <p style={errorStyle}>No se encontró el agente solicitado.</p>;
  }

  return (
    <div style={stackStyle}>
      <section style={panelStyle}>
        <h2 style={titleStyle}>Despliegue y runtime</h2>
        <p style={copyStyle}>Administra endpoint, llave y contenedor desde este panel.</p>
        <label style={fieldStyle}>
          Endpoint del agente
          <input
            value={apiEndpoint}
            onChange={(event) => setApiEndpoint(event.target.value)}
            style={inputStyle}
            placeholder="https://hermes.example.com/copilot"
          />
        </label>
        <label style={fieldStyle}>
          API key (opcional para reemplazar)
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            style={inputStyle}
            placeholder="Deja vacío para conservar la actual"
          />
        </label>
        <label style={fieldStyle}>
          Nombre de contenedor
          <input
            value={containerName}
            onChange={(event) => setContainerName(event.target.value)}
            style={inputStyle}
            placeholder={`hermes-${workspaceSlug}-copilot`}
          />
        </label>
        <p style={metaStyle}>Estado runtime: {runtimeMessage}</p>
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={() => void saveDeployment()}
            style={primaryButtonStyle}
            disabled={isSavingDeployment}
          >
            {isSavingDeployment ? "Guardando..." : "Guardar despliegue"}
          </button>
          <button
            type="button"
            onClick={() => void checkHealth()}
            style={secondaryButtonStyle}
            disabled={isCheckingHealth}
          >
            {isCheckingHealth ? "Verificando..." : "Verificar runtime"}
          </button>
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={titleStyle}>Configuración avanzada</h2>
        <p style={copyStyle}>Este panel concentra rol semántico, alcances, cron y JSON raw.</p>
        <label style={fieldStyle}>
          Rol semántico
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            style={inputStyle}
          >
            <option value="intake_assistant">intake_assistant</option>
            <option value="lead_qualifier">lead_qualifier</option>
            <option value="crm_updater">crm_updater</option>
            <option value="follow_up">follow_up</option>
            <option value="ops_assistant">ops_assistant</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label style={fieldStyle}>
          SOUL.md
          <textarea
            value={soulMd}
            onChange={(event) => setSoulMd(event.target.value)}
            rows={6}
            style={textAreaStyle}
          />
        </label>
        <label style={fieldStyle}>
          Skills (CSV)
          <input
            value={skillsCsv}
            onChange={(event) => setSkillsCsv(event.target.value)}
            style={inputStyle}
            placeholder="task orchestration, prisma records"
          />
        </label>
        <label style={fieldStyle}>
          Lectura (CSV)
          <input
            value={readCsv}
            onChange={(event) => setReadCsv(event.target.value)}
            style={inputStyle}
            placeholder="contacts, deals"
          />
        </label>
        <label style={fieldStyle}>
          Escritura (CSV)
          <input
            value={writeCsv}
            onChange={(event) => setWriteCsv(event.target.value)}
            style={inputStyle}
            placeholder="tasks, notes"
          />
        </label>
        <label style={fieldStyle}>
          Canales (CSV)
          <input
            value={channelsCsv}
            onChange={(event) => setChannelsCsv(event.target.value)}
            style={inputStyle}
            placeholder="whatsapp, email"
          />
        </label>
        <label style={fieldStyle}>
          Cron jobs (JSON array)
          <textarea
            value={cronJobsJson}
            onChange={(event) => setCronJobsJson(event.target.value)}
            rows={5}
            style={textAreaStyle}
          />
        </label>
        <label style={fieldStyle}>
          channelConfig (JSON object)
          <textarea
            value={channelConfigJson}
            onChange={(event) => setChannelConfigJson(event.target.value)}
            rows={7}
            style={textAreaStyle}
          />
        </label>
        <label style={toggleStyle}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Activo
        </label>
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={() => void saveRawSettings()}
            style={primaryButtonStyle}
            disabled={isSavingRaw}
          >
            {isSavingRaw ? "Guardando..." : "Guardar configuración avanzada"}
          </button>
        </div>
      </section>

      {error ? <p style={errorStyle}>{error}</p> : null}
      {success ? <p style={successStyle}>{success}</p> : null}
    </div>
  );
}

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const panelStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  border: "1px solid var(--giga-border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--giga-surface)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const copyStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--giga-muted)",
};

const metaStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--giga-muted)",
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--giga-border)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "var(--giga-bg)",
  color: "var(--giga-text)",
};

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  lineHeight: 1.5,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "var(--giga-primary)",
  color: "#fff",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid var(--giga-border)",
  borderRadius: 10,
  padding: "10px 14px",
  background: "var(--giga-bg)",
  color: "var(--giga-text)",
  cursor: "pointer",
};

const toggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  color: "#ef4444",
};

const successStyle: React.CSSProperties = {
  margin: 0,
  color: "#10b981",
};
