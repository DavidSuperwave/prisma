"use client";

import type { CSSProperties } from "react";

type Props = {
  seed: string;
  size?: number;
  animated?: boolean;
};

const PALETTES: Array<[string, string, string, string]> = [
  ["#86efac", "#a7f3d0", "#7dd3fc", "#c4b5fd"],
  ["#fde68a", "#fca5a5", "#fbcfe8", "#a5b4fc"],
  ["#bae6fd", "#a5b4fc", "#c4b5fd", "#f0abfc"],
  ["#bbf7d0", "#fde68a", "#fdba74", "#a5b4fc"],
  ["#fbcfe8", "#fda4af", "#fcd34d", "#86efac"],
  ["#a5f3fc", "#bae6fd", "#ddd6fe", "#fbcfe8"],
  ["#fdba74", "#f0abfc", "#a5b4fc", "#86efac"],
  ["#c7d2fe", "#a5b4fc", "#7dd3fc", "#bbf7d0"],
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function AgentGradientOrb({ seed, size = 56, animated = true }: Props) {
  const hash = hashSeed(seed || "agent");
  const palette = PALETTES[hash % PALETTES.length];
  const angle = hash % 360;
  const animationDelay = -((hash % 12000) / 1000);

  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: `conic-gradient(from ${angle}deg, ${palette[0]}, ${palette[1]}, ${palette[2]}, ${palette[3]}, ${palette[0]})`,
    filter: "blur(0.5px) saturate(1.05)",
    boxShadow:
      "inset 0 0 18px rgba(255,255,255,0.55), inset 0 0 6px rgba(255,255,255,0.45), 0 8px 24px -10px rgba(15,23,42,0.18)",
    flexShrink: 0,
    animation: animated ? `agentOrbSpin 18s linear infinite` : undefined,
    animationDelay: animated ? `${animationDelay}s` : undefined,
  };

  return (
    <span aria-hidden="true" style={style}>
      <style jsx>{`
        @keyframes agentOrbSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </span>
  );
}
