"use client";

import type { CSSProperties } from "react";
import { AgentGradientOrb } from "./AgentGradientOrb";

export type AgentGlassCardData = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
};

type Props = {
  agent: AgentGlassCardData;
  selected?: boolean;
  onSelect: (id: string) => void;
};

const cardStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 22,
  minHeight: 200,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.55)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.55) 100%)",
  backdropFilter: "blur(18px) saturate(1.05)",
  WebkitBackdropFilter: "blur(18px) saturate(1.05)",
  boxShadow:
    "0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 40px -18px rgba(15,23,42,0.18), 0 1px 4px rgba(15,23,42,0.04)",
  cursor: "pointer",
  textAlign: "left",
  transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
};

const selectedStyle: CSSProperties = {
  borderColor: "rgba(99, 102, 241, 0.55)",
  boxShadow:
    "0 1px 0 rgba(255,255,255,0.9) inset, 0 18px 48px -18px rgba(99,102,241,0.35), 0 0 0 2px rgba(99,102,241,0.12)",
};

const titleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--workspace-text)",
  lineHeight: 1.25,
  margin: 0,
};

const descStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "var(--workspace-muted)",
  margin: 0,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const statusDotStyle = (tone: string): CSSProperties => ({
  position: "absolute",
  top: 18,
  right: 18,
  width: 8,
  height: 8,
  borderRadius: "50%",
  background:
    tone === "active"
      ? "#10b981"
      : tone === "paused"
        ? "#f59e0b"
        : tone === "error"
          ? "#ef4444"
          : "#94a3b8",
  boxShadow: "0 0 0 3px rgba(255,255,255,0.7)",
});

export function AgentGlassCard({ agent, selected, onSelect }: Props) {
  const tone = agent.status?.toLowerCase() ?? "neutral";
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      style={{ ...cardStyle, ...(selected ? selectedStyle : {}) }}
    >
      <span style={statusDotStyle(tone)} aria-label={`status ${tone}`} />
      <AgentGradientOrb seed={agent.id} size={56} />
      <div style={{ display: "grid", gap: 6 }}>
        <h3 style={titleStyle}>{agent.name || "Agente"}</h3>
        <p style={descStyle}>
          {agent.description?.trim() || "Sin descripcion. Habla con el CEO para definir su rol."}
        </p>
      </div>
    </button>
  );
}
