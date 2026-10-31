"use client";

import Link from "next/link";
import {
  Mail,
  MessageCircle,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Reply,
  Search,
  Send,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createInboxMockState } from "@/components/workspace/inbox/mockData";
import type {
  InboxChannel,
  InboxCrmContext,
  InboxMessage,
  InboxMessageDirection,
  InboxQueue,
  InboxThread,
  InboxThreadStatus,
} from "@/components/workspace/inbox/types";

type Props = {
  workspaceSlug: string;
  currentUserEmail?: string | null;
};

type LayoutMode = "wide" | "stacked";
type ComposeMode = "reply" | "note";

const ACCENT_SOFT = "var(--workspace-accent-soft)";
const ACCENT = "var(--workspace-accent)";
const ACCENT_STRONG = "var(--workspace-accent-strong)";
const SUCCESS_BG = "rgba(16,185,129,0.12)";
const SUCCESS_BORDER = "rgba(16,185,129,0.22)";
const SUCCESS_TEXT = "#0f8a52";
const WARNING_BG = "rgba(245,158,11,0.14)";
const WARNING_BORDER = "rgba(245,158,11,0.24)";
const WARNING_TEXT = "#b15e05";

const channelOptions: Array<{ id: InboxChannel | "all"; label: string }> = [
  { id: "all", label: "All channels" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
];

const queueOptions: Array<{ id: InboxQueue; label: string }> = [
  { id: "all", label: "All threads" },
  { id: "open", label: "Open" },
  { id: "unread", label: "Unread" },
  { id: "assigned", label: "Assigned" },
];

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 18,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  textTransform: "uppercase",
  fontWeight: 600,
  letterSpacing: 0.6,
  fontSize: 11,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontSize: 26,
  fontWeight: 700,
};

const subtitleStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
  maxWidth: 720,
  lineHeight: 1.5,
};

const glassPanelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.62)",
  borderRadius: 22,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(255,255,255,0.64) 100%)",
  backdropFilter: "blur(18px) saturate(1.05)",
  WebkitBackdropFilter: "blur(18px) saturate(1.05)",
  boxShadow:
    "0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 40px -18px rgba(15,23,42,0.18), 0 1px 4px rgba(15,23,42,0.04)",
  padding: 16,
  display: "grid",
  gap: 12,
  alignContent: "start",
  minWidth: 0,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const sectionCopyStyle: CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const labelStyle: CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const emptyStateStyle: CSSProperties = {
  border: "1px dashed var(--workspace-border)",
  borderRadius: 14,
  background: "var(--workspace-panel-soft)",
  padding: 14,
  display: "grid",
  gap: 6,
  justifyItems: "start",
};

function statPillStyle(
  tone: "neutral" | "accent" | "success" | "warning",
): CSSProperties {
  const base: CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid var(--workspace-border)",
  };
  if (tone === "accent") {
    return {
      ...base,
      background: ACCENT_SOFT,
      borderColor: "rgba(51,92,255,0.22)",
      color: ACCENT_STRONG,
    };
  }
  if (tone === "success") {
    return {
      ...base,
      background: SUCCESS_BG,
      borderColor: SUCCESS_BORDER,
      color: SUCCESS_TEXT,
    };
  }
  if (tone === "warning") {
    return {
      ...base,
      background: WARNING_BG,
      borderColor: WARNING_BORDER,
      color: WARNING_TEXT,
    };
  }
  return {
    ...base,
    background: "var(--workspace-panel-soft)",
    color: "var(--workspace-text)",
  };
}

function filterButtonStyle(active: boolean): CSSProperties {
  return {
    borderRadius: 10,
    border: active
      ? "1px solid rgba(51,92,255,0.32)"
      : "1px solid var(--workspace-border)",
    background: active ? ACCENT_SOFT : "var(--workspace-panel-soft)",
    color: active ? ACCENT_STRONG : "var(--workspace-text)",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "8px 12px",
    cursor: "pointer",
    transition: "all 140ms ease",
    textAlign: "left",
    width: "100%",
  };
}

function channelBadgeStyle(channel: InboxChannel): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 999,
    padding: "3px 9px",
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    display: "inline-block",
    width: "fit-content",
  };
  if (channel === "whatsapp") {
    return {
      ...base,
      background: SUCCESS_BG,
      color: SUCCESS_TEXT,
      border: `1px solid ${SUCCESS_BORDER}`,
    };
  }
  return {
    ...base,
    background: ACCENT_SOFT,
    color: ACCENT_STRONG,
    border: "1px solid rgba(51,92,255,0.22)",
  };
}

function threadStatusPillStyle(status: InboxThreadStatus): CSSProperties {
  if (status === "resolved") return statPillStyle("success");
  if (status === "pending") return statPillStyle("warning");
  return statPillStyle("accent");
}

function threadCardStyle(selected: boolean): CSSProperties {
  return {
    borderRadius: 14,
    border: selected
      ? "1px solid rgba(51,92,255,0.32)"
      : "1px solid var(--workspace-border)",
    background: selected ? ACCENT_SOFT : "var(--workspace-panel-soft)",
    padding: 12,
    display: "grid",
    gap: 8,
    textAlign: "left",
    cursor: "pointer",
    transition: "background 140ms ease, border 140ms ease",
    width: "100%",
  };
}

function bubbleWrapStyle(direction: InboxMessageDirection): CSSProperties {
  if (direction === "outbound") {
    return {
      display: "grid",
      justifyItems: "end",
      gap: 4,
    };
  }
  if (direction === "note") {
    return {
      display: "grid",
      justifyItems: "center",
      gap: 4,
    };
  }
  return {
    display: "grid",
    justifyItems: "start",
    gap: 4,
  };
}

function bubbleStyle(direction: InboxMessageDirection): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 16,
    padding: "9px 13px",
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxWidth: "min(560px, 78%)",
    color: "var(--workspace-text)",
  };
  if (direction === "outbound") {
    return {
      ...base,
      background: ACCENT,
      color: "white",
      border: "1px solid rgba(51,92,255,0.5)",
      borderBottomRightRadius: 6,
    };
  }
  if (direction === "note") {
    return {
      ...base,
      background: WARNING_BG,
      border: `1px dashed ${WARNING_BORDER}`,
      color: WARNING_TEXT,
      maxWidth: "min(520px, 70%)",
    };
  }
  return {
    ...base,
    background: "var(--workspace-panel)",
    border: "1px solid var(--workspace-border)",
    borderBottomLeftRadius: 6,
  };
}

function bubbleMetaStyle(direction: InboxMessageDirection): CSSProperties {
  return {
    margin: 0,
    fontSize: 10.5,
    color: "var(--workspace-muted)",
    textAlign: direction === "outbound" ? "right" : "left",
  };
}

function priorityPillStyle(priority: InboxCrmContext["priority"]): CSSProperties {
  if (priority === "high") return statPillStyle("warning");
  if (priority === "medium") return statPillStyle("accent");
  return statPillStyle("neutral");
}

function includeByQueue(thread: InboxThread, queue: InboxQueue) {
  if (queue === "open") return thread.status === "open" || thread.status === "pending";
  if (queue === "unread") return thread.unreadCount > 0;
  if (queue === "assigned") return Boolean(thread.assignee);
  return true;
}

function normalizeSearchToken(value: string) {
  return value.trim().toLowerCase();
}

function deriveSenderFromEmail(email: string | null | undefined) {
  if (!email) return "Workspace operator";
  const username = email.split("@")[0]?.trim();
  return username ? username : "Workspace operator";
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatusLabel(status: InboxThreadStatus) {
  if (status === "resolved") return "Resolved";
  if (status === "pending") return "Pending";
  return "Open";
}

function formatChannelLabel(channel: InboxChannel) {
  return channel === "email" ? "Email" : "WhatsApp";
}

export function InboxPanel({ workspaceSlug, currentUserEmail }: Props) {
  const seed = useMemo(() => createInboxMockState(workspaceSlug), [workspaceSlug]);
  const integrations = seed.integrations;
  const crmContextByThreadId = seed.crmContextByThreadId;

  const [threads, setThreads] = useState(seed.threads);
  const [messagesByThreadId, setMessagesByThreadId] = useState(seed.messagesByThreadId);

  const [selectedChannel, setSelectedChannel] = useState<InboxChannel | "all">("all");
  const [selectedQueue, setSelectedQueue] = useState<InboxQueue>("all");
  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    seed.threads[0]?.id ?? null,
  );

  const [composeMode, setComposeMode] = useState<ComposeMode>("reply");
  const [draft, setDraft] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("wide");
  const [crmOpen, setCrmOpen] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1180px)");
    const apply = () => {
      setLayoutMode(wide.matches ? "wide" : "stacked");
    };
    apply();
    wide.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
    };
  }, []);

  const activeChannelThreads = useMemo(() => {
    if (selectedChannel === "all") return threads;
    return threads.filter((thread) => thread.channel === selectedChannel);
  }, [selectedChannel, threads]);

  const queueCounts = useMemo(
    () => ({
      all: activeChannelThreads.length,
      open: activeChannelThreads.filter((thread) => includeByQueue(thread, "open")).length,
      unread: activeChannelThreads.filter((thread) => includeByQueue(thread, "unread")).length,
      assigned: activeChannelThreads.filter((thread) => includeByQueue(thread, "assigned")).length,
    }),
    [activeChannelThreads],
  );

  const filteredThreads = useMemo(() => {
    const token = normalizeSearchToken(search);
    return activeChannelThreads
      .filter((thread) => includeByQueue(thread, selectedQueue))
      .filter((thread) => {
        if (!token) return true;
        return (
          normalizeSearchToken(thread.participantName).includes(token) ||
          normalizeSearchToken(thread.participantAddress).includes(token) ||
          normalizeSearchToken(thread.title).includes(token) ||
          normalizeSearchToken(thread.preview).includes(token) ||
          thread.tags.some((tag) => normalizeSearchToken(tag).includes(token))
        );
      })
      .sort(
        (left, right) =>
          new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
      );
  }, [activeChannelThreads, search, selectedQueue]);

  const effectiveSelectedThreadId = useMemo(() => {
    if (filteredThreads.some((thread) => thread.id === selectedThreadId)) {
      return selectedThreadId;
    }
    return filteredThreads[0]?.id ?? null;
  }, [filteredThreads, selectedThreadId]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === effectiveSelectedThreadId) ?? null,
    [effectiveSelectedThreadId, threads],
  );

  const selectedMessages = useMemo<InboxMessage[]>(() => {
    if (!selectedThread) return [];
    return messagesByThreadId[selectedThread.id] ?? [];
  }, [messagesByThreadId, selectedThread]);

  const selectedCrmContext = useMemo(() => {
    if (!selectedThread) return null;
    return crmContextByThreadId[selectedThread.id] ?? null;
  }, [crmContextByThreadId, selectedThread]);

  const unreadCount = useMemo(
    () => threads.reduce((accumulator, thread) => accumulator + thread.unreadCount, 0),
    [threads],
  );
  const openCount = useMemo(
    () =>
      threads.filter((thread) => thread.status === "open" || thread.status === "pending").length,
    [threads],
  );

  function pushMockMessage() {
    if (!effectiveSelectedThreadId) return;
    const body = draft.trim();
    if (!body) return;
    const createdAt = new Date().toISOString();
    const nextMessage: InboxMessage = {
      id: `mock-${effectiveSelectedThreadId}-${Date.now()}`,
      threadId: effectiveSelectedThreadId,
      direction: composeMode === "reply" ? "outbound" : "note",
      sender:
        composeMode === "reply"
          ? deriveSenderFromEmail(currentUserEmail)
          : "Internal note",
      body,
      createdAt,
    };

    setMessagesByThreadId((previous) => ({
      ...previous,
      [effectiveSelectedThreadId]: [
        ...(previous[effectiveSelectedThreadId] ?? []),
        nextMessage,
      ],
    }));

    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === effectiveSelectedThreadId
          ? {
              ...thread,
              preview: body,
              unreadCount: 0,
              lastMessageAt: createdAt,
              status: thread.status === "resolved" ? "open" : thread.status,
              assignee: thread.assignee ?? deriveSenderFromEmail(currentUserEmail),
            }
          : thread,
      ),
    );

    setDraft("");
    setComposeMode("reply");
  }

  function markSelectedThreadResolved() {
    if (!effectiveSelectedThreadId) return;
    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === effectiveSelectedThreadId
          ? { ...thread, status: "resolved", unreadCount: 0 }
          : thread,
      ),
    );
  }

  const isWide = layoutMode === "wide";
  const conversationGridStyle: CSSProperties = isWide
    ? {
        display: "grid",
        gap: 14,
        gridTemplateColumns: crmOpen
          ? "minmax(220px, 250px) minmax(290px, 340px) minmax(0, 1fr) minmax(280px, 320px)"
          : "minmax(220px, 250px) minmax(290px, 340px) minmax(0, 1fr)",
        alignItems: "stretch",
      }
    : {
        display: "grid",
        gap: 14,
        gridTemplateColumns: "minmax(0, 1fr)",
      };

  return (
    <div style={stackStyle}>
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Operadores inbox</p>
          <h1 style={titleStyle}>Centralized Inbox</h1>
          <p style={subtitleStyle}>
            Unified Email + WhatsApp Business conversation workspace with direct CRM context.
          </p>
        </div>
        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <span style={statPillStyle("neutral")}>{threads.length} threads</span>
          <span style={statPillStyle("warning")}>{unreadCount} unread</span>
          <span style={statPillStyle("accent")}>{openCount} open</span>
          <span style={statPillStyle("success")}>
            {integrations.emailConnected && integrations.whatsappConnected
              ? "Channels ready"
              : "Setup pending"}
          </span>
        </div>
      </div>

      <div style={conversationGridStyle}>
        {/* Routing rail */}
        <aside style={glassPanelStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <h3 style={sectionTitleStyle}>Routing</h3>
            <p style={sectionCopyStyle}>
              Centralize Email and WhatsApp inboxes before routing into CRM.
            </p>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <p style={labelStyle}>Search conversation</p>
            <span
              style={{
                border: "1px solid var(--workspace-border)",
                borderRadius: 10,
                background: "var(--workspace-panel-soft)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px",
              }}
            >
              <Search size={14} color="var(--workspace-muted)" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Customer, email, phone..."
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  width: "100%",
                  color: "var(--workspace-text)",
                  fontSize: 12.5,
                }}
              />
            </span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <p style={labelStyle}>Channels</p>
            <div style={{ display: "grid", gap: 6 }}>
              {channelOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedChannel(option.id)}
                  style={filterButtonStyle(selectedChannel === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <p style={labelStyle}>Queues</p>
            <div style={{ display: "grid", gap: 6 }}>
              {queueOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedQueue(option.id)}
                  style={filterButtonStyle(selectedQueue === option.id)}
                >
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{option.label}</span>
                    <span style={{ color: "var(--workspace-muted)", fontSize: 11.5 }}>
                      {queueCounts[option.id]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <p style={labelStyle}>Integrations</p>
            <IntegrationRow
              icon={<Mail size={14} />}
              label="Email"
              description="Inbound + outbound customer communication."
              connected={integrations.emailConnected}
            />
            <IntegrationRow
              icon={<MessageCircle size={14} />}
              label="WhatsApp Business"
              description="Real-time text threads with contact identity."
              connected={integrations.whatsappConnected}
            />
          </div>
        </aside>

        {/* Thread list rail */}
        <section style={{ ...glassPanelStyle, minHeight: 560 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <h3 style={sectionTitleStyle}>Conversations</h3>
            <p style={sectionCopyStyle}>Sorted by most recent message.</p>
          </div>

          {filteredThreads.length === 0 ? (
            <div style={emptyStateStyle}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--workspace-text)",
                }}
              >
                No threads match this filter
              </p>
              <p style={mutedTextStyle}>
                Try another queue or channel to surface active conversations.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 8,
                maxHeight: 720,
                overflowY: "auto",
                paddingRight: 2,
              }}
              className="workspace-chat-messages"
            >
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                  style={threadCardStyle(effectiveSelectedThreadId === thread.id)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "grid", gap: 4 }}>
                      <span style={channelBadgeStyle(thread.channel)}>
                        {formatChannelLabel(thread.channel)}
                      </span>
                      <p
                        style={{
                          margin: 0,
                          color: "var(--workspace-text)",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {thread.participantName}
                      </p>
                    </div>
                    <span
                      style={{
                        margin: 0,
                        fontSize: 11.5,
                        color: "var(--workspace-muted)",
                      }}
                    >
                      {formatTimestamp(thread.lastMessageAt)}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: 3 }}>
                    <p
                      style={{
                        margin: 0,
                        color: "var(--workspace-text)",
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      {thread.title}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: "var(--workspace-muted)",
                        fontSize: 12,
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {thread.preview}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={threadStatusPillStyle(thread.status)}>
                      {formatStatusLabel(thread.status)}
                    </span>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {thread.unreadCount > 0 ? (
                        <span
                          style={{
                            minWidth: 18,
                            height: 18,
                            borderRadius: 999,
                            background: ACCENT_SOFT,
                            color: ACCENT_STRONG,
                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "0 6px",
                          }}
                        >
                          {thread.unreadCount}
                        </span>
                      ) : null}
                      <span
                        style={{
                          margin: 0,
                          fontSize: 11.5,
                          color: "var(--workspace-muted)",
                        }}
                      >
                        {thread.assignee ? thread.assignee : "Unassigned"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Conversation panel */}
        <section
          style={{
            ...glassPanelStyle,
            minHeight: 560,
            gridTemplateRows: "auto 1fr auto",
          }}
        >
          {selectedThread ? (
            <>
              <header style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <span style={channelBadgeStyle(selectedThread.channel)}>
                      {formatChannelLabel(selectedThread.channel)}
                    </span>
                    <h3 style={sectionTitleStyle}>{selectedThread.title}</h3>
                    <p style={sectionCopyStyle}>
                      {selectedThread.participantName} · {selectedThread.participantAddress}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setCrmOpen((value) => !value)}
                      style={{
                        borderRadius: 10,
                        border: crmOpen
                          ? "1px solid rgba(51,92,255,0.32)"
                          : "1px solid var(--workspace-border)",
                        background: crmOpen ? ACCENT_SOFT : "var(--workspace-panel-soft)",
                        color: crmOpen ? ACCENT_STRONG : "var(--workspace-text)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "7px 10px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                      aria-expanded={crmOpen}
                      aria-label={crmOpen ? "Hide CRM context" : "Show CRM context"}
                    >
                      {crmOpen ? (
                        <PanelRightClose size={13} />
                      ) : (
                        <PanelRightOpen size={13} />
                      )}
                      {crmOpen ? "Hide CRM context" : "CRM context"}
                    </button>
                    <button
                      type="button"
                      onClick={markSelectedThreadResolved}
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--workspace-border)",
                        background: "var(--workspace-panel-soft)",
                        color: "var(--workspace-text)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "7px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Mark resolved
                    </button>
                  </div>
                </div>
              </header>

              <div
                className="workspace-chat-messages"
                style={{
                  borderRadius: 16,
                  border: "1px solid var(--workspace-border)",
                  background: "var(--workspace-well)",
                  padding: 14,
                  display: "grid",
                  gap: 8,
                  alignContent: "start",
                  overflowY: "auto",
                  minHeight: 0,
                }}
              >
                {selectedMessages.length === 0 ? (
                  <div style={emptyStateStyle}>
                    <p
                      style={{
                        margin: 0,
                        color: "var(--workspace-text)",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      No messages yet
                    </p>
                    <p style={mutedTextStyle}>
                      Conversation history will appear here once new messages arrive.
                    </p>
                  </div>
                ) : (
                  selectedMessages.map((message) => (
                    <div key={message.id} style={bubbleWrapStyle(message.direction)}>
                      <article style={bubbleStyle(message.direction)}>{message.body}</article>
                      <p style={bubbleMetaStyle(message.direction)}>
                        {message.direction === "note"
                          ? "Internal note"
                          : message.sender}
                        {" · "}
                        {formatTimestamp(message.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "inline-flex", gap: 6 }}>
                  <ComposeModeButton
                    active={composeMode === "reply"}
                    onClick={() => setComposeMode("reply")}
                    icon={<Reply size={13} />}
                    label="Reply"
                  />
                  <ComposeModeButton
                    active={composeMode === "note"}
                    onClick={() => setComposeMode("note")}
                    icon={<MessageSquareText size={13} />}
                    label="Internal note"
                  />
                </div>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder={
                    composeMode === "reply"
                      ? "Draft a reply (UI scaffold mode)..."
                      : "Capture an internal note for handoff..."
                  }
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid var(--workspace-border)",
                    padding: "10px 12px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "vertical",
                    background: "var(--workspace-panel-soft)",
                    color: "var(--workspace-text)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <p style={mutedTextStyle}>
                    UI scaffold mode: messages are only simulated in local state.
                  </p>
                  <button
                    type="button"
                    onClick={pushMockMessage}
                    disabled={!draft.trim()}
                    style={{
                      borderRadius: 10,
                      border: "none",
                      background: draft.trim() ? ACCENT : "var(--workspace-faint)",
                      color: "white",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: "8px 12px",
                      cursor: draft.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    <Send size={13} />
                    {composeMode === "reply" ? "Send reply" : "Save note"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={emptyStateStyle}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--workspace-text)",
                }}
              >
                Select a thread
              </p>
              <p style={mutedTextStyle}>
                Pick any Email or WhatsApp conversation to open the transcript and CRM context.
              </p>
            </div>
          )}
        </section>

        {/* CRM drawer (hidden by default; opened from conversation header) */}
        {isWide && crmOpen ? (
          <aside style={{ ...glassPanelStyle, minHeight: 560 }}>
            <CrmContent
              thread={selectedThread}
              context={selectedCrmContext}
              onClose={() => setCrmOpen(false)}
            />
          </aside>
        ) : null}

        {/* On stacked layouts, render CRM under conversation when toggled */}
        {!isWide && crmOpen ? (
          <aside style={glassPanelStyle}>
            <CrmContent
              thread={selectedThread}
              context={selectedCrmContext}
              onClose={() => setCrmOpen(false)}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function IntegrationRow({
  icon,
  label,
  description,
  connected,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  connected: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: connected
          ? `1px solid ${SUCCESS_BORDER}`
          : "1px solid var(--workspace-border)",
        background: connected ? SUCCESS_BG : "var(--workspace-panel-soft)",
        padding: "10px 12px",
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--workspace-text)",
            fontWeight: 600,
            fontSize: 12.5,
          }}
        >
          <span style={{ color: connected ? SUCCESS_TEXT : "var(--workspace-muted)" }}>
            {icon}
          </span>
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: connected ? SUCCESS_TEXT : "var(--workspace-muted)",
            fontWeight: 600,
          }}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <p style={mutedTextStyle}>{description}</p>
    </div>
  );
}

function ComposeModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        border: active
          ? "1px solid rgba(51,92,255,0.32)"
          : "1px solid var(--workspace-border)",
        background: active ? ACCENT_SOFT : "var(--workspace-panel-soft)",
        color: active ? ACCENT_STRONG : "var(--workspace-text)",
        fontSize: 12,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function CrmContent({
  thread,
  context,
  onClose,
}: {
  thread: InboxThread | null;
  context: InboxCrmContext | null;
  onClose: () => void;
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={sectionTitleStyle}>CRM context</h3>
          <p style={sectionCopyStyle}>
            Review the linked record before replying.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            borderRadius: 10,
            border: "1px solid var(--workspace-border)",
            background: "var(--workspace-panel-soft)",
            color: "var(--workspace-text)",
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 10px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          aria-label="Close CRM context"
        >
          <PanelRightClose size={13} />
        </button>
      </div>

      {!thread ? (
        <div style={emptyStateStyle}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--workspace-text)",
            }}
          >
            No thread selected
          </p>
          <p style={mutedTextStyle}>Select a conversation to display linked CRM data.</p>
        </div>
      ) : null}

      {thread && !context ? (
        <div style={emptyStateStyle}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--workspace-text)",
            }}
          >
            CRM record not linked yet
          </p>
          <p style={mutedTextStyle}>
            Create a CRM contact/deal link during implementation to unlock timeline and
            record actions.
          </p>
        </div>
      ) : null}

      {thread && context ? (
        <>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid var(--workspace-border)",
              background: "var(--workspace-panel-soft)",
              padding: "12px 12px",
              display: "grid",
              gap: 6,
            }}
          >
            <p
              style={{
                margin: 0,
                color: "var(--workspace-text)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {context.recordTitle}
            </p>
            <p style={mutedTextStyle}>{context.recordSubtitle}</p>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              <span style={priorityPillStyle(context.priority)}>
                Priority {context.priority}
              </span>
              <span style={{ ...mutedTextStyle, fontSize: 12 }}>
                Owner: {context.owner}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p style={labelStyle}>Record fields</p>
            <div style={{ display: "grid", gap: 6 }}>
              {context.fields.map((field) => (
                <div
                  key={field.label}
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--workspace-border)",
                    background: "var(--workspace-panel-soft)",
                    padding: "9px 10px",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11.5,
                      color: "var(--workspace-muted)",
                    }}
                  >
                    {field.label}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--workspace-text)",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p style={labelStyle}>Recent CRM activity</p>
            <div style={{ display: "grid", gap: 6 }}>
              {context.timeline.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--workspace-border)",
                    background: "var(--workspace-panel-soft)",
                    padding: "9px 10px",
                    display: "grid",
                    gap: 3,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "var(--workspace-text)",
                      fontWeight: 600,
                      fontSize: 12.5,
                    }}
                  >
                    {entry.title}
                  </p>
                  <p style={mutedTextStyle}>{entry.detail}</p>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--workspace-faint)",
                      fontSize: 11.5,
                    }}
                  >
                    {formatTimestamp(entry.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <p style={labelStyle}>CRM actions</p>
            <div style={{ display: "grid", gap: 6 }}>
              {context.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--workspace-border)",
                    background: "var(--workspace-panel-soft)",
                    color: "var(--workspace-text)",
                    textDecoration: "none",
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: "8px 10px",
                  }}
                >
                  {link.label}
                </Link>
              ))}
              {thread.crmLink ? (
                <Link
                  href={thread.crmLink.href}
                  style={{
                    borderRadius: 10,
                    border: "1px solid rgba(51,92,255,0.28)",
                    background: ACCENT_SOFT,
                    color: ACCENT_STRONG,
                    textDecoration: "none",
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: "8px 10px",
                  }}
                >
                  Open linked record: {thread.crmLink.label}
                </Link>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
