import {
  authorizeCrmWrite,
  findCrmObjectIdByKind,
  normalizeEmail,
  normalizePhone,
  requireSupabaseAdmin,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ workspaceSlug: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeCrmWrite(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const supabase = requireSupabaseAdmin();
    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, "crm_people");
    if (!objectId) return Response.json({ clusters: [] });

    const { data, error } = await supabase
      .from("records")
      .select("id, data, created_at")
      .eq("workspace_id", authorization.workspaceId)
      .eq("object_id", objectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ id: string; data: Record<string, unknown>; created_at: string }>;

    const byEmail = new Map<string, typeof rows>();
    const byPhone = new Map<string, typeof rows>();
    for (const row of rows) {
      const email = normalizeEmail(row.data?.email);
      if (email) {
        if (!byEmail.has(email)) byEmail.set(email, []);
        byEmail.get(email)!.push(row);
      }
      const phone = normalizePhone(row.data?.phone);
      if (phone) {
        if (!byPhone.has(phone)) byPhone.set(phone, []);
        byPhone.get(phone)!.push(row);
      }
    }

    const clusters: Array<{
      key: string;
      keyType: "email" | "phone";
      records: Array<{ id: string; data: Record<string, unknown>; createdAt: string }>;
    }> = [];
    const claimed = new Set<string>();

    for (const [key, group] of byEmail.entries()) {
      if (group.length < 2) continue;
      clusters.push({
        key,
        keyType: "email",
        records: group.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      group.forEach((row) => claimed.add(row.id));
    }
    for (const [key, group] of byPhone.entries()) {
      const remaining = group.filter((row) => !claimed.has(row.id));
      if (remaining.length < 2) continue;
      clusters.push({
        key,
        keyType: "phone",
        records: remaining.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      remaining.forEach((row) => claimed.add(row.id));
    }

    return Response.json({ clusters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load duplicates.";
    return Response.json({ error: message }, { status: 400 });
  }
}
