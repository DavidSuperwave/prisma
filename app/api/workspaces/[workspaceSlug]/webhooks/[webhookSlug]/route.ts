import { getConnectionBySlug, getConnectionByWebhook } from "@/lib/connections/store";
import { ingestConnectionPayload } from "@/lib/connections/runtime";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; webhookSlug: string }>;
};

async function resolveWorkspaceId(workspaceSlug: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin unavailable.");
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? String(data.id) : null;
}

function readProvidedToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return (
    request.headers.get("x-prisma-webhook-token") ??
    new URL(request.url).searchParams.get("token") ??
    ""
  ).trim();
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, webhookSlug } = await context.params;
    const workspaceId = await resolveWorkspaceId(workspaceSlug);
    if (!workspaceId) {
      return Response.json({ error: "Workspace not found." }, { status: 404 });
    }
    const connection =
      (await getConnectionByWebhook(workspaceId, webhookSlug)) ??
      (await getConnectionBySlug(workspaceId, webhookSlug));
    if (!connection || connection.mode !== "webhook_inbound") {
      return Response.json({ error: "Webhook not found." }, { status: 404 });
    }
    const providedToken = readProvidedToken(request);
    const expectedToken = (connection.webhookToken ?? "").trim();
    if (expectedToken && providedToken !== expectedToken) {
      return Response.json({ error: "Unauthorized webhook token." }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : await request.text();
    const report = await ingestConnectionPayload({
      workspaceId,
      connectionId: connection.id,
      payload,
    });
    return Response.json({
      ok: true,
      connection: {
        id: connection.id,
        slug: connection.slug,
      },
      report,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to process webhook." },
      { status: 400 },
    );
  }
}
