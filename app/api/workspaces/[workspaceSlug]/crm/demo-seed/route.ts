import { authorizeCrmWrite, requireSupabaseAdmin } from "../_shared";
import { clearDemoData, hasDemoData, seedDemoData } from "@/lib/crmDemoSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(_request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const authorization = await authorizeCrmWrite(workspaceSlug);
  if ("error" in authorization) return authorization.error;
  const supabase = requireSupabaseAdmin();
  const hasDemo = await hasDemoData(supabase, authorization.workspaceId);
  return Response.json({ hasDemo });
}

export async function POST(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (!authorization.membership.isPlatformAdmin && authorization.membership.role !== "admin") {
      return Response.json({ error: "Admin role required." }, { status: 403 });
    }
    const supabase = requireSupabaseAdmin();
    const summary = await seedDemoData(supabase, authorization.workspaceId, authorization.user.id);
    return Response.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to seed demo data.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (!authorization.membership.isPlatformAdmin && authorization.membership.role !== "admin") {
      return Response.json({ error: "Admin role required." }, { status: 403 });
    }
    const supabase = requireSupabaseAdmin();
    const summary = await clearDemoData(supabase, authorization.workspaceId);
    return Response.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear demo data.";
    return Response.json({ error: message }, { status: 400 });
  }
}
