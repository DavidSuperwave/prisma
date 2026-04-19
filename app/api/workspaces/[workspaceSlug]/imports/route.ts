import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";
import {
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeText,
} from "@/app/api/workspaces/[workspaceSlug]/crm/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ImportRow = Record<string, unknown>;

type ImportMode = "skip" | "update" | "upsert";

type ImportRequest = {
  objectId?: string;
  rows?: ImportRow[];
  dedupeFieldKey?: string;
  dedupeKey?: string;
  mode?: ImportMode;
  fileName?: string;
};

const MAX_IMPORT_ROWS = 5000;
const INSERT_BATCH_SIZE = 500;

const ALLOWED_MODES: ImportMode[] = ["skip", "update", "upsert"];

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

type Normalizer = (value: unknown) => string | null;

function normalizerForField(fieldKey: string, objectKind: string | null): Normalizer {
  if (fieldKey === "email") return normalizeEmail;
  if (fieldKey === "phone") return normalizePhone;
  if (fieldKey === "domain") return normalizeDomain;
  if (objectKind === "crm_people" && fieldKey === "full_name") return normalizeText;
  if (objectKind === "crm_companies" && fieldKey === "name") return normalizeText;
  return (value) => {
    const text = normalizeText(value);
    return text ? text.toLowerCase() : null;
  };
}

function autoDedupeKeyForKind(kind: string | null): string | null {
  if (kind === "crm_people") return "email";
  if (kind === "crm_companies") return "domain";
  return null;
}

function autoFallbackDedupeKey(kind: string | null, primary: string | null): string | null {
  if (kind === "crm_people" && primary === "email") return "phone";
  if (kind === "crm_companies" && primary === "domain") return "name";
  return null;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const membership = await getWorkspaceMembershipForSlug(
      user.id,
      workspaceSlug,
      user.isPlatformAdmin,
    );
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
    const requestedMode = (body.mode ?? "skip") as ImportMode;
    const mode: ImportMode = ALLOWED_MODES.includes(requestedMode) ? requestedMode : "skip";
    const requestedDedupeKey =
      body.dedupeKey?.trim() || body.dedupeFieldKey?.trim() || null;

    if (!objectId) {
      return Response.json({ error: "objectId is required." }, { status: 400 });
    }
    if (rows.length === 0) {
      return Response.json({ error: "rows must include at least one record." }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return Response.json(
        { error: `A single import is limited to ${MAX_IMPORT_ROWS} rows.` },
        { status: 400 },
      );
    }

    const supabase = requireSupabaseAdmin();

    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id, kind")
      .eq("id", objectId)
      .eq("workspace_id", membership.workspaceId)
      .maybeSingle();
    if (objectError) {
      throw new Error(objectError.message);
    }
    if (!objectRow) {
      return Response.json({ error: "Object not found in this workspace." }, { status: 404 });
    }
    const objectKind =
      typeof (objectRow as { kind?: string | null }).kind === "string"
        ? ((objectRow as { kind: string }).kind)
        : null;

    let effectiveDedupeKey = requestedDedupeKey;
    if (!effectiveDedupeKey && mode !== "skip") {
      effectiveDedupeKey = autoDedupeKeyForKind(objectKind);
    }
    if (!effectiveDedupeKey && mode === "skip") {
      effectiveDedupeKey = null;
    }

    const fallbackDedupeKey =
      mode !== "skip" ? autoFallbackDedupeKey(objectKind, effectiveDedupeKey) : null;

    let existing: Array<{ id: string; data: Record<string, unknown> }> = [];
    if (effectiveDedupeKey || fallbackDedupeKey) {
      const { data: existingRecords, error: existingError } = await supabase
        .from("records")
        .select("id, data")
        .eq("workspace_id", membership.workspaceId)
        .eq("object_id", objectId)
        .is("deleted_at", null);
      if (existingError) {
        throw new Error(existingError.message);
      }
      existing = (existingRecords ?? []).map((entry) => ({
        id: String(entry.id),
        data: (entry.data as Record<string, unknown>) ?? {},
      }));
    }

    function buildLookup(fieldKey: string): Map<string, { id: string; data: Record<string, unknown> }> {
      const normalizer = normalizerForField(fieldKey, objectKind);
      const map = new Map<string, { id: string; data: Record<string, unknown> }>();
      for (const record of existing) {
        const key = normalizer(record.data[fieldKey]);
        if (key) map.set(key, record);
      }
      return map;
    }

    const primaryLookup = effectiveDedupeKey ? buildLookup(effectiveDedupeKey) : new Map();
    const fallbackLookup = fallbackDedupeKey ? buildLookup(fallbackDedupeKey) : new Map();

    function findMatch(row: Record<string, unknown>): { id: string; data: Record<string, unknown> } | null {
      if (effectiveDedupeKey) {
        const normalizer = normalizerForField(effectiveDedupeKey, objectKind);
        const key = normalizer(row[effectiveDedupeKey]);
        if (key && primaryLookup.has(key)) return primaryLookup.get(key) ?? null;
      }
      if (fallbackDedupeKey) {
        const normalizer = normalizerForField(fallbackDedupeKey, objectKind);
        const key = normalizer(row[fallbackDedupeKey]);
        if (key && fallbackLookup.has(key)) return fallbackLookup.get(key) ?? null;
      }
      return null;
    }

    function mergeData(
      existingData: Record<string, unknown>,
      incoming: Record<string, unknown>,
    ): Record<string, unknown> {
      const merged: Record<string, unknown> = { ...existingData };
      for (const [key, value] of Object.entries(incoming)) {
        if (value === undefined || value === null) continue;
        if (typeof value === "string" && value.trim().length === 0) continue;
        merged[key] = value;
      }
      return merged;
    }

    const toInsert: Array<{
      workspace_id: string;
      object_id: string;
      data: Record<string, unknown>;
      created_by: string;
    }> = [];
    const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        skipped += 1;
        errors.push({ row: rowIndex, reason: "invalid_row" });
        return;
      }

      const typedRow = row as Record<string, unknown>;
      const match = mode === "skip" && !effectiveDedupeKey ? null : findMatch(typedRow);

      if (match) {
        if (mode === "skip") {
          skipped += 1;
          errors.push({ row: rowIndex, reason: "duplicate" });
          return;
        }
        toUpdate.push({
          id: match.id,
          data: mergeData(match.data, typedRow),
        });
        return;
      }

      if (mode === "update") {
        skipped += 1;
        errors.push({ row: rowIndex, reason: "no_match" });
        return;
      }

      toInsert.push({
        workspace_id: membership.workspaceId,
        object_id: objectId,
        data: typedRow,
        created_by: user.id,
      });
    });

    if (toInsert.length > 0) {
      for (let index = 0; index < toInsert.length; index += INSERT_BATCH_SIZE) {
        const batch = toInsert.slice(index, index + INSERT_BATCH_SIZE);
        const { error: insertError } = await supabase.from("records").insert(batch);
        if (insertError) {
          throw new Error(insertError.message);
        }
        inserted += batch.length;
      }
    }

    if (toUpdate.length > 0) {
      for (const update of toUpdate) {
        const { error: updateError } = await supabase
          .from("records")
          .update({ data: update.data, updated_at: new Date().toISOString() })
          .eq("id", update.id)
          .eq("workspace_id", membership.workspaceId);
        if (updateError) {
          errors.push({ row: -1, reason: `update_failed:${update.id}` });
        } else {
          updated += 1;
        }
      }
    }

    const { error: historyError } = await supabase.from("workspace_import_history").insert({
      workspace_id: membership.workspaceId,
      object_id: objectId,
      file_name: fileName,
      total_rows: rows.length,
      imported_rows: inserted,
      skipped_rows: skipped,
      error_rows: errors.length,
      summary: {
        mode,
        dedupeKey: effectiveDedupeKey ?? undefined,
        fallbackDedupeKey: fallbackDedupeKey ?? undefined,
        inserted,
        updated,
        skipped,
        errors: errors.slice(0, 50),
      },
      created_by: user.id,
    });
    if (historyError) {
      throw new Error(historyError.message);
    }

    let followUpTaskId: string | null = null;
    if (inserted > 0 || updated > 0) {
      const { data: createdTask, error: taskError } = await supabase
        .from("workspace_tasks")
        .insert({
          workspace_id: membership.workspaceId,
          source_object_id: objectId,
          type: "close_import_review",
          title: `Revisar importación: ${fileName}`,
          status: "pending",
          priority: "high",
          approval_required: false,
          approval_status: "not_required",
          metadata: {
            file_name: fileName,
            rows_imported: inserted,
            rows_updated: updated,
            rows_skipped: skipped,
            mode,
          },
          created_by: user.id,
        })
        .select("id")
        .single();

      if (taskError) {
        if (!taskError.message.includes("workspace_tasks")) {
          throw new Error(taskError.message);
        }
      } else {
        followUpTaskId = String(createdTask.id);
      }

      if (followUpTaskId) {
        const { data: activityAgent } = await supabase
          .from("workspace_agents")
          .select("id")
          .eq("workspace_id", membership.workspaceId)
          .in("type", ["worker", "copilot"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (activityAgent?.id) {
          await supabase.from("agent_activity").insert({
            workspace_id: membership.workspaceId,
            agent_id: String(activityAgent.id),
            action: "scenario.close_import.completed",
            details: {
              file_name: fileName,
              object_id: objectId,
              rows_imported: inserted,
              rows_updated: updated,
              rows_skipped: skipped,
              mode,
              task_id: followUpTaskId,
            },
          });
        }
      }
    }

    return Response.json({
      import: {
        mode,
        dedupeKey: effectiveDedupeKey,
        fallbackDedupeKey,
        rowsTotal: rows.length,
        rowsImported: inserted,
        rowsUpdated: updated,
        rowsSkipped: skipped,
        followUpTaskId,
      },
      inserted,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import records.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const membership = await getWorkspaceMembershipForSlug(
      user.id,
      workspaceSlug,
      user.isPlatformAdmin,
    );
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_import_history")
      .select(
        "id, workspace_id, object_id, file_name, total_rows, imported_rows, skipped_rows, error_rows, summary, created_by, created_at",
      )
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
