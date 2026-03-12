import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "amber" | "ghost";

type CommonProps = {
  children: ReactNode;
  variant?: Variant;
  className?: string;
};

type LinkButtonProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string;
  };

type NativeButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: never;
  };

function buildClassName(variant: Variant, className?: string) {
  return ["btn", `btn-${variant}`, className].filter(Boolean).join(" ");
}

export function Button(props: LinkButtonProps | NativeButtonProps) {
  if ("href" in props && props.href) {
    const { children, variant = "primary", className, href, ...rest } = props;

    return (
      <a href={href} className={buildClassName(variant, className)} {...rest}>
        {children}
      </a>
    );
  }

  const nativeProps = props as NativeButtonProps;
  const { children, variant = "primary", className, type, ...rest } = nativeProps;

  return (
    <button
      type={(type as "button" | "reset" | "submit" | undefined) ?? "button"}
      className={buildClassName(variant, className)}
      {...rest}
    >
      {children}
    </button>
  );
}