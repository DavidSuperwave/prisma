import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { listWorkspaceObjects } from "@/lib/workspaceStore";
import { listTools } from "@/lib/agentTools/registry";
import { listDefaultOperatorToolNames } from "@/lib/agentTools/mcpPolicy";
import "@/lib/agentTools/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

const APP_SURFACES = ["CRM", "Tareas", "Documentos", "Inbox", "Chat"];

function namespaceOfTool(name: string) {
  if (!name.includes(".")) return "general";
  return name.split(".")[0] || "general";
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(_request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;

  try {
    const [objects, tools] = await Promise.all([
      listWorkspaceObjects(auth.context.workspaceId),
      Promise.resolve(listTools()),
    ]);
    const defaultToolNames = new Set(listDefaultOperatorToolNames());

    const usedSlugs = new Set<string>();
    const normalizedObjects = objects.map((object) => {
      const base =
        typeof object.slug === "string" && object.slug.trim().length > 0
          ? object.slug.trim()
          : toSlug(object.name) || `object-${object.id.slice(0, 8)}`;
      let candidate = base;
      let counter = 2;
      while (usedSlugs.has(candidate)) {
        candidate = `${base}-${counter}`;
        counter += 1;
      }
      usedSlugs.add(candidate);
      return {
        id: object.id,
        slug: candidate,
        name: object.name,
        description: object.description ?? null,
      };
    });

    return Response.json({
      tools: tools
        .map((tool) => ({
          name: tool.name,
          namespace: namespaceOfTool(tool.name),
          description: tool.description ?? "",
          isDefault: defaultToolNames.has(tool.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      surfaces: APP_SURFACES,
      objects: normalizedObjects,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load agent catalog.";
    return Response.json({ error: message }, { status: 400 });
  }
}
