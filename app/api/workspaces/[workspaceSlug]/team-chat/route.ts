import { getCurrentAppUser } from "@/lib/auth";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import {
  createMessageForScope,
  createDirectThreadForUser,
  createWorkspaceChannelForUser,
  listDirectThreadsForUser,
  listMessagesForScope,
  listWorkspaceChannelsForUser,
} from "@/lib/teamChatStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type RequestPayload = {
  action?: "create-channel" | "create-dm" | "post-message";
  channelId?: string;
  directMessageId?: string;
  name?: string;
  description?: string;
  participantIds?: string[];
  content?: string;
  messageType?: "message" | "post" | "system";
  postTitle?: string;
  postCategory?: string;
};

export async function GET(request: Request, context: Context) {
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceSlug } = await context.params;
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const directMessageId = searchParams.get("directMessageId");

  const [channels, directMessages, messages] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    listDirectThreadsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    channelId || directMessageId
      ? listMessagesForScope({
          workspaceSlug,
          userId: user.id,
          isPlatformAdmin: user.isPlatformAdmin,
          channelId: channelId ?? undefined,
          directMessageId: directMessageId ?? undefined,
        })
      : Promise.resolve([]),
  ]);

  return Response.json({
    channels,
    directMessages,
    messages,
    currentUserId: user.id,
  });
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceSlug } = await context.params;
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }

  const body = (await request.json()) as RequestPayload;

  if (body.action === "create-channel") {
    if (!body.name?.trim()) {
      return Response.json({ error: "Channel name is required." }, { status: 400 });
    }

    const channel = await createWorkspaceChannelForUser({
      workspaceSlug,
      userId: user.id,
      isPlatformAdmin: user.isPlatformAdmin,
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
    });

    return Response.json({ channel }, { status: 201 });
  }

  if (body.action === "create-dm") {
    const participantIds = Array.from(new Set([user.id, ...(body.participantIds ?? []).filter(Boolean)]));
    if (participantIds.length < 2) {
      return Response.json({ error: "At least two participants are required." }, { status: 400 });
    }

    const directMessage = await createDirectThreadForUser({
      workspaceSlug,
      userId: user.id,
      isPlatformAdmin: user.isPlatformAdmin,
      participantIds,
    });

    return Response.json({ directMessage }, { status: 201 });
  }

  if (body.action === "post-message") {
    if (!body.content?.trim()) {
      return Response.json({ error: "Message content is required." }, { status: 400 });
    }

    const message = await createMessageForScope({
      workspaceSlug,
      userId: user.id,
      userLabel: user.email ?? "Miembro del equipo",
      isPlatformAdmin: user.isPlatformAdmin,
      channelId: body.channelId,
      directMessageId: body.directMessageId,
      content: body.content.trim(),
    });

    return Response.json({ message }, { status: 201 });
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
