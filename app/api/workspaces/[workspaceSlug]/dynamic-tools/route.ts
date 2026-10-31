import { getCurrentAppUser } from "@/lib/auth";
import { buildArgsSchemaFromProposal } from "@/lib/dynamicTools/planner";
import type { ToolProposal } from "@/lib/dynamicTools/planner";
import { batchUpsertDynamicTools, type UpsertDynamicToolInput } from "@/lib/dynamicTools/store";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ workspaceSlug: string }> };

type BatchBody = {
  tools?: ToolProposal[];
  agentId?: string;
  /** When true, set all upserted tools to `active` after write. */
  activateAll?: boolean;
};

function mapProposalToUpsert(
  t: ToolProposal,
  agentId: string | null,
  activateAll: boolean,
): UpsertDynamicToolInput {
  return {
    name: t.name,
    description: t.description,
    args_schema: buildArgsSchemaFromProposal(t.args),
    implementation: t.implementation,
    agentId,
    status: activateAll ? "active" : "draft",
  };
}

export async function POST(request: Request, context: Ctx) {
  const { workspaceSlug } = await context.params;
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }
  if (membership.role === "viewer") {
    return Response.json({ error: "Viewers cannot modify dynamic tools." }, { status: 403 });
  }

  let body: BatchBody;
  try {
    body = (await request.json()) as BatchBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length === 0) {
    return Response.json({ error: "Provide `tools` array from the planner output." }, { status: 400 });
  }
  const agentId = String(body.agentId ?? "").trim() || null;
  const activateAll = body.activateAll === true;

  const rows = await batchUpsertDynamicTools(
    membership.workspaceId,
    tools.map((t) => mapProposalToUpsert(t, agentId, activateAll)),
  );

  return Response.json({ ok: true, tools: rows });
}
