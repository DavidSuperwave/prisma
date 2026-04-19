import { requireAuthenticatedUser } from "@/lib/auth";
import { IntegrationsManager } from "@/components/workspace/settings/IntegrationsManager";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function IntegrationsSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/settings/integrations`);
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <IntegrationsManager workspaceSlug={workspaceSlug} />
    </div>
  );
}
