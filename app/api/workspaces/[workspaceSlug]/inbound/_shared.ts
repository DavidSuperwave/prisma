import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type InboundWorkspaceContext = {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function resolveInboundToken(request: Request) {
  const headerToken = request.headers.get("x-prisma-inbound-token")?.trim();
  if (headerToken) {
    return headerToken;
  }

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return new URL(request.url).searchParams.get("token")?.trim() ?? "";
}

export async function authorizeInboundWorkspace(workspaceSlug: string, request: Request) {
  const token = resolveInboundToken(request);
  if (!token) {
    return { error: Response.json({ error: "Inbound token is required." }, { status: 401 }) };
  }

  const supabase = requireSupabaseAdmin();
  const { data: workspaceRow, error } = await supabase
    .from("workspaces")
    .select("id, name, subdomain, inbound_token")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!workspaceRow) {
    return { error: Response.json({ error: "Workspace not found." }, { status: 404 }) };
  }

  const expectedToken = typeof workspaceRow.inbound_token === "string" ? workspaceRow.inbound_token : "";
  if (!expectedToken) {
    return { error: Response.json({ error: "Workspace inbound token is not configured." }, { status: 409 }) };
  }
  if (token !== expectedToken) {
    return { error: Response.json({ error: "Invalid inbound token." }, { status: 403 }) };
  }

  return {
    context: {
      workspaceId: String(workspaceRow.id),
      workspaceSlug: String(workspaceRow.subdomain),
      workspaceName: String(workspaceRow.name),
    } satisfies InboundWorkspaceContext,
  };
}

export async function findCrmObjectByKind(
  workspaceId: string,
  kind: "crm_people" | "crm_companies" | "crm_deals",
) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    if (error.message.includes("kind")) {
      return null;
    }
    throw new Error(error.message);
  }
  return data?.id ? String(data.id) : null;
}

export async function findLeadsObjectId(workspaceId: string) {
  const byKind = await findCrmObjectByKind(workspaceId, "crm_people");
  if (byKind) return byKind;

  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_objects")
    .select("id, name, singular_name, plural_name")
    .eq("workspace_id", workspaceId)
    .or("name.ilike.%lead%,singular_name.ilike.%lead%,plural_name.ilike.%lead%,name.ilike.%people%,name.ilike.%contact%")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.id ? String(data.id) : null;
}

export async function logInboundActivity(params: {
  workspaceId: string;
  recordId: string;
  objectId: string;
  subject?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
}) {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from("record_activities").insert({
    workspace_id: params.workspaceId,
    record_id: params.recordId,
    object_id: params.objectId,
    type: "inbound",
    subject: params.subject ?? null,
    body: params.body ?? null,
    data: params.data ?? {},
  });
  if (error && !error.message.includes("record_activities")) {
    console.error("logInboundActivity failed", error.message);
  }
}

export async function createLeadRecord(params: {
  workspaceId: string;
  objectId: string | null;
  data: Record<string, unknown>;
}) {
  if (!params.objectId) {
    return null;
  }
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("records")
    .insert({
      workspace_id: params.workspaceId,
      object_id: params.objectId,
      data: params.data,
      created_by: null,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return String(data.id);
}

export async function createInboundTask(params: {
  workspaceId: string;
  type: string;
  title: string;
  metadata: Record<string, unknown>;
  sourceRecordId?: string | null;
}) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_tasks")
    .insert({
      workspace_id: params.workspaceId,
      source_record_id: params.sourceRecordId ?? null,
      type: params.type,
      title: params.title,
      status: "pending",
      priority: "normal",
      metadata: params.metadata,
      created_by: null,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return String(data.id);
}

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length).trim();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
