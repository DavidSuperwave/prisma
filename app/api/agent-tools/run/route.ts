import { runTool } from "@/lib/agentTools/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  args?: unknown;
  workspaceSlug?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const name = body.name;
  const workspaceSlug = body.workspaceSlug;
  if (typeof name !== "string" || typeof workspaceSlug !== "string") {
    return Response.json(
      { error: "Both `name` and `workspaceSlug` are required." },
      { status: 400 },
    );
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
