import { getCurrentAppUser, type AuthenticatedAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getWorkspaceMembershipForSlug,
  type PrismaCrmKind,
  type WorkspaceMembership,
} from "@/lib/workspaceStore";

export type CrmAuthorization = {
  user: AuthenticatedAppUser;
  membership: WorkspaceMembership;
  workspaceId: string;
};

export type CrmAuthorizationResult = CrmAuthorization | { error: Response };

export async function authorizeCrmWrite(workspaceSlug: string): Promise<CrmAuthorizationResult> {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  if (!membership.isPlatformAdmin && membership.role === "viewer") {
    return {
      error: Response.json({ error: "You do not have permission to modify CRM records." }, { status: 403 }),
    };
  }

  return { user, membership, workspaceId: membership.workspaceId };
}

/**
 * Read-only authorization: viewers (and above) may read CRM data.
 */
export async function authorizeCrmRead(workspaceSlug: string): Promise<CrmAuthorizationResult> {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  return { user, membership, workspaceId: membership.workspaceId };
}

export function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function findCrmObjectIdByKind(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
  kind: PrismaCrmKind,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? String(data.id) : null;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes("@") ? trimmed : null;
}

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9+]/g, "");
  return digits.length >= 7 ? digits : null;
}

export function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const cleaned = trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return cleaned.length > 0 && cleaned.includes(".") ? cleaned : null;
}

export function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function findExistingRecordByJsonKey(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
  objectId: string,
  jsonKey: string,
  jsonValue: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .is("deleted_at", null)
    .limit(500);

  if (error || !data) return null;

  const needle = jsonValue.toLowerCase();
  const match = (data as Array<{ id: string; data: Record<string, unknown> }>).find((row) => {
    const value = row.data?.[jsonKey];
    if (typeof value !== "string") return false;
    return value.trim().toLowerCase() === needle;
  });
  return match ? String(match.id) : null;
}

export async function findRecordByFieldValues(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
  objectId: string,
  candidates: Array<{ key: string; value: string }>,
): Promise<string | null> {
  for (const candidate of candidates) {
    const id = await findExistingRecordByJsonKey(
      supabase,
      workspaceId,
      objectId,
      candidate.key,
      candidate.value,
    );
    if (id) return id;
  }
  return null;
}

export type LogActivityInput = {
  workspaceId: string;
  recordId: string;
  objectId: string;
  type: string;
  subject?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  authorUserId?: string | null;
  authorAgentId?: string | null;
};

export async function logRecordActivity(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  input: LogActivityInput,
) {
  const { error } = await supabase.from("record_activities").insert({
    workspace_id: input.workspaceId,
    record_id: input.recordId,
    object_id: input.objectId,
    type: input.type,
    subject: input.subject ?? null,
    body: input.body ?? null,
    data: input.data ?? {},
    author_user_id: input.authorUserId ?? null,
    author_agent_id: input.authorAgentId ?? null,
  });

  if (error) {
    console.error("record_activities insert failed", error.message);
  }

  // Best-effort: recompute lead score for people records on any activity write.
  try {
    const { data: row } = await supabase
      .from("workspace_objects")
      .select("kind")
      .eq("id", input.objectId)
      .maybeSingle();
    const kind = (row as { kind?: string | null } | null)?.kind ?? null;
    if (kind === "crm_people") {
      const { safeRecomputePersonScore } = await import("@/lib/crm/score");
      await safeRecomputePersonScore(supabase, input.workspaceId, input.recordId);
    }
  } catch (scoreError) {
    console.error("[crm] activity score hook failed", scoreError instanceof Error ? scoreError.message : scoreError);
  }
}

export function mapRecordRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    data: (row.data as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
