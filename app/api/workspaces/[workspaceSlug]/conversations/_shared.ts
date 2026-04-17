import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type WorkspaceMembershipRole = "admin" | "operator" | "viewer";

export type AuthorizedWorkspaceContext = {
  user: {
    id: string;
    isPlatformAdmin: boolean;
  };
  workspaceId: string;
  workspaceSlug: string;
  role: WorkspaceMembershipRole;
};

export type ConversationRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  title: string;
  source: string;
  runtime_conversation_id: string;
  channel_type: string | null;
  channel_identity: string | null;
  metadata: Record<string, unknown> | null;
  message_count: number | null;
  last_message_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function authorizeWorkspaceMember(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }

  return {
    context: {
      user: {
        id: user.id,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      workspaceId: membership.workspaceId,
      workspaceSlug,
      role: membership.role,
    } satisfies AuthorizedWorkspaceContext,
  };
}

export function canAccessConversation(
  context: AuthorizedWorkspaceContext,
  conversation: ConversationRow,
  includeShared: boolean,
) {
  if (conversation.created_by && conversation.created_by === context.user.id) {
    return true;
  }

  if (conversation.source !== "workspace_chat") {
    return includeShared && context.role !== "viewer";
  }

  return includeShared && (context.role === "admin" || context.role === "operator");
}

export function mapConversation(row: ConversationRow) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    agentId: String(row.agent_id),
    title: String(row.title),
    source: String(row.source),
    runtimeConversationId: String(row.runtime_conversation_id),
    channelType: row.channel_type ? String(row.channel_type) : null,
    channelIdentity: row.channel_identity ? String(row.channel_identity) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    messageCount: Number(row.message_count ?? 0),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function normalizeRuntimeConversationId(value?: string | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length > 0) {
    return trimmed;
  }
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `conversation-${random}`;
}

