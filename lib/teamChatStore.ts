"use server";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export type WorkspaceCollaborator = {
  id: string;
  email: string;
  role: "admin" | "operator" | "viewer";
};

export type WorkspaceChannel = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isPrivate: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDirectThread = {
  id: string;
  workspaceId: string;
  participantIds: string[];
  lastMessageAt?: string;
  createdAt: string;
};

export type WorkspaceMessage = {
  id: string;
  workspaceId: string;
  channelId?: string;
  directMessageId?: string;
  senderId: string;
  senderLabel: string;
  parentMessageId?: string;
  content: string;
  messageType: "message" | "post" | "system";
  attachments: Array<{ name: string; url?: string }>;
  mentions: string[];
  recordLinks: Array<{ title: string; href: string }>;
  createdAt: string;
};

type TeamChatState = {
  channels: WorkspaceChannel[];
  directThreads: WorkspaceDirectThread[];
  messages: WorkspaceMessage[];
};

const dataPath = path.join(process.cwd(), ".data", "team-chat-state.json");

function nowIso() {
  return new Date().toISOString();
}

function buildId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

async function readState(): Promise<TeamChatState> {
  try {
    const raw = await readFile(dataPath, "utf8");
    const parsed = JSON.parse(raw) as TeamChatState;
    return {
      channels: parsed.channels ?? [],
      directThreads: parsed.directThreads ?? [],
      messages: parsed.messages ?? [],
    };
  } catch {
    return {
      channels: [],
      directThreads: [],
      messages: [],
    };
  }
}

async function writeState(state: TeamChatState) {
  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(state, null, 2), "utf8");
}

function defaultChannelsForWorkspace(workspaceId: string, createdBy?: string) {
  const createdAt = nowIso();
  return [
    {
      id: `channel-general-${workspaceId}`,
      workspaceId,
      name: "general",
      description: "Canal general del workspace",
      isDefault: true,
      isPrivate: false,
      createdBy,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: `channel-operations-${workspaceId}`,
      workspaceId,
      name: "operations",
      description: "Coordinación operativa y seguimiento",
      isDefault: true,
      isPrivate: false,
      createdBy,
      createdAt,
      updatedAt: createdAt,
    },
  ] satisfies WorkspaceChannel[];
}

async function resolveWorkspaceForUser(workspaceSlug: string, userId: string, isPlatformAdmin: boolean) {
  const memberships = await listWorkspaceMembershipsForUser(userId, isPlatformAdmin);
  return memberships.find((entry) => entry.workspace.subdomain === workspaceSlug) ?? null;
}

export async function listWorkspaceCollaborators(workspaceId: string): Promise<WorkspaceCollaborator[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId);

    if (!error && data) {
      const collaborators = await Promise.all(
        (data as Array<{ user_id: string; role: WorkspaceCollaborator["role"] }>).map(async (entry) => {
          const userResult = await supabase.auth.admin.getUserById(entry.user_id).catch(() => null);
          return {
            id: String(entry.user_id),
            email: userResult?.data?.user?.email ?? `user-${String(entry.user_id).slice(0, 6)}`,
            role: entry.role,
          } satisfies WorkspaceCollaborator;
        }),
      );
      return collaborators;
    }
  }

  return [
    {
      id: "george-bbc",
      email: "george@bbc.local",
      role: "admin",
    },
    {
      id: "maria-bbc",
      email: "maria@bbc.local",
      role: "operator",
    },
    {
      id: "carlos-bbc",
      email: "carlos@bbc.local",
      role: "viewer",
    },
  ];
}

export async function listWorkspaceChannelsForUser(workspaceSlug: string, userId: string, isPlatformAdmin: boolean) {
  const workspace = await resolveWorkspaceForUser(workspaceSlug, userId, isPlatformAdmin);
  if (!workspace) {
    throw new Error("Workspace not available.");
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("workspace_channels")
      .select("*")
      .eq("workspace_id", workspace.workspaceId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const channels = (data as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        name: String(row.name),
        description: row.description ? String(row.description) : undefined,
        isDefault: Boolean(row.is_default),
        isPrivate: Boolean(row.is_private),
        createdBy: row.created_by ? String(row.created_by) : undefined,
        createdAt: String(row.created_at ?? nowIso()),
        updatedAt: String(row.updated_at ?? nowIso()),
      }));
      return channels.length ? channels : defaultChannelsForWorkspace(workspace.workspaceId, userId);
    }
  }

  const state = await readState();
  const channels = state.channels.filter((channel) => channel.workspaceId === workspace.workspaceId);
  if (channels.length > 0) {
    return channels;
  }

  const seeded = defaultChannelsForWorkspace(workspace.workspaceId, userId);
  state.channels.push(...seeded);
  await writeState(state);
  return seeded;
}

export async function createWorkspaceChannelForUser({
  workspaceSlug,
  userId,
  isPlatformAdmin,
  name,
  description,
}: {
  workspaceSlug: string;
  userId: string;
  isPlatformAdmin: boolean;
  name: string;
  description?: string;
}) {
  const workspace = await resolveWorkspaceForUser(workspaceSlug, userId, isPlatformAdmin);
  if (!workspace) {
    throw new Error("Workspace not available.");
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Channel name is required.");
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("workspace_channels")
      .insert({
        workspace_id: workspace.workspaceId,
        name: slug,
        description: description ?? null,
        is_default: false,
        is_private: false,
        created_by: userId,
      })
      .select()
      .single();

    if (!error && data) {
      return {
        id: String(data.id),
        workspaceId: String(data.workspace_id),
        name: String(data.name),
        description: data.description ? String(data.description) : undefined,
        isDefault: Boolean(data.is_default),
        isPrivate: Boolean(data.is_private),
        createdBy: data.created_by ? String(data.created_by) : undefined,
        createdAt: String(data.created_at ?? nowIso()),
        updatedAt: String(data.updated_at ?? nowIso()),
      } satisfies WorkspaceChannel;
    }
  }

  const state = await readState();
  const record: WorkspaceChannel = {
    id: buildId("channel"),
    workspaceId: workspace.workspaceId,
    name: slug,
    description,
    isDefault: false,
    isPrivate: false,
    createdBy: userId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.channels.push(record);
  await writeState(state);
  return record;
}

export async function listDirectThreadsForUser(workspaceSlug: string, userId: string, isPlatformAdmin: boolean) {
  const workspace = await resolveWorkspaceForUser(workspaceSlug, userId, isPlatformAdmin);
  if (!workspace) {
    throw new Error("Workspace not available.");
  }

  const state = await readState();
  return state.directThreads
    .filter((thread) => thread.workspaceId === workspace.workspaceId && thread.participantIds.includes(userId))
    .sort((left, right) => (left.lastMessageAt ?? left.createdAt) < (right.lastMessageAt ?? right.createdAt) ? 1 : -1);
}

export async function createDirectThreadForUser({
  workspaceSlug,
  userId,
  isPlatformAdmin,
  participantIds,
}: {
  workspaceSlug: string;
  userId: string;
  isPlatformAdmin: boolean;
  participantIds: string[];
}) {
  const workspace = await resolveWorkspaceForUser(workspaceSlug, userId, isPlatformAdmin);
  if (!workspace) {
    throw new Error("Workspace not available.");
  }

  const participants = Array.from(new Set([userId, ...participantIds])).filter(Boolean);
  const state = await readState();
  const existing = state.directThreads.find(
    (thread) =>
      thread.workspaceId === workspace.workspaceId &&
      thread.participantIds.length === participants.length &&
      participants.every((id) => thread.participantIds.includes(id)),
  );
  if (existing) {
    return existing;
  }

  const record: WorkspaceDirectThread = {
    id: buildId("dm"),
    workspaceId: workspace.workspaceId,
    participantIds: participants,
    createdAt: nowIso(),
  };
  state.directThreads.push(record);
  await writeState(state);
  return record;
}

export async function listMessagesForScope({
  workspaceSlug,
  userId,
  isPlatformAdmin,
  channelId,
  directMessageId,
}: {
  workspaceSlug: string;
  userId: string;
  isPlatformAdmin: boolean;
  channelId?: string;
  directMessageId?: string;
}) {
  const workspace = await resolveWorkspaceForUser(workspaceSlug, userId, isPlatformAdmin);
  if (!workspace) {
    throw new Error("Workspace not available.");
  }

  const state = await readState();
  return state.messages
    .filter((message) => message.workspaceId === workspace.workspaceId)
    .filter((message) => (channelId ? message.channelId === channelId : !message.channelId))
    .filter((message) => (directMessageId ? message.directMessageId === directMessageId : !message.directMessageId))
    .sort((left, right) => (left.createdAt > right.createdAt ? 1 : -1));
}

export async function createMessageForScope({
  workspaceSlug,
  userId,
  userLabel,
  isPlatformAdmin,
  channelId,
  directMessageId,
  content,
}: {
  workspaceSlug: string;
  userId: string;
  userLabel: string;
  isPlatformAdmin: boolean;
  channelId?: string;
  directMessageId?: string;
  content: string;
}) {
  const workspace = await resolveWorkspaceForUser(workspaceSlug, userId, isPlatformAdmin);
  if (!workspace) {
    throw new Error("Workspace not available.");
  }

  const mentions = Array.from(content.matchAll(/@([a-zA-Z0-9._-]+)/g)).map((match) => match[1]);
  const recordLinks = Array.from(content.matchAll(/\/workspaces\/[^\s]+/g)).map((match) => ({
    title: "Registro vinculado",
    href: match[0],
  }));

  const state = await readState();
  const record: WorkspaceMessage = {
    id: buildId("msg"),
    workspaceId: workspace.workspaceId,
    channelId,
    directMessageId,
    senderId: userId,
    senderLabel: userLabel,
    content,
    messageType: "message",
    attachments: [],
    mentions,
    recordLinks,
    createdAt: nowIso(),
  };
  state.messages.push(record);

  if (directMessageId) {
    state.directThreads = state.directThreads.map((thread) =>
      thread.id === directMessageId ? { ...thread, lastMessageAt: record.createdAt } : thread,
    );
  }

  await writeState(state);
  return record;
}
