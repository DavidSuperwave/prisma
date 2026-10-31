import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { resolveWorkspaceHermesHome } from "@/lib/hermesHome";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type NativeGatewayBody = {
  enabled?: boolean;
  allowedUsers?: string[];
};

function deriveGatewayServiceName(workspaceHome: string) {
  const suffix = createHash("sha1").update(workspaceHome).digest("hex").slice(0, 10);
  return {
    linuxSystemdUnit: `hermes-gateway-${suffix}`,
    macosLaunchdLabel: `ai.hermes.gateway-${suffix}`,
  };
}

async function loadWorkspaceMetadata(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};
  const { data } = await supabase
    .from("workspaces")
    .select("metadata")
    .eq("id", workspaceId)
    .maybeSingle();
  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  return metadata;
}

export async function GET(_request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;

  const workspaceHome = resolveWorkspaceHermesHome(auth.context.workspaceId);
  const metadata = await loadWorkspaceMetadata(auth.context.workspaceId);
  const nativeGateway =
    metadata.native_gateway && typeof metadata.native_gateway === "object" && !Array.isArray(metadata.native_gateway)
      ? (metadata.native_gateway as Record<string, unknown>)
      : {};

  return Response.json({
    enabled: nativeGateway.enabled === true,
    workspaceHome,
    serviceNames: deriveGatewayServiceName(workspaceHome),
    allowedUsers: Array.isArray(nativeGateway.allowed_users) ? nativeGateway.allowed_users : [],
    note: "Deferred opt-in path. Provisioning of dedicated gateway processes is customer-triggered.",
  });
}

export async function POST(request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;
  if (auth.context.role === "viewer") {
    return Response.json({ error: "Viewers cannot configure native gateway." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as NativeGatewayBody;
  const enabled = body.enabled === true;
  const allowedUsers = Array.isArray(body.allowedUsers)
    ? body.allowedUsers.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ error: "Supabase admin unavailable." }, { status: 500 });
  }

  const metadata = await loadWorkspaceMetadata(auth.context.workspaceId);

  const workspaceHome = resolveWorkspaceHermesHome(auth.context.workspaceId);
  const { error } = await supabase
    .from("workspaces")
    .update({
      metadata: {
        ...metadata,
        native_gateway: {
          enabled,
          allowed_users: allowedUsers,
          workspace_home: workspaceHome,
          updated_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.context.workspaceId);
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({
    enabled,
    workspaceHome,
    serviceNames: deriveGatewayServiceName(workspaceHome),
    allowedUsers,
  });
}
