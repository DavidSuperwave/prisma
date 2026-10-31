import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSecret, encryptSecret, tryDecryptSecret } from "@/lib/secrets";

export type WorkspaceConnection = {
  id: string;
  workspaceId: string;
  slug: string;
  label: string;
  provider: string;
  authType: "api_key" | "bearer" | "oauth" | "mcp" | "hmac" | "webhook" | "none";
  status: "active" | "paused" | "error";
  mode: "http_poll" | "webhook_inbound" | "mcp_server" | "manual";
  baseUrl: string | null;
  webhookPath: string | null;
  webhookToken: string | null;
  config: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  hasSecrets: boolean;
};

type CreateConnectionInput = {
  workspaceId: string;
  slug?: string;
  label: string;
  provider?: string;
  authType?: WorkspaceConnection["authType"];
  mode?: WorkspaceConnection["mode"];
  baseUrl?: string | null;
  webhookPath?: string | null;
  webhookToken?: string | null;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  createdBy?: string | null;
};

type UpdateConnectionInput = {
  label?: string;
  provider?: string;
  authType?: WorkspaceConnection["authType"];
  status?: WorkspaceConnection["status"];
  mode?: WorkspaceConnection["mode"];
  baseUrl?: string | null;
  webhookPath?: string | null;
  webhookToken?: string | null;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

function requireAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "connection";
}

function mapConnection(row: Record<string, unknown>, hasSecrets: boolean): WorkspaceConnection {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    slug: String(row.slug),
    label: String(row.label),
    provider: String(row.provider),
    authType: String(row.auth_type) as WorkspaceConnection["authType"],
    status: String(row.status) as WorkspaceConnection["status"],
    mode: String(row.mode) as WorkspaceConnection["mode"],
    baseUrl: row.base_url ? String(row.base_url) : null,
    webhookPath: row.webhook_path ? String(row.webhook_path) : null,
    webhookToken: row.webhook_token ? String(row.webhook_token) : null,
    config: (row.config as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    hasSecrets,
  };
}

async function ensureUniqueSlug(workspaceId: string, base: string) {
  const supabase = requireAdmin();
  let candidate = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const { data } = await supabase
      .from("workspace_connections")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${slugify(base)}-${i + 2}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

export async function listConnections(workspaceId: string): Promise<WorkspaceConnection[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_connections")
    .select("id, workspace_id, slug, label, provider, auth_type, status, mode, base_url, webhook_path, webhook_token, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: secretRows } = await supabase
    .from("workspace_connection_secrets")
    .select("connection_id")
    .in("connection_id", rows.map((row) => String(row.id)));
  const secretIds = new Set((secretRows ?? []).map((row) => String(row.connection_id)));
  return rows.map((row) => mapConnection(row as Record<string, unknown>, secretIds.has(String(row.id))));
}

export async function getConnectionBySlug(workspaceId: string, slug: string): Promise<WorkspaceConnection | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_connections")
    .select("id, workspace_id, slug, label, provider, auth_type, status, mode, base_url, webhook_path, webhook_token, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secretRows } = await supabase
    .from("workspace_connection_secrets")
    .select("connection_id")
    .eq("connection_id", String(data.id));
  return mapConnection(data as Record<string, unknown>, (secretRows ?? []).length > 0);
}

export async function getConnectionByWebhook(
  workspaceId: string,
  webhookValue: string,
): Promise<WorkspaceConnection | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_connections")
    .select("id, workspace_id, slug, label, provider, auth_type, status, mode, base_url, webhook_path, webhook_token, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("webhook_path", webhookValue)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secretRows } = await supabase
    .from("workspace_connection_secrets")
    .select("connection_id")
    .eq("connection_id", String(data.id));
  return mapConnection(data as Record<string, unknown>, (secretRows ?? []).length > 0);
}

export async function getConnectionById(workspaceId: string, connectionId: string): Promise<WorkspaceConnection | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_connections")
    .select("id, workspace_id, slug, label, provider, auth_type, status, mode, base_url, webhook_path, webhook_token, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secretRows } = await supabase
    .from("workspace_connection_secrets")
    .select("connection_id")
    .eq("connection_id", String(data.id));
  return mapConnection(data as Record<string, unknown>, (secretRows ?? []).length > 0);
}

export async function createConnection(input: CreateConnectionInput): Promise<WorkspaceConnection> {
  const supabase = requireAdmin();
  const slug = await ensureUniqueSlug(input.workspaceId, input.slug?.trim() || input.label || input.provider || "connection");
  const { data, error } = await supabase
    .from("workspace_connections")
    .insert({
      workspace_id: input.workspaceId,
      slug,
      label: input.label,
      provider: input.provider ?? "custom",
      auth_type: input.authType ?? "api_key",
      status: "active",
      mode: input.mode ?? "http_poll",
      base_url: input.baseUrl ?? null,
      webhook_path: input.webhookPath ?? null,
      webhook_token: input.webhookToken ?? null,
      config: input.config ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id, workspace_id, slug, label, provider, auth_type, status, mode, base_url, webhook_path, webhook_token, config, created_by, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  const connectionId = String(data.id);
  if (input.secrets && Object.keys(input.secrets).length > 0) {
    await replaceConnectionSecrets(connectionId, input.secrets);
  }
  return mapConnection(data as Record<string, unknown>, Boolean(input.secrets && Object.keys(input.secrets).length > 0));
}

export async function updateConnection(
  workspaceId: string,
  connectionId: string,
  input: UpdateConnectionInput,
): Promise<WorkspaceConnection | null> {
  const supabase = requireAdmin();
  const patch: Record<string, unknown> = {};
  if (typeof input.label === "string") patch.label = input.label;
  if (typeof input.provider === "string") patch.provider = input.provider;
  if (typeof input.authType === "string") patch.auth_type = input.authType;
  if (typeof input.status === "string") patch.status = input.status;
  if (typeof input.mode === "string") patch.mode = input.mode;
  if (input.baseUrl !== undefined) patch.base_url = input.baseUrl;
  if (input.webhookPath !== undefined) patch.webhook_path = input.webhookPath;
  if (input.webhookToken !== undefined) patch.webhook_token = input.webhookToken;
  if (input.config !== undefined) patch.config = input.config;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("workspace_connections")
      .update(patch)
      .eq("workspace_id", workspaceId)
      .eq("id", connectionId);
    if (error) throw new Error(error.message);
  }
  if (input.secrets) {
    await replaceConnectionSecrets(connectionId, input.secrets);
  }
  return getConnectionById(workspaceId, connectionId);
}

export async function deleteConnection(workspaceId: string, connectionId: string) {
  const supabase = requireAdmin();
  const { error } = await supabase
    .from("workspace_connections")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", connectionId);
  if (error) throw new Error(error.message);
  return true;
}

async function replaceConnectionSecrets(connectionId: string, secrets: Record<string, string>) {
  const supabase = requireAdmin();
  for (const [keyName, plaintext] of Object.entries(secrets)) {
    if (typeof plaintext !== "string" || plaintext.length === 0) continue;
    const envelope = encryptSecret(plaintext);
    const { error } = await supabase
      .from("workspace_connection_secrets")
      .upsert(
        {
          connection_id: connectionId,
          key_name: keyName,
          ciphertext: envelope.ciphertext,
          iv: envelope.iv,
          auth_tag: envelope.authTag,
        },
        { onConflict: "connection_id,key_name" },
      );
    if (error) throw new Error(error.message);
  }
}

export async function getConnectionSecrets(connectionId: string): Promise<Record<string, string>> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_connection_secrets")
    .select("key_name, ciphertext, iv, auth_tag")
    .eq("connection_id", connectionId);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const attempt = tryDecryptSecret({
      ciphertext: String(row.ciphertext),
      iv: String(row.iv),
      authTag: String(row.auth_tag),
    });
    if (attempt.ok) out[String(row.key_name)] = attempt.value;
  }
  return out;
}

export async function getConnectionSecret(connectionId: string, keyName: string): Promise<string | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_connection_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("connection_id", connectionId)
    .eq("key_name", keyName)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return decryptSecret({
    ciphertext: String(data.ciphertext),
    iv: String(data.iv),
    authTag: String(data.auth_tag),
  });
}
