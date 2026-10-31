"use client";

import { ArrowUpRight } from "lucide-react";

const HERMES_DOCS_BASE = "https://hermes-agent.nousresearch.com/docs";

export type HermesDocsTopic =
  | "personality"
  | "skills"
  | "memory"
  | "messaging"
  | "mcp"
  | "tools"
  | "automations"
  | "voice"
  | "home";

const TOPIC_PATHS: Record<HermesDocsTopic, string> = {
  personality: "/user-guide/features/personality",
  skills: "/user-guide/features/skills",
  memory: "/user-guide/features/memory",
  messaging: "/user-guide/messaging",
  mcp: "/user-guide/features/mcp",
  tools: "/user-guide/features/tools",
  automations: "/user-guide/features/automations",
  voice: "/user-guide/features/voice-mode",
  home: "/",
};

type Props = {
  topic: HermesDocsTopic;
  label?: string;
};

export function HermesDocsLink({ topic, label = "ver docs" }: Props) {
  const href = `${HERMES_DOCS_BASE}${TOPIC_PATHS[topic]}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--workspace-muted)",
        textDecoration: "none",
        padding: "2px 6px",
        borderRadius: 999,
        border: "1px solid var(--workspace-border)",
        background: "rgba(255,255,255,0.6)",
      }}
    >
      {label}
      <ArrowUpRight size={11} />
    </a>
  );
}
