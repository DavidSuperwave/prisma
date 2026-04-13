import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ImportRow = Record<string, unknown>;

type ImportRequest = {
  objectId?: string;
  rows?: ImportRow[];
  dedupeFieldKey?: string;
  fileName?: string;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export async function POST(request: Request, context: Context) {
  try {
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
    if (!membership.isPlatformAdmin && membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to import records." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ImportRequest;
    const objectId = body.objectId?.trim();
    const fileName = body.fileName?.trim() || "import.csv";
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const dedupeFieldKey = body.dedupeFieldKey?.trim() || null;

    if (!objectId) {
      return Response.json({ error: "objectId is required." }, { status: 400 });
    }
    if (rows.length === 0) {
      return Response.json({ error: "rows must include at least one record." }, { status: 400 });
    }
    if (rows.length > 500) {
      return Response.json({ error: "A single import batch is limited to 500 rows." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();

    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("id", objectId)
      .eq("workspace_id", membership.workspaceId)
      .maybeSingle();
    if (objectError) {
      throw new Error(objectError.message);
    }
    if (!objectRow) {
      return Response.json({ error: "Object not found in this workspace." }, { status: 404 });
    }

    let existingByDedupe = new Set<string>();
    if (dedupeFieldKey) {
      const { data: existingRecords, error: existingError } = await supabase
        .from("records")
        .select("data")
        .eq("workspace_id", membership.workspaceId)
        .eq("object_id", objectId);
      if (existingError) {
        throw new Error(existingError.message);
      }
      existingByDedupe = new Set(
        (existingRecords ?? [])
          .map((entry) => stringifyValue((entry.data as Record<string, unknown> | null)?.[dedupeFieldKey]))
          .filter(Boolean),
      );
    }

    const toInsert: Array<{
      workspace_id: string;
      object_id: string;
      data: Record<string, unknown>;
      created_by: string;
    }> = [];
    let skipped = 0;

    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        skipped += 1;
        continue;
      }

      if (dedupeFieldKey) {
        const dedupeValue = stringifyValue((row as Record<string, unknown>)[dedupeFieldKey]);
        if (!dedupeValue || existingByDedupe.has(dedupeValue)) {
          skipped += 1;
          continue;
        }
        existingByDedupe.add(dedupeValue);
      }

      toInsert.push({
        workspace_id: membership.workspaceId,
        object_id: objectId,
        data: row as Record<string, unknown>,
        created_by: user.id,
      });
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("records").insert(toInsert);
      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    const imported = toInsert.length;
    const errors: string[] = [];
    const { error: historyError } = await supabase.from("workspace_import_history").insert({
      workspace_id: membership.workspaceId,
      object_id: objectId,
      file_name: fileName,
      total_rows: rows.length,
      imported_rows: imported,
      skipped_rows: skipped,
      error_rows: errors.length,
      summary: {
        errors,
        dedupeFieldKey: dedupeFieldKey ?? undefined,
      },
      created_by: user.id,
    });
    if (historyError) {
      throw new Error(historyError.message);
    }

    return Response.json({
      import: {
        rowsTotal: rows.length,
        rowsImported: imported,
        rowsSkipped: skipped,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import records.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request, context: Context) {
  try {
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

    const searchParams = new URL(request.url).searchParams;
    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_import_history")
      .select("id, workspace_id, object_id, file_name, total_rows, imported_rows, skipped_rows, error_rows, summary, created_by, created_at")
      .eq("workspace_id", membership.workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      imports: (data ?? []).map((row) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        objectId: String(row.object_id),
        fileName: String(row.file_name),
        rowsTotal: Number(row.total_rows ?? 0),
        rowsImported: Number(row.imported_rows ?? 0),
        rowsSkipped: Number(row.skipped_rows ?? 0),
        rowsFailed: Number(row.error_rows ?? 0),
        summary: (row.summary as Record<string, unknown>) ?? {},
        createdBy: row.created_by ? String(row.created_by) : null,
        createdAt: String(row.created_at),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list import history.";
    return Response.json({ error: message }, { status: 400 });
  }
}

