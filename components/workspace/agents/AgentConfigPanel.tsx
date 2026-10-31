"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarClock, MessageCircle, Play, Plug, Power, Trash2, UserSquare2, Wrench } from "lucide-react";
import { InstructionsSection } from "@/components/workspace/agents/sections/InstructionsSection";
import { TriggersSection } from "@/components/workspace/agents/sections/TriggersSection";
import { SkillsSection } from "@/components/workspace/agents/sections/SkillsSection";
import { KnowledgeSection, type CatalogObject } from "@/components/workspace/agents/sections/KnowledgeSection";
import { ConnectionsSection } from "@/components/workspace/agents/sections/ConnectionsSection";
import { ActivationSection } from "@/components/workspace/agents/sections/ActivationSection";
import type { CatalogTool } from "@/components/workspace/agents/AddSkillModal";

export type AgentConfigData = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  legacyRole?: string | null;
  status: string;
  soulMd: string | null;
  tools: string[];
  mcpToolsInclude: string[];
  mcpServerSlugs: string[];
  read: string[];
  write: string[];
  channels: string[];
  surfaces: string[];
  cronJobs: unknown[];
  channelConfig: Record<string, unknown>;
  memoryLabel: string;
  isPrimaryCopilot?: boolean;
  lastHealthCheckAt?: string | null;
  lastHealthStatus?: string | null;
  lastCronRunAt?: string | null;
  updatedAt?: string | null;
};

type Props = {
  workspaceSlug: string;
  agent: AgentConfigData;
  canEdit: boolean;
  onUpdated: (agent: AgentConfigData) => void;
  onDeleted?: (deletedAgentId: string) => void;
};

type CatalogResponse = {
  tools: CatalogTool[];
  surfaces: string[];
  objects: CatalogObject[];
};

const DEFAULT_SURFACES = ["CRM", "Tareas", "Documentos", "Inbox", "Chat"];

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  height: "100%",
  minHeight: 0,
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 24,
  background: "var(--workspace-panel)",
  display: "grid",
  height: "100%",
  minHeight: 0,
  overflowY: "auto",
};

const cardHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "var(--workspace-panel)",
  borderBottom: "1px solid var(--workspace-border)",
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const headerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.48)",
  zIndex: 60,
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const modalCardStyle: CSSProperties = {
  width: "min(560px, calc(100vw - 32px))",
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "white",
  boxShadow: "0 24px 56px rgba(15,23,42,0.28)",
  padding: 16,
  display: "grid",
  gap: 10,
};

type SectionCardProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  first?: boolean;
  children: ReactNode;
};

function SectionCard({ icon, title, subtitle, first = false, children }: SectionCardProps) {
  return (
    <section style={{ borderTop: first ? "none" : "1px solid var(--workspace-border)", padding: "14px 16px", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--workspace-muted)", display: "inline-flex" }}>{icon}</span>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--workspace-muted)", fontWeight: 600, letterSpacing: 0.45, textTransform: "uppercase" }}>
            {title}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function AgentConfigPanel({ workspaceSlug, agent, canEdit, onUpdated, onDeleted }: Props) {
  const [draftSoul, setDraftSoul] = useState(agent.soulMd ?? "");
  const [isSoulDirty, setIsSoulDirty] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [workflowText, setWorkflowText] = useState("");
  type PlannerOutput = {
    tools: Array<{
      name: string;
      description: string;
      rationale: string;
      implementation: { kind: "api_compose"; steps: unknown[] };
      args: Array<{ key: string; type: string; required: boolean; description: string }>;
    }>;
    notes: string;
  };
  const [plannerResult, setPlannerResult] = useState<PlannerOutput | null>(null);
  const [plannerWarnings, setPlannerWarnings] = useState<string[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);

  useEffect(() => {
    setDraftSoul(agent.soulMd ?? "");
    setIsSoulDirty(false);
    setError(null);
    setFeedback(null);
    setShowDeleteModal(false);
  }, [agent.id, agent.soulMd]);

  const runPlanner = useCallback(async () => {
    if (!canEdit) return;
    const text = workflowText.trim();
    if (text.length < 20) {
      setError("Pega o escribe al menos 20 caracteres de workflow.");
      return;
    }
    setPlannerLoading(true);
    setError(null);
    setPlannerResult(null);
    setPlannerWarnings([]);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/dynamic-tools/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentTextOverride: text, agentId: agent.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        output?: PlannerOutput;
        validationWarnings?: string[];
      };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo generar el plan.");
      }
      if (data.output) {
        setPlannerResult(data.output);
        setPlannerWarnings(Array.isArray(data.validationWarnings) ? data.validationWarnings : []);
        setFeedback("Plan de herramientas listo. Revisa y pulsa Run para guardar.");
      } else {
        setError("Respuesta del planificador vacía.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al planear.");
    } finally {
      setPlannerLoading(false);
    }
  }, [canEdit, workflowText, workspaceSlug, agent.id]);

  const runPersistTools = useCallback(async () => {
    if (!canEdit || !plannerResult?.tools?.length) return;
    setRunLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/dynamic-tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tools: plannerResult.tools,
          agentId: agent.id,
          activateAll: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron guardar las herramientas.");
      }
      setFeedback("Herramientas dinámicas guardadas y activas para este agente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setRunLoading(false);
    }
  }, [canEdit, plannerResult, workspaceSlug, agent.id]);

  const handleSoulChange = useCallback(
    (nextValue: string) => {
      setDraftSoul(nextValue);
      setIsSoulDirty(nextValue !== (agent.soulMd ?? ""));
    },
    [agent.soulMd],
  );

  const handleSoulDiscard = useCallback(() => {
    setDraftSoul(agent.soulMd ?? "");
    setIsSoulDirty(false);
  }, [agent.soulMd]);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      setCatalogError(null);
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/catalog`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string } & Partial<CatalogResponse>;
        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo cargar el catalogo de agentes.");
        }
        if (!active) return;
        setCatalog({
          tools: Array.isArray(data.tools) ? data.tools : [],
          surfaces: Array.isArray(data.surfaces) ? data.surfaces : DEFAULT_SURFACES,
          objects: Array.isArray(data.objects) ? data.objects : [],
        });
      } catch (err) {
        if (!active) return;
        setCatalogError(err instanceof Error ? err.message : "No se pudo cargar el catalogo.");
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  const patchAgent = useCallback(
    async (sectionId: string, body: Record<string, unknown>, successLabel: string) => {
      if (!canEdit) {
        throw new Error("Solo los admins pueden editar agentes.");
      }
      setSavingSection(sectionId);
      setError(null);
      setFeedback(null);
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${agent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          agent?: AgentConfigData;
        };
        if (!response.ok || !data.agent) {
          throw new Error(data.error ?? "No se pudo guardar el cambio.");
        }
        onUpdated(data.agent);
        setFeedback(successLabel);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido.";
        setError(message);
        throw err;
      } finally {
        setSavingSection(null);
      }
    },
    [agent.id, canEdit, onUpdated, workspaceSlug],
  );

  const surfaces = useMemo(() => {
    if (!catalog?.surfaces || catalog.surfaces.length === 0) return DEFAULT_SURFACES;
    return catalog.surfaces;
  }, [catalog?.surfaces]);
  const visibleCapabilities = useMemo(() => {
    if (Array.isArray(agent.mcpToolsInclude) && agent.mcpToolsInclude.length > 0) {
      return agent.mcpToolsInclude;
    }
    return Array.isArray(agent.tools) ? agent.tools : [];
  }, [agent.mcpToolsInclude, agent.tools]);

  const deleteAgent = useCallback(async () => {
    if (!canEdit) {
      setError("Solo los admins pueden eliminar agentes.");
      return;
    }

    setSavingSection("delete");
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${agent.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        deletedAgentId?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo eliminar el agente.");
      }
      setShowDeleteModal(false);
      setFeedback("Agente eliminado.");
      onDeleted?.(typeof data.deletedAgentId === "string" ? data.deletedAgentId : agent.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      setError(message);
    } finally {
      setSavingSection(null);
    }
  }, [agent.id, canEdit, onDeleted, workspaceSlug]);

  return (
    <div style={wrapStyle}>
      {feedback ? (
        <p style={{ margin: 0, padding: "8px 12px", borderRadius: 10, background: "rgba(16,185,129,0.1)", color: "#0f8a52", fontSize: 12.5 }}>
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p style={{ margin: 0, padding: "8px 12px", borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "#b42318", fontSize: 12.5 }}>
          {error}
        </p>
      ) : null}
      {catalogError ? (
        <p style={{ margin: 0, padding: "8px 12px", borderRadius: 10, background: "rgba(245,158,11,0.12)", color: "#b15e05", fontSize: 12.5 }}>
          {catalogError}
        </p>
      ) : null}

      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--workspace-muted)", fontWeight: 600, letterSpacing: 0.45, textTransform: "uppercase" }}>
              Agent config card
            </p>
            <h3 style={{ margin: "3px 0 0", fontSize: 17, color: "var(--workspace-text)" }}>{agent.name}</h3>
          </div>
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button
              type="button"
              style={{
                ...headerButtonStyle,
                opacity: !canEdit || plannerLoading ? 0.6 : 1,
                cursor: !canEdit || plannerLoading ? "not-allowed" : "pointer",
              }}
              disabled={!canEdit || plannerLoading}
              onClick={() => void runPlanner()}
            >
              <MessageCircle size={13} />
              {plannerLoading ? "Planificando…" : "Ask"}
            </button>
            <button
              type="button"
              style={{
                ...headerButtonStyle,
                opacity: !canEdit || runLoading || !plannerResult?.tools?.length ? 0.6 : 1,
                cursor: !canEdit || runLoading || !plannerResult?.tools?.length ? "not-allowed" : "pointer",
              }}
              disabled={!canEdit || runLoading || !plannerResult?.tools?.length}
              onClick={() => void runPersistTools()}
            >
              <Play size={13} />
              {runLoading ? "Guardando…" : "Run"}
            </button>
            <button
              type="button"
              style={{
                ...headerButtonStyle,
                border: "1px solid rgba(220,38,38,0.28)",
                color: "#b42318",
                opacity: !canEdit || savingSection === "delete" ? 0.7 : 1,
                cursor: !canEdit || savingSection === "delete" ? "not-allowed" : "pointer",
              }}
              disabled={!canEdit || savingSection === "delete"}
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 size={13} />
              {savingSection === "delete" ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>

        <section style={{ padding: "12px 16px", borderBottom: "1px solid var(--workspace-border)", display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
            Pega un documento de workflow; Ask propone herramientas (dyn.*). Run las guarda y activa para este agente.
          </p>
          <textarea
            value={workflowText}
            onChange={(e) => setWorkflowText(e.target.value)}
            readOnly={!canEdit}
            placeholder="Pega aquí el Markdown o texto de operación (ej. inventario, routing de leads)…"
            style={{
              minHeight: 100,
              width: "100%",
              fontSize: 12.5,
              padding: 10,
              borderRadius: 12,
              border: "1px solid var(--workspace-border)",
              background: "var(--workspace-surface, #f8fafc)",
              color: "var(--workspace-text)",
            }}
          />
          {plannerWarnings.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: "#b15e05" }}>
              {plannerWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {plannerResult ? (
            <div style={{ display: "grid", gap: 8 }}>
              {plannerResult.notes ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>{plannerResult.notes}</p>
              ) : null}
              {plannerResult.tools.map((t) => (
                <div
                  key={t.name}
                  style={{
                    border: "1px solid var(--workspace-border)",
                    borderRadius: 12,
                    padding: 10,
                    background: "white",
                    fontSize: 12,
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600, color: "var(--workspace-text)" }}>{t.name}</p>
                  <p style={{ margin: "4px 0 0", color: "var(--workspace-muted)" }}>{t.description}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--workspace-muted)" }}>{t.rationale}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <SectionCard icon={<UserSquare2 size={14} />} title="Instructions" subtitle="SOUL del agente" first>
          <InstructionsSection
            canEdit={canEdit}
            value={draftSoul}
            isDirty={isSoulDirty}
            isSaving={savingSection === "instructions"}
            onChange={handleSoulChange}
            onSave={() => {
              if (!isSoulDirty) return;
              void patchAgent("instructions", { soulMd: draftSoul }, "Instructions guardadas.");
            }}
            onDiscard={handleSoulDiscard}
          />
        </SectionCard>

        <SectionCard icon={<CalendarClock size={14} />} title="Triggers" subtitle="Cron jobs y automatizaciones">
          <TriggersSection
            jobs={agent.cronJobs}
            canEdit={canEdit}
            isSaving={savingSection === "triggers"}
            onSave={(nextJobs) => patchAgent("triggers", { cronJobs: nextJobs }, "Triggers guardados.")}
          />
        </SectionCard>

        <SectionCard icon={<Wrench size={14} />} title="Skills" subtitle="Capabilities y herramientas expuestas al agente">
          <SkillsSection
            enabledTools={visibleCapabilities}
            catalogTools={catalog?.tools ?? []}
            canEdit={canEdit}
            isSaving={savingSection === "skills"}
            onSave={(nextTools) =>
              patchAgent("skills", { mcpToolsInclude: nextTools, skills: nextTools }, "Skills guardadas.")
            }
          />
        </SectionCard>

        <SectionCard icon={<Wrench size={14} />} title="Knowledge" subtitle="Datos y acceso a superficies">
          <KnowledgeSection
            key={`${agent.id}:${agent.read.join(",")}:${agent.write.join(",")}:${agent.surfaces.join(",")}:${agent.channels.join(",")}:${(catalog?.objects ?? []).map((object) => `${object.id}:${object.slug}`).join("|")}`}
            canEdit={canEdit}
            isSaving={savingSection === "knowledge"}
            objects={catalog?.objects ?? []}
            surfaceOptions={surfaces}
            read={agent.read}
            write={agent.write}
            surfaces={agent.surfaces}
            channels={agent.channels}
            onSave={(payload) =>
              patchAgent(
                "knowledge",
                {
                  knowledgeScope: {
                    read: payload.read,
                    write: payload.write,
                    surfaces: payload.surfaces,
                    channels: payload.channels,
                  },
                },
                "Knowledge guardado.",
              )
            }
          />
        </SectionCard>

        <SectionCard icon={<Plug size={14} />} title="Connections" subtitle="Credenciales API y secretos">
          <ConnectionsSection
            workspaceSlug={workspaceSlug}
            canEdit={canEdit}
            isSaving={savingSection === "connections"}
            channelConfig={agent.channelConfig}
            mcpServerSlugs={agent.mcpServerSlugs}
            onSaveChannelConfig={(nextConfig) =>
              patchAgent("connections", { channelConfig: nextConfig }, "Conexiones guardadas.")
            }
            onSaveMcpServerSlugs={(nextSlugs) =>
              patchAgent(
                "connections",
                { knowledgeScope: { mcpServerSlugs: nextSlugs } },
                "Servidores MCP guardados.",
              )
            }
          />
        </SectionCard>

        <SectionCard icon={<Power size={14} />} title="Activation" subtitle="Estado operativo del agente">
          <ActivationSection
            status={agent.status}
            lastHealthCheckAt={agent.lastHealthCheckAt ?? null}
            lastHealthStatus={agent.lastHealthStatus ?? null}
            canEdit={canEdit}
            isSaving={savingSection === "activation"}
            onSave={(isActive) =>
              patchAgent("activation", { isActive }, isActive ? "Agente activado." : "Agente pausado.")
            }
          />
        </SectionCard>
      </div>
      {showDeleteModal ? (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h4 style={{ margin: 0, fontSize: 16, color: "var(--workspace-text)" }}>
              Eliminar agente
            </h4>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--workspace-muted)", lineHeight: 1.45 }}>
              Esta accion eliminara el agente y su historial asociado. No se puede recuperar despues.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={savingSection === "delete"}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--workspace-border)",
                  background: "white",
                  color: "var(--workspace-text)",
                  fontSize: 12.5,
                  cursor: savingSection === "delete" ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void deleteAgent()}
                disabled={savingSection === "delete"}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(220,38,38,0.24)",
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: savingSection === "delete" ? "not-allowed" : "pointer",
                }}
              >
                {savingSection === "delete" ? "Eliminando..." : "Si, eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
