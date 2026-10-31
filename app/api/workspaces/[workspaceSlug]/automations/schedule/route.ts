import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { runTool } from "@/lib/agentTools/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ScheduleBody = {
  prompt?: string;
  cron?: string;
  targetAgentId?: string;
  attachedSkills?: string[];
  deliverTo?: string;
};

export async function POST(request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;
  if (auth.context.role === "viewer") {
    return Response.json({ error: "Viewers cannot schedule automations." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as ScheduleBody;
  const prompt = String(body.prompt ?? "").trim();
  const cron = String(body.cron ?? "").trim();
  const targetAgentId = String(body.targetAgentId ?? "").trim();
  const attachedSkills = Array.isArray(body.attachedSkills)
    ? body.attachedSkills.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];
  const deliverTo = String(body.deliverTo ?? "").trim();

  if (!prompt || !cron || !targetAgentId) {
    return Response.json(
      { error: "prompt, cron, and targetAgentId are required." },
      { status: 400 },
    );
  }

  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const result = await runTool({
    name: "automation_schedule",
    args: {
      prompt,
      cron,
      target_agent_id: targetAgentId,
      attached_skills: attachedSkills,
      ...(deliverTo ? { deliver_to: deliverTo } : {}),
    },
    ctx: {
      workspaceSlug,
      origin: new URL(request.url).origin,
      cookieHeader,
    },
  });

  if (!result.ok) {
    return Response.json(
      {
        error: result.error ?? "Failed to schedule automation.",
        details: result.details ?? null,
      },
      { status: result.status ?? 400 },
    );
  }

  return Response.json({
    automation: result.data ?? {},
  });
}
