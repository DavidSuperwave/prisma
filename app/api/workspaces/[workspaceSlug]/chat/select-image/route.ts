import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { runTool } from "@/lib/agentTools/executor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called by the in-chat ImagePickerCard when a user clicks "Use this". Hands
 * off to images.save so the selection is persisted identically to an agent-
 * initiated save.
 *
 * When a `conversationId` (runtime conversation id) is provided, the saved
 * URL is also echoed into `workspace_conversation_messages` as a system
 * note so the next agent turn can pass it as `refs` to images.generate for
 * img2img workflows (e.g. "same car but at our dealership at golden hour").
 */

type Context = { params: Promise<{ workspaceSlug: string }> };

type Body = {
  candidateId?: string;
  url?: string;
  recordId?: string;
  caption?: string;
  conversationId?: string;
};

type SavedImagePayload = {
  path?: string;
  publicUrl?: string | null;
  signedUrl?: string | null;
  recordId?: string | null;
  mimeType?: string;
};

async function echoSavedUrlToConversation(params: {
  workspaceId: string;
  runtimeConversationId: string;
  createdBy: string;
  saved: SavedImagePayload;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const signedUrl = params.saved.signedUrl ?? params.saved.publicUrl ?? null;
  if (!signedUrl) return;

  const { data: conversation, error: convError } = await supabase
    .from("workspace_conversations")
    .select("id, agent_id")
    .eq("workspace_id", params.workspaceId)
    .eq("runtime_conversation_id", params.runtimeConversationId)
    .maybeSingle();
  if (convError || !conversation?.id) return;

  const recordSuffix = params.saved.recordId ? ` recordId=${params.saved.recordId}` : "";
  const content = `[image saved] signedUrl=${signedUrl}${recordSuffix}. Re-use this URL as a \`refs\` entry for images.generate if the user asks for an edit or background change.`;

  await supabase.from("workspace_conversation_messages").insert({
    conversation_id: conversation.id,
    workspace_id: params.workspaceId,
    agent_id: conversation.agent_id,
    role: "system",
    content,
    created_by: params.createdBy,
    metadata: {
      origin: "images.save",
      signedUrl,
      recordId: params.saved.recordId ?? null,
      path: params.saved.path ?? null,
    },
  });
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot save images." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Body;
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") ?? undefined;
    const result = await runTool({
      name: "images.save",
      args: {
        candidateId: body.candidateId,
        url: body.url,
        recordId: body.recordId,
        caption: body.caption,
      },
      ctx: { workspaceSlug, origin, cookieHeader },
    });

    if (result.ok && body.conversationId && result.data && typeof result.data === "object") {
      try {
        await echoSavedUrlToConversation({
          workspaceId: auth.context.workspaceId,
          runtimeConversationId: body.conversationId,
          createdBy: auth.context.user.id,
          saved: result.data as SavedImagePayload,
        });
      } catch (echoError) {
        console.warn(
          "[select-image] failed to echo saved url into conversation",
          echoError instanceof Error ? echoError.message : echoError,
        );
      }
    }

    const status = result.ok ? 200 : result.status ?? 400;
    return Response.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
