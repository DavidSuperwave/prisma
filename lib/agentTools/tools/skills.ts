import { registerTool, type ToolContext, type ToolResult } from "../registry";
import { fetchInternalJson } from "../executor";

type WorkspaceSkillResponse = {
  skill?: {
    slug?: string;
    title?: string;
    path?: string;
  };
  error?: string;
};

async function patchAgentSkillsScope(
  ctx: ToolContext,
  agentId: string,
  skillSlug: string,
): Promise<ToolResult | null> {
  const agentResponse = await fetchInternalJson<{
    agent?: { skillsScope?: string[] };
    error?: string;
  }>(
    ctx,
    `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/agents/${encodeURIComponent(agentId)}`,
    { method: "GET" },
  );
  if (!agentResponse.ok) {
    return {
      ok: false,
      error: agentResponse.error ?? "Unable to load target agent before attaching skill.",
      status: agentResponse.status,
    };
  }
  const current = Array.isArray(agentResponse.data?.agent?.skillsScope)
    ? agentResponse.data?.agent?.skillsScope
    : [];
  const next = Array.from(new Set([...current, skillSlug]));
  const patchResponse = await fetchInternalJson<{ agent?: unknown; error?: string }>(
    ctx,
    `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/agents/${encodeURIComponent(agentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ skillsScope: next }),
    },
  );
  if (!patchResponse.ok) {
    return {
      ok: false,
      error: patchResponse.error ?? "Unable to attach created skill to agent.",
      status: patchResponse.status,
    };
  }
  return { ok: true, data: patchResponse.data ?? {} };
}

registerTool({
  name: "skills.create_local",
  description:
    "Create a workspace-local Hermes SKILL.md file from chat. Use this when the user wants a repeatable workflow or custom operating procedure saved into the workspace. Optionally attach the new skill to an agent via skillsScope.",
  args: {
    slug: { type: "string", required: true, description: "Stable skill slug, e.g. close-importer or inbox/reply-playbook." },
    title: { type: "string", required: true, description: "Human title for the skill." },
    description: { type: "string", required: true, description: "Short summary explaining what the skill does." },
    starterInstructions: {
      type: "string",
      required: true,
      description: "The actual workflow instructions that should become the SKILL.md body.",
    },
    requiredEnvironmentVariables: {
      type: "array",
      description: "Optional env vars the skill expects, e.g. CLOSE_API_KEY.",
    },
    attachToAgent: {
      type: "boolean",
      description: "If true, also add this skill slug to the target agent's skillsScope.",
    },
    agent_id: {
      type: "string",
      description: "Required when attachToAgent=true. workspace_agents.id to receive the skill.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as {
      slug?: string;
      title?: string;
      description?: string;
      starterInstructions?: string;
      requiredEnvironmentVariables?: unknown;
      attachToAgent?: boolean;
      agent_id?: string;
    };
    const slug = String(args.slug ?? "").trim();
    const title = String(args.title ?? "").trim();
    const description = String(args.description ?? "").trim();
    const starterInstructions = String(args.starterInstructions ?? "").trim();
    if (!slug || !title || !description || !starterInstructions) {
      return {
        ok: false,
        error: "slug, title, description, and starterInstructions are required.",
        status: 400,
      };
    }
    const requiredEnvironmentVariables = Array.isArray(args.requiredEnvironmentVariables)
      ? args.requiredEnvironmentVariables.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    const response = await fetchInternalJson<WorkspaceSkillResponse>(
      ctx,
      `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/skills`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "create_local",
          slug,
          title,
          description,
          requiredEnvironmentVariables,
          starterInstructions,
        }),
      },
    );
    if (!response.ok) {
      return { ok: false, error: response.error ?? "Unable to create workspace skill.", status: response.status };
    }

    let attachedAgentId: string | null = null;
    if (args.attachToAgent === true) {
      const agentId = String(args.agent_id ?? "").trim();
      if (!agentId) {
        return { ok: false, error: "agent_id is required when attachToAgent=true.", status: 400 };
      }
      const attachResult = await patchAgentSkillsScope(ctx, agentId, slug);
      if (attachResult && !attachResult.ok) {
        return attachResult;
      }
      attachedAgentId = agentId;
    }

    return {
      ok: true,
      data: {
        skill: response.data?.skill ?? { slug, title },
        attachedAgentId,
      },
    };
  },
});
