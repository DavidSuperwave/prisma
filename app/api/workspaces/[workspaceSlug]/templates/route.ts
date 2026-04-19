import { authorizeCrmWrite, requireSupabaseAdmin } from "../crm/_shared";
import { extractMergeTags } from "@/lib/templates/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type TemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: unknown;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

type TemplatePayload = {
  name?: string;
  channel?: string;
  subject?: string | null;
  body?: string;
  variables?: unknown[];
  isShared?: boolean;
};

const VALID_CHANNELS = new Set(["email", "sms", "whatsapp"]);

function mapTemplate(row: TemplateRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    channel: row.channel,
    subject: row.subject ?? null,
    body: row.body ?? "",
    variables: Array.isArray(row.variables) ? row.variables : [],
    isShared: Boolean(row.is_shared),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_templates")
      .select("id, workspace_id, name, channel, subject, body, variables, is_shared, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Response.json({ templates: ((data ?? []) as TemplateRow[]).map(mapTemplate) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list templates.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }
    if (!authorization.user.isPlatformAdmin && authorization.membership.role !== "admin") {
      return Response.json({ error: "Admin role required to manage templates." }, { status: 403 });
    }
    const payload = (await request.json().catch(() => ({}))) as TemplatePayload;
    const name = payload.name?.trim();
    const channel = payload.channel?.trim().toLowerCase();
    const body = typeof payload.body === "string" ? payload.body : "";
    if (!name || !channel) {
      return Response.json({ error: "name and channel are required." }, { status: 400 });
    }
    if (!VALID_CHANNELS.has(channel)) {
      return Response.json({ error: "channel must be email, sms or whatsapp." }, { status: 400 });
    }
    const supabase = requireSupabaseAdmin();
    const variables = Array.isArray(payload.variables)
      ? payload.variables
      : extractMergeTags(`${payload.subject ?? ""} ${body}`);

    const { data, error } = await supabase
      .from("workspace_templates")
      .insert({
        workspace_id: authorization.workspaceId,
        name,
        channel,
        subject: payload.subject ?? null,
        body,
        variables,
        is_shared: payload.isShared ?? true,
        created_by: null,
      })
      .select("id, workspace_id, name, channel, subject, body, variables, is_shared, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ template: mapTemplate(data as TemplateRow) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create template.";
    return Response.json({ error: message }, { status: 400 });
  }
}
