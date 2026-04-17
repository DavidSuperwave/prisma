import Link from "next/link";
import AgentAdvancedSettingsPanel from "@/components/admin/AgentAdvancedSettingsPanel";

type PageProps = {
  params: Promise<{
    workspaceSlug: string;
    agentId: string;
  }>;
};

export default async function AdminAgentAdvancedPage({ params }: PageProps) {
  const { workspaceSlug, agentId } = await params;

  return (
    <section style={stackStyle}>
      <div style={headerStyle}>
        <p style={eyebrowStyle}>Agent monitor</p>
        <h1 style={titleStyle}>Configuración avanzada del agente</h1>
        <p style={copyStyle}>
          Ajustes técnicos y despliegue para <strong>{agentId}</strong> en workspace{" "}
          <strong>{workspaceSlug}</strong>.
        </p>
        <Link href="/admin/agents" style={linkStyle}>
          Volver al monitor de agentes
        </Link>
      </div>

      <AgentAdvancedSettingsPanel workspaceSlug={workspaceSlug} agentId={agentId} />
    </section>
  );
}

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const headerStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 12,
  color: "var(--giga-muted)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
};

const copyStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--giga-muted)",
};

const linkStyle: React.CSSProperties = {
  width: "fit-content",
  textDecoration: "none",
  border: "1px solid var(--giga-border)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "var(--giga-text)",
};
