import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  listWorkspaceMembershipsForUser,
  type PrismaCrmKind,
} from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { matchesFilter, parseFilterDsl } from "@/lib/crm/filters";

type Context = {
  params: Promise<{ workspaceSlug: string; entity: string }>;
};

const ENTITY_TO_KIND: Record<string, PrismaCrmKind> = {
  people: "crm_people",
  companies: "crm_companies",
  deals: "crm_deals",
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str: string;
  if (typeof value === "string") {
    str = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    str = String(value);
  } else {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, entity } = await context.params;
    const kind = ENTITY_TO_KIND[entity];
    if (!kind) {
      return Response.json({ error: "Unsupported CRM entity." }, { status: 404 });
    }

    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
    const membership = memberships.find((m) => m.workspace.subdomain === workspaceSlug);
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();

    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("workspace_id", membership.workspaceId)
      .eq("kind", kind)
      .maybeSingle();
    if (objectError) throw new Error(objectError.message);
    if (!objectRow) {
      return Response.json({ error: "CRM object not provisioned." }, { status: 409 });
    }
    const objectId = String(objectRow.id);

    const { data: fieldsData, error: fieldsError } = await supabase
      .from("workspace_fields")
      .select("id, key, name, type, sort_order, is_locked")
      .eq("workspace_id", membership.workspaceId)
      .eq("object_id", objectId)
      .order("sort_order", { ascending: true });
    if (fieldsError) throw new Error(fieldsError.message);

    const fields = (fieldsData ?? []).map((row) => ({
      id: String(row.id),
      key: String(row.key),
      name: String(row.name),
      type: String(row.type),
      sortOrder: Number(row.sort_order ?? 0),
      isLocked: Boolean(row.is_locked),
    }));

    const searchParams = new URL(request.url).searchParams;
    const viewId = searchParams.get("view");
    const idsParam = searchParams.get("ids");
    const idsSelection = idsParam
      ? idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    const headers: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    };

    let resolvedFilter: ReturnType<typeof parseFilterDsl> | null = null;
    let resolvedColumnKeys: string[] = [];
    if (viewId) {
      const { data: viewRow, error: viewError } = await supabase
        .from("workspace_views")
        .select("id, workspace_id, object_id, scope, created_by_user_id, filter_dsl, column_config")
        .eq("id", viewId)
        .eq("workspace_id", membership.workspaceId)
        .eq("object_id", objectId)
        .maybeSingle();

      if (viewError || !viewRow) {
        headers["X-View-Warning"] = "View not found";
      } else {
        const scope = String((viewRow as { scope?: string }).scope ?? "private");
        const ownerId = (viewRow as { created_by_user_id?: string | null }).created_by_user_id ?? null;
        const isVisible = scope === "private" ? ownerId === user.id : true;
        if (!isVisible) {
          headers["X-View-Warning"] = "View not found";
        } else {
          const rawFilter = (viewRow as { filter_dsl?: unknown }).filter_dsl;
          const parsed = parseFilterDsl(rawFilter);
          if (parsed === null) {
            headers["X-View-Warning"] = "View has invalid filter";
          } else if (!parsed || Object.keys(parsed as Record<string, unknown>).length === 0) {
            headers["X-View-Warning"] = "View has no filter";
          } else {
            resolvedFilter = parsed;
          }

          const rawColumnConfig = (viewRow as { column_config?: unknown }).column_config;
          if (Array.isArray(rawColumnConfig) && rawColumnConfig.length > 0) {
            resolvedColumnKeys = rawColumnConfig
              .map((entry) => {
                if (typeof entry === "string") return entry;
                if (entry && typeof entry === "object" && "key" in (entry as Record<string, unknown>)) {
                  const key = (entry as { key?: unknown }).key;
                  return typeof key === "string" ? key : "";
                }
                return "";
              })
              .filter((key): key is string => key.length > 0);
          }
        }
      }
    }

    let query = supabase
      .from("records")
      .select("id, data, created_at, updated_at")
      .eq("workspace_id", membership.workspaceId)
      .eq("object_id", objectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50000);

    if (idsSelection && idsSelection.length > 0) {
      query = query.in("id", idsSelection);
    }

    const { data: records, error: recordsError } = await query;
    if (recordsError) throw new Error(recordsError.message);

    const fetchedRecords = records ?? [];
    const filteredRecords = resolvedFilter
      ? fetchedRecords.filter((row) => {
          const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
          try {
            return matchesFilter(data, resolvedFilter);
          } catch {
            return false;
          }
        })
      : fetchedRecords;

    type OutputColumn = {
      key: string;
      label: string;
      compute?: (data: Record<string, unknown>) => unknown;
      always?: boolean;
    };
    const fieldColumns: OutputColumn[] = fields.map((field) => ({ key: field.key, label: field.name }));
    const computedColumns: OutputColumn[] = [];
    if (kind === "crm_people") {
      computedColumns.push({
        key: "__score",
        label: "Score",
        compute: (data) => (typeof data.score === "number" ? data.score : ""),
        always: true,
      });
    } else if (kind === "crm_deals") {
      computedColumns.push({
        key: "__weighted_amount",
        label: "Monto ponderado",
        compute: (data) => {
          const amount =
            typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0);
          const confidence =
            typeof data.confidence === "number"
              ? data.confidence
              : Number(data.confidence ?? 0);
          if (!Number.isFinite(amount) || !Number.isFinite(confidence)) return "";
          return Math.round(amount * (confidence / 100) * 100) / 100;
        },
        always: true,
      });
    }

    const idColumn: OutputColumn = { key: "id", label: "ID", always: true };
    const createdColumn: OutputColumn = { key: "__created_at", label: "Creado", always: true };
    const updatedColumn: OutputColumn = { key: "__updated_at", label: "Actualizado", always: true };

    let columns: OutputColumn[];
    if (resolvedColumnKeys.length > 0) {
      const fieldByKey = new Map(fieldColumns.map((col) => [col.key, col] as const));
      const picked: OutputColumn[] = [];
      for (const key of resolvedColumnKeys) {
        const col = fieldByKey.get(key);
        if (col && !picked.some((p) => p.key === col.key)) picked.push(col);
      }
      columns = [idColumn, ...picked, ...computedColumns, createdColumn, updatedColumn];
    } else {
      columns = [idColumn, ...fieldColumns, ...computedColumns, createdColumn, updatedColumn];
    }

    const lines: string[] = [];
    lines.push(columns.map((c) => csvEscape(c.label)).join(","));

    for (const row of filteredRecords) {
      const data = ((row as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const values = columns.map((col) => {
        if (col.key === "id") return csvEscape(String((row as { id: string }).id));
        if (col.key === "__created_at") return csvEscape((row as { created_at?: string }).created_at ?? "");
        if (col.key === "__updated_at") return csvEscape((row as { updated_at?: string }).updated_at ?? "");
        if (col.compute) return csvEscape(col.compute(data));
        return csvEscape(data[col.key]);
      });
      lines.push(values.join(","));
    }

    const body = lines.join("\r\n") + "\r\n";
    return new Response(body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export CSV.";
    return Response.json({ error: message }, { status: 400 });
  }
}
