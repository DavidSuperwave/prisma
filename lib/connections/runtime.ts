import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getConnectionById, getConnectionBySlug, getConnectionSecrets, type WorkspaceConnection } from "@/lib/connections/store";
import { applyMapping, findCollection, readPath } from "@/lib/integrations/bindings";
import { listWorkspaceObjects, listWorkspaceRecords } from "@/lib/workspaceStore";
import { logOutboundEvent } from "@/lib/integrations/store";
import { safeEmitEvent } from "@/lib/workflows/engine";

type ConnectionConfig = Record<string, unknown>;

export type ConnectionSyncReport = {
  connectionId: string;
  connectionSlug: string;
  mode: WorkspaceConnection["mode"];
  objectId: string | null;
  objectSlug: string | null;
  fetched: number;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
};

function requireAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function inferRecordKind(objectSlug: string | null) {
  if (!objectSlug) return null;
  const slug = objectSlug.toLowerCase();
  if (slug.includes("people") || slug.includes("person") || slug.includes("contact")) return "crm_people" as const;
  if (slug.includes("company") || slug.includes("account")) return "crm_companies" as const;
  if (slug.includes("deal") || slug.includes("opportunity")) return "crm_deals" as const;
  return null;
}

async function resolveObjectRef(workspaceId: string, config: ConnectionConfig) {
  const objects = await listWorkspaceObjects(workspaceId);
  const objectId = typeof config.objectId === "string" ? config.objectId : null;
  const objectSlug = typeof config.objectSlug === "string" ? config.objectSlug : null;
  const object =
    (objectId ? objects.find((entry) => entry.id === objectId) : null) ??
    (objectSlug ? objects.find((entry) => entry.slug === objectSlug) : null) ??
    null;
  if (!object) {
    throw new Error("Connection target object was not found.");
  }
  return object;
}

function collectRows(payload: unknown, config: ConnectionConfig): unknown[] {
  const collectionPath = typeof config.collectionPath === "string" ? config.collectionPath.trim() : "";
  if (collectionPath) {
    const selected = readPath(payload, collectionPath);
    if (Array.isArray(selected)) return selected;
    if (selected !== undefined && selected !== null) return [selected];
  }
  if (Array.isArray(payload)) return payload;
  const inferred = findCollection(payload);
  if (inferred.length > 0) return inferred;
  if (payload === null || payload === undefined) return [];
  return [payload];
}

async function upsertMappedRows(params: {
  workspaceId: string;
  connection: WorkspaceConnection;
  payload: unknown;
}): Promise<ConnectionSyncReport> {
  const supabase = requireAdmin();
  const config = asObject(params.connection.config);
  const mapping = asObject(config.mapping);
  if (Object.keys(mapping).length === 0) {
    throw new Error("Connection mapping is required before syncing.");
  }
  const matchKey = typeof config.matchKey === "string" && config.matchKey.trim() ? config.matchKey.trim() : null;
  const includeRaw = config.includeRaw === true;
  const upsertMode = config.upsertMode === "replace" ? "replace" : "merge";
  const object = await resolveObjectRef(params.workspaceId, config);
  const rows = collectRows(params.payload, config);
  const existing = matchKey ? await listWorkspaceRecords(params.workspaceId, object.id) : [];
  const byMatch = new Map<string, (typeof existing)[number]>();
  if (matchKey) {
    for (const record of existing) {
      const data = asObject(record.data);
      const value = data[matchKey];
      if (typeof value === "string" && value) byMatch.set(value, record);
      else if (typeof value === "number") byMatch.set(String(value), record);
    }
  }

  const report: ConnectionSyncReport = {
    connectionId: params.connection.id,
    connectionSlug: params.connection.slug,
    mode: params.connection.mode,
    objectId: object.id,
    objectSlug: object.slug,
    fetched: rows.length,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const mapped = applyMapping(mapping, row);
      if (includeRaw) mapped._connection_raw = row;
      if (Object.keys(mapped).length === 0) continue;
      const keyValue = matchKey ? mapped[matchKey] : null;
      const key = typeof keyValue === "string" ? keyValue : typeof keyValue === "number" ? String(keyValue) : null;
      const existingRecord = key ? byMatch.get(key) : null;
      if (existingRecord) {
        const before = asObject(existingRecord.data);
        const nextData = upsertMode === "replace" ? mapped : { ...before, ...mapped };
        if (JSON.stringify(before) === JSON.stringify(nextData)) continue;
        await supabase.from("records").update({ data: nextData }).eq("id", existingRecord.id);
        report.updated += 1;
        await safeEmitEvent({
          supabase,
          workspaceId: params.workspaceId,
          type: "record.updated",
          record: {
            id: existingRecord.id,
            objectId: object.id,
            kind: inferRecordKind(object.slug),
            data: nextData,
          },
          extra: {
            source: "connection.sync",
            connection_id: params.connection.id,
            connection_slug: params.connection.slug,
          },
        });
      } else {
        const insert = await supabase
          .from("records")
          .insert({
            workspace_id: params.workspaceId,
            object_id: object.id,
            data: mapped,
          })
          .select("id")
          .single();
        if (insert.error) throw new Error(insert.error.message);
        report.created += 1;
        if (key) {
          byMatch.set(key, {
            id: String(insert.data.id),
            workspaceId: params.workspaceId,
            objectId: object.id,
            data: mapped,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        await safeEmitEvent({
          supabase,
          workspaceId: params.workspaceId,
          type: "record.created",
          record: {
            id: String(insert.data.id),
            objectId: object.id,
            kind: inferRecordKind(object.slug),
            data: mapped,
          },
          extra: {
            source: "connection.sync",
            connection_id: params.connection.id,
            connection_slug: params.connection.slug,
          },
        });
      }
    } catch (error) {
      report.failed += 1;
      if (report.errors.length < 5) {
        report.errors.push(error instanceof Error ? error.message : "Failed to map payload row.");
      }
    }
  }

  return report;
}

function buildUrl(baseUrl: string, path: string, query: Record<string, unknown>) {
  const url = path.startsWith("http://") || path.startsWith("https://")
    ? new URL(path)
    : new URL(path ? path.replace(/^\/+/, "") : "", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function applyAuth(params: {
  connection: WorkspaceConnection;
  config: ConnectionConfig;
  secrets: Record<string, string>;
  url: URL;
  headers: Headers;
}) {
  const authLocation = typeof params.config.authLocation === "string" ? params.config.authLocation : "header";
  const authHeader = typeof params.config.authHeader === "string" && params.config.authHeader
    ? params.config.authHeader
    : params.connection.authType === "api_key"
      ? "x-api-key"
      : "Authorization";
  const authScheme = typeof params.config.authScheme === "string" && params.config.authScheme
    ? params.config.authScheme
    : "Bearer";
  const authQueryParam = typeof params.config.authQueryParam === "string" && params.config.authQueryParam
    ? params.config.authQueryParam
    : "api_key";
  const secretValue =
    params.secrets.apiKey ??
    params.secrets.api_key ??
    params.secrets.bearer ??
    params.secrets.token ??
    params.secrets.secret ??
    null;
  if (!secretValue) return;

  if (authLocation === "query") {
    params.url.searchParams.set(authQueryParam, secretValue);
    return;
  }
  if (params.connection.authType === "api_key") {
    params.headers.set(authHeader, secretValue);
    return;
  }
  if (params.connection.authType === "none" || params.connection.authType === "webhook") {
    return;
  }
  params.headers.set(authHeader, `${authScheme} ${secretValue}`.trim());
}

function parseResponseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function runConnectionSync(input: {
  workspaceId: string;
  connectionId?: string;
  connectionSlug?: string;
}): Promise<ConnectionSyncReport> {
  const configRef = input.connectionId ? { by: "id" as const, value: input.connectionId } : { by: "slug" as const, value: input.connectionSlug ?? "" };
  if (!configRef.value) {
    throw new Error("connectionId or connectionSlug is required.");
  }
  const connection =
    configRef.by === "id"
      ? await getConnectionById(input.workspaceId, configRef.value)
      : await getConnectionBySlug(input.workspaceId, configRef.value);
  if (!connection) throw new Error("Connection not found.");
  if (connection.status !== "active") throw new Error(`Connection '${connection.slug}' is ${connection.status}.`);
  if (connection.mode !== "http_poll" && connection.mode !== "manual") {
    throw new Error(`Connection '${connection.slug}' does not support scheduled pulls.`);
  }
  const config = asObject(connection.config);
  const baseUrl = connection.baseUrl || (typeof config.baseUrl === "string" ? config.baseUrl : "");
  if (!baseUrl) throw new Error("Connection baseUrl is required.");
  const method = String(config.method ?? "GET").toUpperCase();
  const path = typeof config.path === "string" ? config.path : "/";
  const query = asObject(config.query);
  const headers = new Headers();
  for (const [key, value] of Object.entries(asObject(config.headers))) {
    if (typeof value === "string" && value) headers.set(key, value);
  }
  const url = buildUrl(baseUrl, path, query);
  const secrets = await getConnectionSecrets(connection.id);
  applyAuth({ connection, config, secrets, url, headers });

  const bodyTemplate = config.body;
  let body: string | undefined;
  if (bodyTemplate !== undefined && bodyTemplate !== null && method !== "GET" && method !== "HEAD") {
    body = JSON.stringify(bodyTemplate);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { method, headers, body });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    await logOutboundEvent({
      workspaceId: input.workspaceId,
      kind: "connections.sync",
      targetUrl: url.toString(),
      requestBody: bodyTemplate ?? null,
      ok: false,
      error: message,
    });
    throw new Error(message);
  }
  const text = await response.text();
  const payload = parseResponseBody(text);
  await logOutboundEvent({
    workspaceId: input.workspaceId,
    kind: "connections.sync",
    targetUrl: url.toString(),
    requestBody: bodyTemplate ?? null,
    responseStatus: response.status,
    responseBody: response.ok ? null : payload,
    ok: response.ok,
    error: response.ok ? null : `HTTP ${response.status}`,
  });
  if (!response.ok) {
    throw new Error(`Connection sync failed with HTTP ${response.status}.`);
  }
  return upsertMappedRows({
    workspaceId: input.workspaceId,
    connection,
    payload,
  });
}

export async function ingestConnectionPayload(input: {
  workspaceId: string;
  connectionId?: string;
  connectionSlug?: string;
  payload: unknown;
}): Promise<ConnectionSyncReport> {
  const connection =
    input.connectionId
      ? await getConnectionById(input.workspaceId, input.connectionId)
      : await getConnectionBySlug(input.workspaceId, input.connectionSlug ?? "");
  if (!connection) throw new Error("Connection not found.");
  if (connection.status !== "active") throw new Error(`Connection '${connection.slug}' is ${connection.status}.`);
  if (connection.mode !== "webhook_inbound") {
    throw new Error(`Connection '${connection.slug}' is not configured for inbound webhooks.`);
  }
  return upsertMappedRows({
    workspaceId: input.workspaceId,
    connection,
    payload: input.payload,
  });
}
