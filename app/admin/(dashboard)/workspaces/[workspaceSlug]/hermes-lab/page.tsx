import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireAdminUser } from "@/lib/auth";
import { getWorkspaceBySlug } from "@/lib/workspaceStore";
import { IntegrationsManager } from "@/components/workspace/settings/IntegrationsManager";
import { HermesOpsPanel } from "@/components/workspace/settings/HermesOpsPanel";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function AdminWorkspaceHermesLabPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  await requireAdminUser(`/admin/workspaces/${workspaceSlug}/hermes-lab`);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  return (
    <section style={stackStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Hermes lab</p>
        <h1 style={titleStyle}>{workspace.name}</h1>
        <p style={copyStyle}>
          Workspace-scoped sandbox for Hermes integrations, skills, and automations. Use this when reproducing
          a client issue or pre-provisioning APIs before handing the workspace over to chat-driven configuration.
        </p>
        <p style={metaStyle}>
          slug: <code>{workspace.subdomain}</code> · workspace_id: <code>{workspace.id}</code>
        </p>
        <div style={linksRowStyle}>
          <Link href="/admin/agents" style={linkStyle}>
            Back to agent monitor
          </Link>
          <Link href={`/workspaces/${workspace.subdomain}?tab=agents`} style={linkStyle}>
            Open Operadores in workspace
          </Link>
        </div>
      </header>

      <div className="workspace-app" style={surfaceStyle}>
        <IntegrationsManager workspaceSlug={workspace.subdomain} />
        <HermesOpsPanel workspaceSlug={workspace.subdomain} />
      </div>
    </section>
  );
}

const stackStyle: CSSProperties = { display: "grid", gap: 16 };

const headerStyle: CSSProperties = { display: "grid", gap: 8 };

const eyebrowStyle: CSSProperties = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 12,
  color: "var(--giga-muted)",
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 28 };

const copyStyle: CSSProperties = { margin: 0, color: "var(--giga-muted)" };

const metaStyle: CSSProperties = { margin: 0, color: "var(--giga-muted)", fontSize: 13 };

const linksRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 };

const linkStyle: CSSProperties = {
  width: "fit-content",
  textDecoration: "none",
  border: "1px solid var(--giga-border)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "var(--giga-text)",
  fontSize: 13,
};

const surfaceStyle: CSSProperties = {
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 16,
};
