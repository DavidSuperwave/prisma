import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  bordered?: boolean;
  label?: string;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { active = false, bordered = false, label, className, children, type, ...rest },
  ref,
) {
  const classes = [
    "ws-icon-button",
    active ? "ws-icon-button--active" : "",
    bordered ? "ws-icon-button--bordered" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={classes}
      {...rest}
    >
      {children}
    </button>
  );
});
