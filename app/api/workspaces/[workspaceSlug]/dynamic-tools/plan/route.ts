import { getCurrentAppUser } from "@/lib/auth";
import { runTool } from "@/lib/agentTools/executor";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";
import { runWorkflowPlanner } from "@/lib/dynamicTools/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ workspaceSlug: string }> };

type PlanBody = {
  documentRecordId?: string;
  documentTextOverride?: string;
  agentId?: string;
};

function extractTextFromAnalyze(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.text === "string" && d.text.trim()) {
    return d.text;
  }
  if (Array.isArray(d.sheets)) {
    return JSON.stringify(d.sheets, null, 2);
  }
  return "";
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

  let body: PlanBody;
  try {
    body = (await request.json()) as PlanBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const toolContext = {
    workspaceSlug: membership.workspace.subdomain,
    origin,
    cookieHeader,
    agentId: body.agentId?.trim() || null,
  };

  let documentText = String(body.documentTextOverride ?? "").trim();
  if (!documentText) {
    const recordId = String(body.documentRecordId ?? "").trim();
    if (!recordId) {
      return Response.json(
        { error: "Provide `documentRecordId` or `documentTextOverride`." },
        { status: 400 },
      );
    }
    const docResult = await runTool({
      name: "documents.analyze",
      args: { recordId },
      ctx: toolContext,
    });
    if (!docResult.ok) {
      return Response.json(
        { error: docResult.error ?? "Document analysis failed.", status: docResult.status },
        { status: docResult.status && docResult.status >= 400 && docResult.status < 600 ? docResult.status : 400 },
      );
    }
    documentText = extractTextFromAnalyze(docResult.data);
    if (documentText.length < 8) {
      return Response.json(
        { error: "Document has too little text for planning. Use a text or PDF with extractable text." },
        { status: 400 },
      );
    }
  }

  try {
    const { output, validationWarnings } = await runWorkflowPlanner({
      documentText,
      workspaceSlug: membership.workspace.subdomain,
    });
    return Response.json({
      ok: true,
      output,
      validationWarnings,
      meta: { workspaceId: membership.workspaceId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Planner failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
