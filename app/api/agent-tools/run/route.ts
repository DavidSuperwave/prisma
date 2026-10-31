import { getCurrentAppUser } from "@/lib/auth";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";
import { runTool } from "@/lib/agentTools/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  args?: unknown;
  workspaceSlug?: string;
};

/**
 * Development helper to invoke a tool with the caller's session.
 * Not intended for unauthenticated or cross-workspace use.
 */
export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const name = body.name;
  const workspaceSlug = body.workspaceSlug;
  if (typeof name !== "string" || typeof workspaceSlug !== "string") {
    return Response.json(
      { error: "Both `name` and `workspaceSlug` are required." },
      { status: 400 },
    );
  }
  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const cookieHeader = request.headers.get("cookie") ?? undefined;

  const result = await runTool({
    name,
    args: body.args ?? {},
    ctx: { workspaceSlug, origin, cookieHeader },
  });

  const status = result.ok ? 200 : result.status ?? 400;
  return Response.json(result, { status });
}
