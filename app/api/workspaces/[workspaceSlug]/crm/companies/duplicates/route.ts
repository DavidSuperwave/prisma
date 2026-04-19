import {
  authorizeCrmWrite,
  findCrmObjectIdByKind,
  normalizeDomain,
  normalizeText,
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
    const objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, "crm_companies");
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
    const byDomain = new Map<string, typeof rows>();
    const byName = new Map<string, typeof rows>();
    for (const row of rows) {
      const domain = normalizeDomain(row.data?.domain);
      if (domain) {
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain)!.push(row);
      }
      const name = normalizeText(row.data?.name)?.toLowerCase() ?? null;
      if (name) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name)!.push(row);
      }
    }

    const clusters: Array<{
      key: string;
      keyType: "domain" | "name";
      records: Array<{ id: string; data: Record<string, unknown>; createdAt: string }>;
    }> = [];
    const claimed = new Set<string>();

    for (const [key, group] of byDomain.entries()) {
      if (group.length < 2) continue;
      clusters.push({
        key,
        keyType: "domain",
        records: group.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      group.forEach((row) => claimed.add(row.id));
    }
    for (const [key, group] of byName.entries()) {
      const remaining = group.filter((row) => !claimed.has(row.id));
      if (remaining.length < 2) continue;
      clusters.push({
        key,
        keyType: "name",
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
