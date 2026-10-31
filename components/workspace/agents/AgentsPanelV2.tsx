"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Search, Sparkles } from "lucide-react";
import { AgentChatPanel } from "./AgentChatPanel";
import { AgentConfigPanel, type AgentConfigData } from "./AgentConfigPanel";
import { AgentGlassCard, type AgentGlassCardData } from "./AgentGlassCard";

type AgentInput = {
  id: string;
  name: string;
  legacyRole?: string | null;
  type: string;
  status: string;
  description: string | null;
  tools: string[];
  mcpToolsInclude: string[];
  mcpServerSlugs?: string[];
  read: string[];
  write: string[];
  channels: string[];
  surfaces: string[];
  cronJobs: unknown[];
  channelConfig?: Record<string, unknown>;
  memoryLabel: string;
  soulMd?: string | null;
  isPrimaryCopilot?: boolean;
  lastHealthCheckAt?: string | null;
  lastHealthStatus?: string | null;
  lastCronRunAt?: string | null;
  updatedAt?: string | null;
};

type AgentTemplateInput = {
  id: string;
  name: string;
  description?: string | null;
  type: "copilot" | "channel" | "worker" | "chatbot";
  category?: string | null;
};

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  currentRole: "admin" | "operator" | "viewer";
  currentUserEmail?: string | null;
  agentLimit: number;
  agentTemplates: AgentTemplateInput[];
  agents: AgentInput[];
  primaryAgentId: string | null;
};

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: 24,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--workspace-muted)",
  margin: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: "var(--workspace-text)",
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--workspace-muted)",
  margin: "4px 0 0",
};

const countPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 999,
  background: "rgba(245,158,11,0.14)",
  color: "#b15e05",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const filterChipStyle = (active: boolean): CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: active ? "1px solid rgba(99,102,241,0.45)" : "1px solid var(--workspace-border)",
  background: active ? "rgba(99,102,241,0.1)" : "white",
  color: active ? "#4338ca" : "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
});

const searchWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "white",
};

const searchInputStyle: CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 12.5,
  width: 160,
  color: "var(--workspace-text)",
};

const newAgentButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 999,
  border: "none",
  background: "rgba(15,23,42,0.92)",
  color: "white",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 16,
};

const detailWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 16,
  minHeight: 0,
  height: "calc(100dvh - 110px)",
};

const detailHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const backButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12.5,
  cursor: "pointer",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)",
  gap: 18,
  alignItems: "stretch",
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
};

const detailGridStackedStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 18,
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
};

function toGlassCardData(agent: AgentInput): AgentGlassCardData {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    type: agent.type,
    status: agent.status,
  };
}

function toConfigData(agent: AgentInput): AgentConfigData {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    type: agent.type,
    legacyRole: agent.legacyRole ?? null,
    status: agent.status,
    soulMd: agent.soulMd ?? null,
    tools: agent.tools,
    mcpToolsInclude: agent.mcpToolsInclude,
    mcpServerSlugs: agent.mcpServerSlugs ?? [],
    read: agent.read,
    write: agent.write,
    channels: agent.channels,
    surfaces: agent.surfaces,
    cronJobs: agent.cronJobs,
    channelConfig: agent.channelConfig ?? {},
    memoryLabel: agent.memoryLabel,
    isPrimaryCopilot: agent.isPrimaryCopilot,
    lastHealthCheckAt: agent.lastHealthCheckAt ?? null,
    lastHealthStatus: agent.lastHealthStatus ?? null,
    lastCronRunAt: agent.lastCronRunAt ?? null,
    updatedAt: agent.updatedAt ?? null,
  };
}

function toTimestamp(value?: string | null) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function mergeIncomingAgents(
  previous: AgentInput[],
  incoming: AgentInput[],
  holdUntilById: Record<string, number>,
): AgentInput[] {
  const previousById = new Map(previous.map((agent) => [agent.id, agent] as const));
  const now = Date.now();
  return incoming.map((nextAgent) => {
    const localAgent = previousById.get(nextAgent.id);
    if (!localAgent) return nextAgent;
    const holdUntil = holdUntilById[nextAgent.id] ?? 0;
    const localUpdatedAt = toTimestamp(localAgent.updatedAt ?? null);
    const incomingUpdatedAt = toTimestamp(nextAgent.updatedAt ?? null);
    const localIsNewer =
      localUpdatedAt !== null &&
      incomingUpdatedAt !== null &&
      localUpdatedAt > incomingUpdatedAt;
    const shouldPreferHeldLocal =
      holdUntil > now &&
      (incomingUpdatedAt === null || localUpdatedAt === null || localUpdatedAt >= incomingUpdatedAt);
    if (localIsNewer || shouldPreferHeldLocal) {
      return {
        ...nextAgent,
        ...localAgent,
        updatedAt: localAgent.updatedAt ?? nextAgent.updatedAt ?? null,
      };
    }
    return nextAgent;
  });
}

const TYPE_LABEL: Record<string, string> = {
  copilot: "Copilot",
  channel: "Canal",
  worker: "Operativo",
};

export function AgentsPanelV2({
  workspaceId,
  workspaceSlug,
  userId,
  currentRole,
  agentLimit,
  agentTemplates,
  agents,
  primaryAgentId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedAgentId = searchParams.get("agent");

  const [localAgents, setLocalAgents] = useState<AgentInput[]>(agents);
  const [filter, setFilter] = useState<"all" | "copilot" | "channel" | "worker">("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(agentTemplates[0]?.id ?? "");
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingInFlight, setCreatingInFlight] = useState(false);
  const healthRefreshCooldownUntilRef = useRef<Record<string, number>>({});
  const localAgentHoldUntilRef = useRef<Record<string, number>>({});
  const lastSoulRefreshSignatureRef = useRef<string>("");

  useEffect(() => {
    setLocalAgents((previous) =>
      mergeIncomingAgents(previous, agents, localAgentHoldUntilRef.current),
    );
  }, [agents]);

  useEffect(() => {
    if (agentTemplates.length === 0) {
      setSelectedTemplateId("");
      return;
    }
    if (!selectedTemplateId || !agentTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(agentTemplates[0].id);
    }
  }, [agentTemplates, selectedTemplateId]);

  const selectedAgent = useMemo(
    () => localAgents.find((agent) => agent.id === selectedAgentId) ?? null,
    [localAgents, selectedAgentId],
  );

  const selectedTemplate = useMemo(
    () => agentTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [agentTemplates, selectedTemplateId],
  );

  const primaryAgent = useMemo(() => {
    if (primaryAgentId) {
      const match = localAgents.find((agent) => agent.id === primaryAgentId);
      if (match) return match;
    }
    return localAgents.find((agent) => agent.type === "copilot") ?? null;
  }, [localAgents, primaryAgentId]);

  const filteredAgents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return localAgents.filter((agent) => {
      if (filter !== "all" && agent.type !== filter) return false;
      if (!term) return true;
      return (
        agent.name.toLowerCase().includes(term) ||
        (agent.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [filter, localAgents, search]);

  const setUrlAgent = useCallback(
    (agentId: string | null) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (agentId) {
        params.set("agent", agentId);
      } else {
        params.delete("agent");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleAgentUpdated = useCallback((updated: AgentConfigData) => {
    const updatedLoose = updated as AgentConfigData & {
      skills?: unknown;
      cron_jobs?: unknown;
      mcp_tools_include?: unknown;
    };
    localAgentHoldUntilRef.current[updated.id] = Date.now() + 30_000;
    setLocalAgents((prev) =>
      prev.map((agent) =>
        agent.id === updated.id
          ? {
              ...agent,
              name: typeof updated.name === "string" && updated.name.trim().length > 0 ? updated.name : agent.name,
              description: updated.description ?? agent.description,
              type: typeof updated.type === "string" && updated.type.trim().length > 0 ? updated.type : agent.type,
              legacyRole: updated.legacyRole ?? agent.legacyRole,
              status:
                typeof updated.status === "string" && updated.status.trim().length > 0
                  ? updated.status
                  : agent.status,
              soulMd: updated.soulMd ?? agent.soulMd ?? null,
              tools:
                Array.isArray(updated.tools) && updated.tools.length > 0
                  ? updated.tools
                  : Array.isArray(updatedLoose.skills) && updatedLoose.skills.length > 0
                    ? (updatedLoose.skills as string[])
                    : Array.isArray(updated.tools)
                      ? updated.tools
                      : agent.tools,
              mcpToolsInclude:
                Array.isArray(updated.mcpToolsInclude) && updated.mcpToolsInclude.length > 0
                  ? updated.mcpToolsInclude
                  : Array.isArray(updatedLoose.mcp_tools_include) &&
                      updatedLoose.mcp_tools_include.length > 0
                    ? (updatedLoose.mcp_tools_include as string[])
                    : Array.isArray(updated.mcpToolsInclude)
                      ? updated.mcpToolsInclude
                      : agent.mcpToolsInclude,
              mcpServerSlugs: Array.isArray(updated.mcpServerSlugs) ? updated.mcpServerSlugs : agent.mcpServerSlugs,
              read: Array.isArray(updated.read) ? updated.read : agent.read,
              write: Array.isArray(updated.write) ? updated.write : agent.write,
              channels: Array.isArray(updated.channels) ? updated.channels : agent.channels,
              surfaces: Array.isArray(updated.surfaces) ? updated.surfaces : agent.surfaces,
              cronJobs:
                Array.isArray(updated.cronJobs) && updated.cronJobs.length > 0
                  ? updated.cronJobs
                  : Array.isArray(updatedLoose.cron_jobs) && updatedLoose.cron_jobs.length > 0
                    ? (updatedLoose.cron_jobs as unknown[])
                    : Array.isArray(updated.cronJobs)
                      ? updated.cronJobs
                      : agent.cronJobs,
              channelConfig:
                updated.channelConfig && typeof updated.channelConfig === "object"
                  ? updated.channelConfig
                  : (agent.channelConfig ?? {}),
              memoryLabel:
                typeof updated.memoryLabel === "string" && updated.memoryLabel.trim().length > 0
                  ? updated.memoryLabel
                  : agent.memoryLabel,
              isPrimaryCopilot:
                typeof updated.isPrimaryCopilot === "boolean"
                  ? updated.isPrimaryCopilot
                  : (agent.isPrimaryCopilot ?? false),
              lastHealthCheckAt: updated.lastHealthCheckAt ?? agent.lastHealthCheckAt ?? null,
              lastHealthStatus: updated.lastHealthStatus ?? agent.lastHealthStatus ?? null,
              lastCronRunAt: updated.lastCronRunAt ?? agent.lastCronRunAt ?? null,
              updatedAt: updated.updatedAt ?? agent.updatedAt ?? null,
            }
          : updated.isPrimaryCopilot
            ? { ...agent, isPrimaryCopilot: false }
            : agent,
      ),
    );
  }, []);

  const handleChatAgentUpdated = useCallback(
    (updated: AgentConfigData) => {
      handleAgentUpdated(updated);
      const soulMd = typeof updated.soulMd === "string" ? updated.soulMd.trim() : "";
      const refreshSignature = [
        updated.id,
        updated.updatedAt ?? "",
        updated.name,
        soulMd,
      ].join(":");
      // Allow remote Hermes home a short window to converge before polling liveness again.
      healthRefreshCooldownUntilRef.current[updated.id] = Date.now() + 20_000;
      if (lastSoulRefreshSignatureRef.current === refreshSignature) return;
      lastSoulRefreshSignatureRef.current = refreshSignature;
      router.refresh();
    },
    [handleAgentUpdated, router],
  );

  const handleAgentDeleted = useCallback(
    (deletedAgentId: string) => {
      setLocalAgents((prev) => prev.filter((agent) => agent.id !== deletedAgentId));
      if (selectedAgentId === deletedAgentId) {
        setUrlAgent(null);
      }
      router.refresh();
    },
    [router, selectedAgentId, setUrlAgent],
  );

  useEffect(() => {
    if (!selectedAgentId) return;
    const activeAgentId = selectedAgentId;
    let cancelled = false;

    async function refreshSelectedAgentHealth() {
      const cooldownUntil = healthRefreshCooldownUntilRef.current[activeAgentId] ?? 0;
      if (cooldownUntil > Date.now()) return;
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${activeAgentId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skipCron: true }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          agent?: AgentConfigData;
        };
        if (!response.ok || !payload.agent || cancelled) return;
        handleAgentUpdated(payload.agent);
      } catch {
        // Best-effort background refresh only.
      }
    }

    void refreshSelectedAgentHealth();
    const interval = window.setInterval(() => {
      void refreshSelectedAgentHealth();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [handleAgentUpdated, selectedAgentId, workspaceSlug]);

  async function createAgent() {
    setCreateError(null);
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError("El nombre es obligatorio.");
      return;
    }
    if (localAgents.length >= agentLimit) {
      setCreateError(
        `Llegaste al limite de ${agentLimit} agentes para este plan.`,
      );
      return;
    }
    setCreatingInFlight(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          description: createDescription.trim(),
          ...(selectedTemplateId ? { templateId: selectedTemplateId } : { role: "custom" }),
          isActive: false,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: AgentInput & { isPrimaryCopilot?: boolean };
      };
      if (!response.ok || !data.agent) {
        throw new Error(data.error ?? "No se pudo crear el agente.");
      }
      setLocalAgents((prev) => [...prev, data.agent as AgentInput]);
      setCreateName("");
      setCreateDescription("");
      setSelectedTemplateId(agentTemplates[0]?.id ?? "");
      setCreating(false);
      setUrlAgent(data.agent.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setCreatingInFlight(false);
    }
  }

  // ----- detail view -----
  if (selectedAgent) {
    return (
      <div style={detailWrapStyle}>
        <div style={detailHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              style={backButtonStyle}
              onClick={() => setUrlAgent(null)}
            >
              <ArrowLeft size={14} />
              Volver a operadores
            </button>
            <div>
              <p style={eyebrowStyle}>
                {TYPE_LABEL[selectedAgent.type] ?? selectedAgent.type}
                {selectedAgent.isPrimaryCopilot ? " · CEO" : ""}
              </p>
              <h1 style={{ ...titleStyle, fontSize: 20 }}>{selectedAgent.name}</h1>
            </div>
          </div>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              background:
                selectedAgent.status === "active"
                  ? "rgba(16,185,129,0.12)"
                  : selectedAgent.lastHealthStatus === "drifted"
                    ? "rgba(245,158,11,0.14)"
                  : selectedAgent.status === "error"
                    ? "rgba(220,38,38,0.1)"
                    : "rgba(245,158,11,0.14)",
              color:
                selectedAgent.status === "active"
                  ? "#0f8a52"
                  : selectedAgent.lastHealthStatus === "drifted"
                    ? "#b15e05"
                  : selectedAgent.status === "error"
                    ? "#b42318"
                    : "#b15e05",
            }}
          >
            {selectedAgent.lastHealthStatus === "drifted"
              ? "Desincronizado"
              : selectedAgent.status === "active"
              ? "Activo"
              : selectedAgent.status === "paused"
                ? "Pausado"
                : selectedAgent.status === "error"
                  ? "Con error"
                  : selectedAgent.status}
          </span>
        </div>

        <DetailGrid>
          <AgentChatPanel
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            userId={userId}
            primaryAgentId={primaryAgent?.id ?? null}
            primaryAgentName={primaryAgent?.name ?? null}
            targetedAgentId={selectedAgent.id}
            targetedAgentName={selectedAgent.name}
            placeholder={`Actualiza ${selectedAgent.name}...`}
            variant="compact"
            panelScope="operator_agent"
            operatorMode="agent_detail"
            onAgentUpdated={handleChatAgentUpdated}
          />
          <AgentConfigPanel
            workspaceSlug={workspaceSlug}
            agent={toConfigData(selectedAgent)}
            canEdit={currentRole === "admin"}
            onUpdated={handleAgentUpdated}
            onDeleted={handleAgentDeleted}
          />
        </DetailGrid>
      </div>
    );
  }

  // ----- landing view -----
  const activeCount = localAgents.length;

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Operadores</p>
          <h1 style={titleStyle}>Agentes</h1>
          <p style={subtitleStyle}>
            Habla con tu CEO para crear, editar y conectar a cada agente. Hace todo desde el chat.
          </p>
        </div>
        <div style={toolbarStyle}>
          <span style={countPillStyle}>
            {activeCount}/{agentLimit} agentes
          </span>
          <button
            type="button"
            style={newAgentButtonStyle}
            onClick={() => setCreating((v) => !v)}
            disabled={currentRole !== "admin"}
          >
            <Plus size={14} />
            Nuevo agente
          </button>
        </div>
      </div>

      {primaryAgent ? (
        <AgentChatPanel
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          userId={userId}
          primaryAgentId={primaryAgent.id}
          primaryAgentName={primaryAgent.name}
          variant="hero"
          placeholder={`Habla con ${primaryAgent.name}...`}
          emptyTitle={`Hola, ${primaryAgent.name} esta listo.`}
          emptySubtitle="Pidele crear un agente nuevo, editar el SOUL de uno existente, conectar APIs o programar un job."
          panelScope="operator_overview"
          operatorMode="overview"
          onAgentUpdated={handleChatAgentUpdated}
        />
      ) : (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            padding: 28,
            borderRadius: 22,
            border: "1px dashed var(--workspace-border)",
            background: "var(--workspace-surface)",
            color: "var(--workspace-muted)",
            fontSize: 13,
            gap: 8,
            textAlign: "center",
          }}
        >
          <Sparkles size={20} />
          <p style={{ margin: 0, color: "var(--workspace-text)", fontWeight: 600 }}>
            Aun no hay un CEO designado.
          </p>
          <p style={{ margin: 0, maxWidth: 420 }}>
            Configura un copilot principal en el workspace para activar este chat de operadores.
          </p>
        </div>
      )}

      {creating ? (
        <div
          style={{
            border: "1px solid var(--workspace-border)",
            borderRadius: 18,
            padding: 16,
            background: "var(--workspace-surface)",
            display: "grid",
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14 }}>Nuevo agente</h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
            Se crea pausado. Puedes arrancar desde una plantilla y luego afinar SOUL, skills y conexiones.
          </p>
          {agentTemplates.length > 0 ? (
            <>
              <select
                value={selectedTemplateId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedTemplateId(nextId);
                  const template = agentTemplates.find((entry) => entry.id === nextId) ?? null;
                  if (template && !createDescription.trim()) {
                    setCreateDescription(template.description ?? "");
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--workspace-border)",
                  fontSize: 13,
                }}
              >
                {agentTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {TYPE_LABEL[template.type === "chatbot" ? "copilot" : template.type] ?? template.type}
                  </option>
                ))}
              </select>
              {selectedTemplate ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
                  {selectedTemplate.description ?? "Plantilla sin descripcion."}
                </p>
              ) : null}
            </>
          ) : null}
          <input
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder={selectedTemplate ? `Nombre (ej. ${selectedTemplate.name})` : "Nombre (ej. Sales Closer)"}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--workspace-border)",
              fontSize: 13,
            }}
          />
          <input
            value={createDescription}
            onChange={(event) => setCreateDescription(event.target.value)}
            placeholder="Descripcion breve"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--workspace-border)",
              fontSize: 13,
            }}
          />
          {createError ? (
            <p style={{ margin: 0, fontSize: 12, color: "#b42318" }}>{createError}</p>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void createAgent()}
              disabled={creatingInFlight}
              style={{
                padding: "7px 14px",
                borderRadius: 10,
                border: "none",
                background: "rgba(99,102,241,0.95)",
                color: "white",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: creatingInFlight ? "not-allowed" : "pointer",
              }}
            >
              {creatingInFlight ? "Creando..." : "Crear agente"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              style={{
                padding: "7px 14px",
                borderRadius: 10,
                border: "1px solid var(--workspace-border)",
                background: "white",
                color: "var(--workspace-text)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div style={toolbarStyle}>
        {(["all", "copilot", "channel", "worker"] as const).map((key) => (
          <button
            key={key}
            type="button"
            style={filterChipStyle(filter === key)}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "Todos" : TYPE_LABEL[key]}
          </button>
        ))}
        <span style={searchWrapStyle}>
          <Search size={12} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar agente"
            style={searchInputStyle}
          />
        </span>
      </div>

      {filteredAgents.length === 0 ? (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            padding: 28,
            borderRadius: 18,
            border: "1px dashed var(--workspace-border)",
            color: "var(--workspace-muted)",
            fontSize: 13,
          }}
        >
          {localAgents.length === 0
            ? "Crea tu primer agente o pideselo al CEO."
            : "No hay agentes que coincidan con el filtro."}
        </div>
      ) : (
        <div style={gridStyle}>
          {filteredAgents.map((agent) => (
            <AgentGlassCard
              key={agent.id}
              agent={toGlassCardData(agent)}
              onSelect={(id) => setUrlAgent(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 980px)");
    const apply = () => setStacked(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return <div style={stacked ? detailGridStackedStyle : detailGridStyle}>{children}</div>;
}
