import type { HTMLAttributes, ReactNode } from "react";

export type PillTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: PillTone;
  children: ReactNode;
};

export function Pill({ tone = "neutral", className, children, ...rest }: Props) {
  const merged = ["workspace-pill", `workspace-pill--${tone}`, className].filter(Boolean).join(" ");
  return (
    <span {...rest} className={merged}>
      {children}
    </span>
  );
}

export function pillToneForStatus(value: string | null | undefined): PillTone {
  if (!value) return "neutral";
  const v = String(value).toLowerCase();
  if (v === "customer" || v === "won" || v === "completed" || v === "success") return "success";
  if (v === "qualified" || v === "opportunity" || v === "in_progress" || v === "proposal") return "info";
  if (v === "lost" || v === "unqualified" || v === "error" || v === "failed") return "danger";
  if (v === "new" || v === "lead" || v === "pending") return "accent";
  return "neutral";
}
