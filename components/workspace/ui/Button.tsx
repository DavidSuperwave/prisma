import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "accent" | "ghost" | "danger" | "default";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  compact?: boolean;
  pill?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "default",
    compact = false,
    pill = false,
    className,
    leadingIcon,
    trailingIcon,
    children,
    type,
    ...rest
  },
  ref,
) {
  const variantClass =
    variant === "primary"
      ? "workspace-button--primary"
      : variant === "accent"
        ? "workspace-button--accent"
        : variant === "ghost"
          ? "workspace-button--ghost"
          : variant === "danger"
            ? "workspace-button--danger"
            : "";

  const classes = [
    "workspace-button",
    variantClass,
    compact ? "workspace-button--compact" : "",
    pill ? "workspace-button--pill" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
