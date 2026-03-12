import type { ReactNode } from "react";

type SectionProps = {
  id?: string;
  label: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function Section({ id, label, title, description, children, className }: SectionProps) {
  return (
    <section id={id} className={["section", className].filter(Boolean).join(" ")}>
      <div className="container">
        <div className="section-label">{label}</div>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-desc">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}
