import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  flush?: boolean;
  children: ReactNode;
};

export function Toolbar({ flush = false, className, children, ...rest }: Props) {
  const merged = ["ws-toolbar", flush ? "ws-toolbar--flush" : "", className].filter(Boolean).join(" ");
  return (
    <div {...rest} className={merged}>
      {children}
    </div>
  );
}

export function ToolbarSpacer() {
  return <div className="ws-toolbar__spacer" />;
}
