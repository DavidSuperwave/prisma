import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchWhatsappChannelStatus,
  forwardSidecarCommand,
  resolveSidecarBaseUrl,
} from "@/lib/whatsappSidecar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string; agentId: string }>;
};

async function authorizeAgent(workspaceSlug: string, agentId: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  if (!user.isPlatformAdmin && membership.role !== "admin") {
    return {
      error: Response.json({ error: "Only workspace admins can pair WhatsApp." }, { status: 403 }),
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error: Response.json(
        { error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." },
        { status: 500 },
      ),
    };
  }

  const { data: agentRow, error } = await supabase
    .from("workspace_agents")
    .select("id, workspace_id, api_endpoint, api_key, channel_config")
    .eq("id", agentId)
    .eq("workspace_id", membership.workspaceId)
    .maybeSingle();
  if (error) {
    return { error: Response.json({ error: error.message }, { status: 500 }) };
  }
  if (!agentRow) {
    return { error: Response.json({ error: "Agent not found." }, { status: 404 }) };
  }

  const apiEndpoint = String(agentRow.api_endpoint ?? "").trim().replace(/\/$/, "");
  const apiKey = String(agentRow.api_key ?? "").trim();
  if (!apiEndpoint || !apiKey) {
    return {
      error: Response.json(
        { error: "Agent endpoint or API key is not configured." },
        { status: 400 },
      ),
    };
  }
  const channelConfig = (agentRow.channel_config as Record<string, unknown> | null) ?? null;
  const sidecarBase = resolveSidecarBaseUrl(apiEndpoint, channelConfig);
  if (!sidecarBase) {
    return {
      error: Response.json(
        {
          error:
            "Could not derive a WhatsApp sidecar URL. Set channel_config.whatsapp.sidecarUrl or use an HTTP(S) api_endpoint.",
        },
        { status: 400 },
      ),
    };
  }

  return { apiEndpoint, apiKey, channelConfig, sidecarBase };
}

async function readForceFlag(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const query = url.searchParams.get("force");
  if (query && ["1", "true", "yes"].includes(query.trim().toLowerCase())) {
    return true;
  }
  try {
    const body = (await request.clone().json().catch(() => null)) as { force?: unknown } | null;
    if (body && body.force === true) return true;
  } catch {
    // ignore body parse errors
  }
  return false;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const authz = await authorizeAgent(workspaceSlug, agentId);
    if ("error" in authz) return authz.error;

    const force = await readForceFlag(request);
    const result = await forwardSidecarCommand(authz.sidecarBase, authz.apiKey, "pair", { force });
    if (!result.ok) {
      return Response.json(
        {
          error:
            (result.body && typeof result.body === "object" && "error" in (result.body as Record<string, unknown>)
              ? String((result.body as Record<string, unknown>).error)
              : null) ?? `Sidecar returned ${result.status}.`,
          status: result.status,
        },
        { status: result.status === 409 ? 409 : 502 },
      );
    }

    const channelStatus = await fetchWhatsappChannelStatus(
      authz.apiEndpoint,
      authz.apiKey,
      authz.channelConfig,
    );

    return Response.json({
      ok: true,
      sidecar: authz.sidecarBase,
      force,
      channelStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start WhatsApp pairing.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const authz = await authorizeAgent(workspaceSlug, agentId);
    if ("error" in authz) return authz.error;

    const result = await forwardSidecarCommand(authz.sidecarBase, authz.apiKey, "logout");
    if (!result.ok) {
      return Response.json(
        {
          error:
            (result.body && typeof result.body === "object" && "error" in (result.body as Record<string, unknown>)
              ? String((result.body as Record<string, unknown>).error)
              : null) ?? `Sidecar returned ${result.status}.`,
        },
        { status: 502 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to log WhatsApp out.";
    return Response.json({ error: message }, { status: 500 });
  }
}
