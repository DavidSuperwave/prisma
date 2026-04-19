import type { HTMLAttributes, ReactNode } from "react";

export type CardVariant = "default" | "flush" | "well";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: number | string;
  children: ReactNode;
};

export function Card({ variant = "default", padding, className, style, children, ...rest }: Props) {
  const variantClass =
    variant === "flush" ? "ws-card ws-card--flush" : variant === "well" ? "ws-card ws-card--well" : "ws-card";
  const merged = [variantClass, className].filter(Boolean).join(" ");
  return (
    <div
      {...rest}
      className={merged}
      style={{
        padding: padding ?? 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
