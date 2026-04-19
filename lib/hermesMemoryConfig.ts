/**
 * Hermes external memory provider resolver.
 *
 * Produces the `memory` block that `GET /api/workspaces/:slug/agents/:id/mcp-config`
 * returns to Hermes. Hermes uses this to attach an external memory backend
 * (currently Supermemory) so agents keep cross-session recall.
 *
 * Secrets are NEVER embedded. We always emit `*_ref` pointers
 * (`env:SUPERMEMORY_API_KEY`, `vault:<slug>:<key>`) and expect the Hermes
 * runtime to dereference them from its own env / secret material.
 */
import { getIntegrationBySlug } from "@/lib/integrations/store";

export type HermesMemoryConfig = {
  provider: "supermemory" | "none";
  config?: Record<string, unknown>;
};

export type ResolveHermesMemoryConfigInput = {
  workspaceId: string;
  agentId: string;
};

function buildNamespace(workspaceId: string, agentId: string): string {
  return `prisma:${workspaceId}:${agentId}`;
}

export async function resolveHermesMemoryConfig(
  opts: ResolveHermesMemoryConfigInput,
): Promise<HermesMemoryConfig> {
  const { workspaceId, agentId } = opts;
  const namespace = buildNamespace(workspaceId, agentId);

  const envKey = process.env.SUPERMEMORY_API_KEY?.trim();
  if (envKey && envKey.length > 0) {
    return {
      provider: "supermemory",
      config: {
        api_key_ref: "env:SUPERMEMORY_API_KEY",
        namespace,
      },
    };
  }

  try {
    const integration = await getIntegrationBySlug(workspaceId, "supermemory");
    if (
      integration &&
      integration.status === "active" &&
      integration.authType === "api_key" &&
      integration.hasSecrets
    ) {
      return {
        provider: "supermemory",
        config: {
          api_key_ref: "vault:supermemory:api_key",
          namespace,
          integration_id: integration.id,
        },
      };
    }
  } catch (error) {
    console.error("resolveHermesMemoryConfig: vault lookup failed", error);
  }

  return { provider: "none" };
}
