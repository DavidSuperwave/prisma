"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, LoaderCircle, Plus, Sparkles } from "lucide-react";
import { consumeCompleteSseDataLines } from "@/lib/chatSseClient";
import { stripInlineToolCallsFromText } from "@/lib/stripInlineToolCalls";
import type { AgentConfigData } from "./AgentConfigPanel";
import { AgentGradientOrb } from "./AgentGradientOrb";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ComposerMode = "chat" | "web";

type AttachmentRef = {
  kind: "record";
  id: string;
  label: string;
};

type ConversationSummary = {
  id: string;
  agentId?: string | null;
  runtimeConversationId: string;
  title: string;
  metadata?: Record<string, unknown>;
  messageCount?: number;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
};

type ConversationSource = "workspace_chat" | "operator_builder";

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  primaryAgentId: string | null;
  primaryAgentName?: string | null;
  targetedAgentId?: string | null;
  targetedAgentName?: string | null;
  placeholder?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  /** Compact = used in the agent-detail two-column layout (smaller chrome). */
  variant?: "hero" | "compact";
  /** Optional initial assistant greeting */
  greeting?: string;
  panelScope?: "operator_overview" | "operator_agent";
  operatorMode?: "overview" | "agent_detail";
  onAgentUpdated?: (agent: AgentConfigData) => void;
};

const shellStyle = (variant: "hero" | "compact"): CSSProperties => ({
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto auto auto",
  gap: 14,
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.65)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.65) 100%)",
  backdropFilter: "blur(18px) saturate(1.05)",
  WebkitBackdropFilter: "blur(18px) saturate(1.05)",
  boxShadow:
    "0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 40px -18px rgba(15,23,42,0.18)",
  padding: variant === "hero" ? 22 : 18,
  minHeight: variant === "hero" ? 360 : 0,
  height: variant === "compact" ? "100%" : undefined,
  maxHeight: variant === "compact" ? "100%" : undefined,
  minWidth: 0,
  overflow: "hidden",
});

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const headerTextStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--workspace-text)",
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--workspace-muted)",
  margin: 0,
};

const messagesScrollerStyle: CSSProperties = {
  overflowY: "auto",
  display: "grid",
  gap: 10,
  alignContent: "start",
  paddingRight: 2,
  minHeight: 0,
};

const userBubbleStyle: CSSProperties = {
  justifySelf: "end",
  maxWidth: "82%",
  background: "rgba(99,102,241,0.12)",
  color: "var(--workspace-text)",
  border: "1px solid rgba(99,102,241,0.18)",
  borderRadius: 14,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const assistantBubbleStyle: CSSProperties = {
  justifySelf: "start",
  maxWidth: "92%",
  background: "rgba(255,255,255,0.85)",
  color: "var(--workspace-text)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 14,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const composerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  gap: 8,
  alignItems: "end",
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  padding: 10,
  background: "white",
};

const textareaStyle: CSSProperties = {
  resize: "none",
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--workspace-text)",
  minHeight: 22,
  maxHeight: 140,
  width: "100%",
};

const sendButtonStyle = (disabled: boolean): CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "none",
  background: disabled ? "rgba(99,102,241,0.35)" : "rgba(99,102,241,0.95)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: disabled ? "not-allowed" : "pointer",
});

const modeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const modeButtonStyle = (active: boolean): CSSProperties => ({
  border: active ? "1px solid rgba(99,102,241,0.45)" : "1px solid var(--workspace-border)",
  background: active ? "rgba(99,102,241,0.1)" : "white",
  color: active ? "#4338ca" : "var(--workspace-text)",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
});

const uploadButtonStyle = (disabled: boolean): CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeRuntimeConversationId(params: {
  workspaceSlug: string;
  userId: string;
  primaryAgentId: string;
  panelScope: "operator_overview" | "operator_agent";
  targetedAgentId?: string | null;
}) {
  const scope = params.targetedAgentId ? normalizeToken(params.targetedAgentId) : "overview";
  return [
    "agents-tab",
    params.panelScope,
    normalizeToken(params.workspaceSlug),
    normalizeToken(params.userId),
    normalizeToken(params.primaryAgentId),
    scope,
  ]
    .join(":")
    .slice(0, 180);
}

function inferDocumentKind(file: File): "spreadsheet" | "pdf" | "image" | "other" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/")) return "image";
  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type.includes("csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv")
  ) {
    return "spreadsheet";
  }
  return "other";
}

function normalizeAgentSnapshot(candidate: Record<string, unknown>): AgentConfigData {
  const normalized: Record<string, unknown> = { ...candidate };
  const aliases: Array<[camel: string, snake: string]> = [
    ["tools", "skills"],
    ["soulMd", "soul_md"],
    ["legacyRole", "legacy_role"],
    ["mcpToolsInclude", "mcp_tools_include"],
    ["mcpServerSlugs", "mcp_server_slugs"],
    ["cronJobs", "cron_jobs"],
    ["channelConfig", "channel_config"],
    ["memoryLabel", "memory_label"],
    ["isPrimaryCopilot", "is_primary_copilot"],
    ["lastHealthCheckAt", "last_health_check_at"],
    ["lastHealthStatus", "last_health_status"],
    ["lastCronRunAt", "last_cron_run_at"],
    ["updatedAt", "updated_at"],
  ];
  for (const [camel, snake] of aliases) {
    if (typeof normalized[camel] === "undefined" && typeof normalized[snake] !== "undefined") {
      normalized[camel] = normalized[snake];
    }
  }
  return normalized as AgentConfigData;
}

export function AgentChatPanel({
  workspaceId,
  workspaceSlug,
  userId,
  primaryAgentId,
  primaryAgentName,
  targetedAgentId,
  targetedAgentName,
  placeholder,
  emptyTitle,
  emptySubtitle,
  variant = "hero",
  greeting,
  panelScope = "operator_overview",
  operatorMode = "overview",
  onAgentUpdated,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRef[]>([]);
  const [agentUpdateNotice, setAgentUpdateNotice] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const isAgentDetail = operatorMode === "agent_detail" || panelScope === "operator_agent";
  const conversationAgentId = isAgentDetail
    ? (targetedAgentId ?? primaryAgentId)
    : primaryAgentId;

  const runtimeConversationId = useMemo(() => {
    if (!conversationAgentId) return null;
    return makeRuntimeConversationId({
      workspaceSlug,
      userId,
      primaryAgentId: conversationAgentId,
      panelScope,
      targetedAgentId,
    });
  }, [conversationAgentId, panelScope, targetedAgentId, userId, workspaceSlug]);

  const legacyRuntimeConversationId = useMemo(() => {
    if (!isAgentDetail || !primaryAgentId || !targetedAgentId) return null;
    if (primaryAgentId === conversationAgentId) return null;
    return makeRuntimeConversationId({
      workspaceSlug,
      userId,
      primaryAgentId,
      panelScope,
      targetedAgentId,
    });
  }, [conversationAgentId, isAgentDetail, panelScope, primaryAgentId, targetedAgentId, userId, workspaceSlug]);

  const conversationSource: ConversationSource =
    operatorMode === "agent_detail" || panelScope === "operator_agent"
      ? "operator_builder"
      : "workspace_chat";

  const greetingMessage = useMemo(() => {
    if (!greeting) return [];
    return [{ id: "greet", role: "assistant" as const, content: greeting }];
  }, [greeting]);

  useEffect(() => {
    let active = true;
    async function loadConversation() {
      if (!conversationAgentId || !runtimeConversationId) {
        setConversation(null);
        setMessages(greetingMessage);
        setPendingAttachments([]);
        return;
      }
      setIsLoadingConversation(true);
      setError(null);
      setPendingAttachments([]);
      try {
        const listParams = new URLSearchParams({
          source: conversationSource,
          limit: "80",
        });
        if (!isAgentDetail) {
          listParams.set("agentId", conversationAgentId);
        }
        const listResponse = await fetch(
          `/api/workspaces/${workspaceSlug}/conversations?${listParams.toString()}`,
          { cache: "no-store" },
        );
        const listPayload = (await listResponse.json().catch(() => ({}))) as {
          error?: string;
          conversations?: Array<ConversationSummary>;
        };
        if (!listResponse.ok) {
          throw new Error(listPayload.error ?? "No se pudo cargar el historial.");
        }
        const allConversations = listPayload.conversations ?? [];
        const conversationScore = (entry: (typeof allConversations)[number]) => {
          const messageCount =
            typeof entry.messageCount === "number" && Number.isFinite(entry.messageCount)
              ? entry.messageCount
              : 0;
          const lastMessageAtMs =
            typeof entry.lastMessageAt === "string" && Number.isFinite(Date.parse(entry.lastMessageAt))
              ? Date.parse(entry.lastMessageAt)
              : 0;
          const updatedAtMs =
            typeof entry.updatedAt === "string" && Number.isFinite(Date.parse(entry.updatedAt))
              ? Date.parse(entry.updatedAt)
              : 0;
          return { messageCount, lastMessageAtMs, updatedAtMs };
        };
        const compareConversations = (
          left: (typeof allConversations)[number],
          right: (typeof allConversations)[number],
        ) => {
          const leftScore = conversationScore(left);
          const rightScore = conversationScore(right);
          if (leftScore.messageCount !== rightScore.messageCount) {
            return leftScore.messageCount - rightScore.messageCount;
          }
          if (leftScore.lastMessageAtMs !== rightScore.lastMessageAtMs) {
            return leftScore.lastMessageAtMs - rightScore.lastMessageAtMs;
          }
          return leftScore.updatedAtMs - rightScore.updatedAtMs;
        };
        const pickBestConversation = (candidates: Array<(typeof allConversations)[number]>) =>
          candidates
            .slice()
            .sort((left, right) => compareConversations(right, left))[0] ?? null;

        const matchesTargetedAgent = (entry: (typeof allConversations)[number]) => {
          const meta = entry.metadata;
          if (!meta || typeof meta !== "object") return false;
          const record = meta as Record<string, unknown>;
          const targeted =
            typeof record.targeted_agent_id === "string"
              ? record.targeted_agent_id
              : typeof record.targetedAgentId === "string"
                ? record.targetedAgentId
                : null;
          return targeted === targetedAgentId;
        };

        let selected = pickBestConversation(
          allConversations.filter((entry) => entry.runtimeConversationId === runtimeConversationId),
        );
        if (!selected && legacyRuntimeConversationId) {
          selected = pickBestConversation(
            allConversations.filter(
              (entry) => entry.runtimeConversationId === legacyRuntimeConversationId,
            ),
          );
        }
        if (isAgentDetail && targetedAgentId) {
          const targetedBest = pickBestConversation(
            allConversations.filter((entry) => matchesTargetedAgent(entry)),
          );
          if (targetedBest && (!selected || compareConversations(targetedBest, selected) > 0)) {
            selected = targetedBest;
          }
        }
        if (isAgentDetail && conversationAgentId) {
          const sameAgentBest = pickBestConversation(
            allConversations.filter((entry) => entry.agentId === conversationAgentId),
          );
          if (sameAgentBest && (!selected || compareConversations(sameAgentBest, selected) > 0)) {
            selected = sameAgentBest;
          }
          const selectedMessageCount = selected ? conversationScore(selected).messageCount : 0;
          if (selectedMessageCount === 0) {
            const nonEmptyBest = pickBestConversation(
              allConversations.filter((entry) => {
                if (conversationScore(entry).messageCount <= 0) return false;
                if (entry.agentId === conversationAgentId) return true;
                if (targetedAgentId && matchesTargetedAgent(entry)) return true;
                return false;
              }),
            );
            if (nonEmptyBest) {
              selected = nonEmptyBest;
            }
          }
        }
        if (!selected) {
          const createResponse = await fetch(`/api/workspaces/${workspaceSlug}/conversations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: conversationAgentId,
              source: conversationSource,
              title: targetedAgentName ? `Agente: ${targetedAgentName}` : "Agentes",
              runtimeConversationId,
              metadata: {
                panel: "agents_tab",
                panel_scope: panelScope,
                operator_mode: operatorMode,
                targeted_agent_id: targetedAgentId ?? null,
              },
            }),
          });
          const createPayload = (await createResponse.json().catch(() => ({}))) as {
            error?: string;
            conversation?: {
              id: string;
              title: string;
              runtimeConversationId: string;
            };
          };
          if (!createResponse.ok || !createPayload.conversation) {
            throw new Error(createPayload.error ?? "No se pudo crear la conversacion.");
          }
          selected = createPayload.conversation;
        }

        const messagesResponse = await fetch(
          `/api/workspaces/${workspaceSlug}/conversations/${selected.id}/messages`,
          { cache: "no-store" },
        );
        const messagesPayload = (await messagesResponse.json().catch(() => ({}))) as {
          error?: string;
          messages?: Array<{
            id: string;
            role: string;
            content: string;
          }>;
        };
        if (!messagesResponse.ok) {
          throw new Error(messagesPayload.error ?? "No se pudo cargar los mensajes.");
        }
        const loadedMessages: ChatMessage[] = (messagesPayload.messages ?? [])
          .filter((msg) => msg.role === "user" || msg.role === "assistant")
          .map((msg) => ({
            id: msg.id,
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content ?? "",
          }));

        if (!active) return;
        setConversation({
          id: selected.id,
          runtimeConversationId: selected.runtimeConversationId,
          title: selected.title,
        });
        setMessages(loadedMessages.length > 0 ? loadedMessages : greetingMessage);
      } catch (err) {
        if (!active) return;
        setConversation(null);
        setMessages(greetingMessage);
        setError(err instanceof Error ? err.message : "No se pudo cargar el chat.");
      } finally {
        if (active) {
          setIsLoadingConversation(false);
        }
      }
    }
    void loadConversation();
    return () => {
      active = false;
    };
  }, [
    conversationSource,
    legacyRuntimeConversationId,
    greetingMessage,
    isAgentDetail,
    panelScope,
    operatorMode,
    conversationAgentId,
    runtimeConversationId,
    targetedAgentId,
    targetedAgentName,
    workspaceSlug,
  ]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!agentUpdateNotice) return;
    const timeout = window.setTimeout(() => setAgentUpdateNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [agentUpdateNotice]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || isSending) return;
      const executionAgentId = isAgentDetail
        ? (conversationAgentId ?? primaryAgentId)
        : (primaryAgentId ?? conversationAgentId);
      if (!executionAgentId) {
        setError("Aun no hay un CEO designado en este workspace.");
        return;
      }
      if (!conversation?.runtimeConversationId) {
        setError("La conversacion aun se esta preparando.");
        return;
      }

      setError(null);
      setIsSending(true);
      const conversationId = conversation.runtimeConversationId;

      const userId_msg = `user-${Date.now()}`;
      const assistantId = `assistant-${Date.now()}`;
      const isWebLookup = composerMode === "web";
      const userContent = isWebLookup ? `[Integrations] ${trimmed}` : trimmed;
      setMessages((prev) => [
        ...prev,
        { id: userId_msg, role: "user", content: userContent },
        { id: assistantId, role: "assistant", content: "Pensando..." },
      ]);
      setInput("");

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            agentId: executionAgentId,
            conversationId,
            conversationSource,
            appContext: {
              current_tab: "agents",
              current_object: null,
              current_view: null,
              current_record_title: null,
              queue_preview: [],
              targeted_agent_id: targetedAgentId ?? null,
              targeted_agent_name: targetedAgentName ?? null,
              workspace_slug: workspaceSlug,
              operator_mode: operatorMode === "agent_detail" ? "agent_detail" : "operator_overview",
              panel_scope: panelScope,
            },
            toolIntent: isWebLookup
              ? {
                  kind: "web_lookup",
                  mode: "web",
                  query: trimmed,
                }
              : null,
            message: trimmed,
            attachmentRefs: pendingAttachments.map((entry) => ({
              kind: entry.kind,
              id: entry.id,
            })),
          }),
        });

        if (!response.ok || !response.body) {
          const failurePayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(failurePayload.error ?? "No se pudo conectar con el copilot.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";
        let latestAppliedSoulMd: string | null = null;
        let ranAgentUpdateTool = false;
        let ranSoulUpdateTool = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { remainder, dataLines } = consumeCompleteSseDataLines(buffer);
          buffer = remainder;

          for (const raw of dataLines) {
            if (raw === "[DONE]") continue;
            let payload: {
              type?: string;
              content?: string;
              text?: string;
              error?: string;
              agent?: unknown;
              toolName?: string;
              name?: string;
              result?: unknown;
            };
            try {
              payload = JSON.parse(raw) as typeof payload;
            } catch {
              continue;
            }
            if (payload.type === "agent_snapshot" && onAgentUpdated) {
              const candidate = payload.agent;
              const fromSoulUpdate = payload.toolName === "agents.update_soul";
              if (
                candidate &&
                typeof candidate === "object" &&
                typeof (candidate as { id?: unknown }).id === "string"
              ) {
                const normalizedAgent = normalizeAgentSnapshot(candidate as Record<string, unknown>);
                onAgentUpdated(normalizedAgent);
                setAgentUpdateNotice(
                  payload.toolName === "agents.update_jobs"
                    ? "Triggers del agente actualizados."
                    : payload.toolName === "agents.update_identity"
                      ? "Perfil del agente actualizado."
                    : payload.toolName === "agents.update_connections"
                      ? "Conexiones del agente actualizadas."
                      : payload.toolName === "agents.update_knowledge"
                        ? "Knowledge del agente actualizada."
                        : payload.toolName === "agents.update_skills"
                          ? "Capabilities del agente actualizadas."
                          : payload.toolName === "agents.update_soul"
                            ? "SOUL del agente actualizada."
                            : "Configuracion del agente actualizada.",
                );
                const soulCandidate =
                  typeof normalizedAgent.soulMd === "string"
                    ? normalizedAgent.soulMd
                    : typeof (candidate as { soul_md?: unknown }).soul_md === "string"
                      ? (candidate as { soul_md: string }).soul_md
                      : "";
                if (fromSoulUpdate && soulCandidate.trim().length > 0) {
                  latestAppliedSoulMd = soulCandidate.trim();
                }
              }
              continue;
            }
            if (payload.type === "tool_result" && typeof payload.name === "string") {
              const resultRecord =
                payload.result && typeof payload.result === "object"
                  ? (payload.result as { ok?: unknown })
                  : null;
              if (payload.name.startsWith("agents.update_") && resultRecord?.ok === true) {
                ranAgentUpdateTool = true;
                if (payload.name === "agents.update_soul") {
                  ranSoulUpdateTool = true;
                }
              }
              continue;
            }
            const piece =
              typeof payload.content === "string"
                ? payload.content
                : typeof payload.text === "string"
                  ? payload.text
                  : "";
            if (payload.type === "delta" && piece) {
              assistantContent = stripInlineToolCallsFromText(`${assistantContent}${piece}`);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: assistantContent } : msg,
                ),
              );
            }
            if (payload.type === "error") {
              throw new Error(payload.error ?? "Error al generar respuesta.");
            }
          }
        }

        if (onAgentUpdated && targetedAgentId && ranAgentUpdateTool) {
          try {
            const syncResponse = await fetch(
              `/api/workspaces/${workspaceSlug}/agents/${targetedAgentId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skipCron: true }),
              },
            );
            const syncPayload = (await syncResponse.json().catch(() => ({}))) as {
              agent?: unknown;
            };
            if (
              syncResponse.ok &&
              syncPayload.agent &&
              typeof syncPayload.agent === "object" &&
              typeof (syncPayload.agent as { id?: unknown }).id === "string"
            ) {
              const normalizedAgent = normalizeAgentSnapshot(
                syncPayload.agent as Record<string, unknown>,
              );
              onAgentUpdated(normalizedAgent);
              if (ranSoulUpdateTool && typeof normalizedAgent.soulMd === "string") {
                const fetchedSoul = normalizedAgent.soulMd.trim();
                if (fetchedSoul) {
                  latestAppliedSoulMd = fetchedSoul;
                }
              }
            }
          } catch {
            // Best-effort sync path only.
          }
        }

        if (latestAppliedSoulMd) {
          const soulEcho = `\n\nSOUL aplicado:\n${latestAppliedSoulMd}`;
          assistantContent = `${assistantContent}${soulEcho}`.trim();
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: assistantContent } : msg,
            ),
          );
        }

        if (!assistantContent.trim()) {
          assistantContent = "Listo.";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: assistantContent } : msg,
            ),
          );
        }
        setPendingAttachments([]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido.";
        setError(message);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: `(error: ${message})` }
              : msg,
          ),
        );
      } finally {
        setIsSending(false);
      }
    },
    [
      conversationSource,
      composerMode,
      conversation?.runtimeConversationId,
      isAgentDetail,
      isSending,
      pendingAttachments,
      primaryAgentId,
      conversationAgentId,
      targetedAgentId,
      targetedAgentName,
      operatorMode,
      panelScope,
      onAgentUpdated,
      workspaceId,
      workspaceSlug,
    ],
  );

  const uploadDocument = useCallback(
    async (file: File) => {
      const executionAgentId = isAgentDetail
        ? (conversationAgentId ?? primaryAgentId)
        : (primaryAgentId ?? conversationAgentId);
      if (!executionAgentId || !conversation || isUploading) return;
      setIsUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionTitle", conversation.title);
        formData.append("conversationId", conversation.runtimeConversationId);
        formData.append("workspaceConversationId", conversation.id);
        formData.append("agentId", executionAgentId);
        formData.append("kind", inferDocumentKind(file));

        const response = await fetch(`/api/workspaces/${workspaceSlug}/documents`, {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          recordId?: string;
          documentName?: string;
          publicUrl?: string;
          contentType?: string;
          fileKind?: string;
        };
        if (!response.ok || !payload.recordId || !payload.documentName || !payload.publicUrl) {
          throw new Error(payload.error ?? "No se pudo subir el documento.");
        }

        const nextAttachment: AttachmentRef = {
          kind: "record",
          id: payload.recordId,
          label: payload.documentName,
        };
        setPendingAttachments((prev) => {
          const already = prev.some((entry) => entry.id === nextAttachment.id);
          if (already) return prev;
          return [...prev, nextAttachment];
        });

        const summary = `Documento subido: ${payload.documentName}. Ya lo puedes usar en el chat.`;
        const assistantMessage: ChatMessage = {
          id: `upload-${Date.now()}`,
          role: "assistant",
          content: summary,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        void fetch(`/api/workspaces/${workspaceSlug}/conversations/${conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: summary,
            attachments: [
              {
                id: payload.recordId,
                fileName: payload.documentName,
                publicUrl: payload.publicUrl,
                contentType: payload.contentType ?? file.type ?? "application/octet-stream",
                fileKind: payload.fileKind ?? inferDocumentKind(file),
              },
            ],
            metadata: {
              uploaded_via: "agents_tab_chat",
              targeted_agent_id: targetedAgentId ?? null,
            },
          }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir el documento.");
      } finally {
        setIsUploading(false);
      }
    },
    [
      conversation,
      isAgentDetail,
      isUploading,
      primaryAgentId,
      conversationAgentId,
      targetedAgentId,
      workspaceSlug,
    ],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  const headerName = primaryAgentName ?? "CEO Copilot";
  const resolvedHeaderName = isAgentDetail
    ? (targetedAgentName ?? "Agente")
    : headerName;
  const headerSubtitle = isAgentDetail
    ? "Edicion directa del agente en Operadores"
    : targetedAgentName
      ? `Editando ${targetedAgentName}`
      : primaryAgentId
        ? "Pregunta cualquier cosa o pide cambios en tus agentes"
        : "Asigna un CEO para empezar";
  const defaultPlaceholder = isAgentDetail
    ? `Describe el cambio para ${targetedAgentName ?? "este agente"}...`
    : "Escribe un mensaje...";

  return (
    <div style={shellStyle(variant)}>
      <div style={headerStyle}>
        <AgentGradientOrb seed={targetedAgentId ?? primaryAgentId ?? "ceo"} size={36} />
        <div style={headerTextStyle}>
          <p style={titleStyle}>{resolvedHeaderName}</p>
          <p style={subtitleStyle}>{headerSubtitle}</p>
        </div>
      </div>

      <div ref={scrollerRef} style={messagesScrollerStyle}>
        {agentUpdateNotice ? (
          <p
            style={{
              margin: 0,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(16,185,129,0.1)",
              color: "#0f8a52",
              fontSize: 12.5,
            }}
          >
            {agentUpdateNotice}
          </p>
        ) : null}
        {isLoadingConversation ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              padding: 24,
              color: "var(--workspace-muted)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Cargando historial...
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              padding: 24,
              color: "var(--workspace-muted)",
              fontSize: 13,
              gap: 8,
              textAlign: "center",
            }}
          >
            <Sparkles size={18} />
            <p style={{ margin: 0, fontWeight: 600, color: "var(--workspace-text)" }}>
              {emptyTitle ?? (isAgentDetail ? "Listo para editar este agente." : `Hola, ${headerName} esta listo.`)}
            </p>
            <p style={{ margin: 0, maxWidth: 360 }}>
              {emptySubtitle ??
                (isAgentDetail
                  ? "Pide cambios directos de SOUL, skills, triggers, knowledge o conexiones."
                  : "Pidele que cree o edite un agente, ajuste su SOUL, conecte una API o programe un job.")}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={msg.role === "user" ? userBubbleStyle : assistantBubbleStyle}
            >
              {msg.content}
            </div>
          ))
        )}
        {error ? (
          <p
            style={{
              fontSize: 12,
              color: "#b42318",
              margin: 0,
              padding: "6px 10px",
              background: "rgba(220,38,38,0.08)",
              borderRadius: 10,
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <div style={modeRowStyle}>
        <button
          type="button"
          style={modeButtonStyle(composerMode === "chat")}
          onClick={() => setComposerMode("chat")}
        >
          Workspace actions
        </button>
        <button
          type="button"
          style={modeButtonStyle(composerMode === "web")}
          onClick={() => setComposerMode("web")}
        >
          Browser search
        </button>
      </div>

      {pendingAttachments.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {pendingAttachments.map((attachment) => (
            <span
              key={attachment.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 999,
                background: "rgba(51, 92, 255, 0.12)",
                border: "1px solid rgba(51, 92, 255, 0.22)",
                color: "var(--workspace-text)",
                fontSize: 12,
              }}
            >
              @{attachment.label}
              <button
                type="button"
                onClick={() =>
                  setPendingAttachments((prev) => prev.filter((entry) => entry.id !== attachment.id))
                }
                style={{ all: "unset", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px" }}
                aria-label="Quitar referencia"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={composerStyle}>
        <button
          type="button"
          style={uploadButtonStyle(isUploading || !conversation)}
          disabled={isUploading || !conversation}
          onClick={() => uploadInputRef.current?.click()}
          aria-label={isUploading ? "Subiendo documento" : "Subir documento"}
          title={isUploading ? "Subiendo documento" : "Subir documento"}
        >
          {isUploading ? (
            <LoaderCircle size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Plus size={14} />
          )}
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            composerMode === "web"
              ? `Consulta web para ${resolvedHeaderName}...`
              : (placeholder ?? defaultPlaceholder)
          }
          rows={1}
          style={textareaStyle}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim() || !primaryAgentId || !conversation}
          style={sendButtonStyle(isSending || !input.trim() || !primaryAgentId || !conversation)}
          aria-label="Enviar"
        >
          {isSending ? (
            <LoaderCircle size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <ArrowUp size={16} />
          )}
        </button>
        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </form>
      <input
        ref={uploadInputRef}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadDocument(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
