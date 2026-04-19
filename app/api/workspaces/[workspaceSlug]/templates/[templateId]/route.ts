import { authorizeCrmWrite, requireSupabaseAdmin } from "../../crm/_shared";
import { extractMergeTags } from "@/lib/templates/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; templateId: string }>;
};

const VALID_CHANNELS = new Set(["email", "sms", "whatsapp"]);

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

async function ensureAdmin(auth: Awaited<ReturnType<typeof authorizeCrmWrite>>) {
  if ("error" in auth) return auth.error;
  if (!auth.user.isPlatformAdmin && auth.membership.role !== "admin") {
    return Response.json({ error: "Admin role required." }, { status: 403 });
  }
  return null;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, templateId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_templates")
      .select("id, workspace_id, name, channel, subject, body, variables, is_shared, created_at, updated_at")
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", templateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Template not found." }, { status: 404 });
    return Response.json({ template: mapTemplate(data as TemplateRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load template.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, templateId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    const adminCheck = await ensureAdmin(authorization);
    if (adminCheck) return adminCheck;
    if ("error" in authorization) return authorization.error;

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (typeof payload.name === "string" && payload.name.trim()) updates.name = payload.name.trim();
    if (typeof payload.channel === "string") {
      const channel = payload.channel.toLowerCase();
      if (!VALID_CHANNELS.has(channel)) {
        return Response.json({ error: "Invalid channel." }, { status: 400 });
      }
      updates.channel = channel;
    }
    if ("subject" in payload) updates.subject = typeof payload.subject === "string" ? payload.subject : null;
    if (typeof payload.body === "string") {
      updates.body = payload.body;
      updates.variables = extractMergeTags(
        `${typeof payload.subject === "string" ? payload.subject : ""} ${payload.body}`,
      );
    }
    if (Array.isArray(payload.variables)) updates.variables = payload.variables;
    if (typeof payload.isShared === "boolean") updates.is_shared = payload.isShared;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updates provided." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_templates")
      .update(updates)
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", templateId)
      .select("id, workspace_id, name, channel, subject, body, variables, is_shared, created_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Template not found." }, { status: 404 });
    return Response.json({ template: mapTemplate(data as TemplateRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update template.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, templateId } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    const adminCheck = await ensureAdmin(authorization);
    if (adminCheck) return adminCheck;
    if ("error" in authorization) return authorization.error;

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("workspace_templates")
      .delete()
      .eq("workspace_id", authorization.workspaceId)
      .eq("id", templateId);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete template.";
    return Response.json({ error: message }, { status: 400 });
  }
}
