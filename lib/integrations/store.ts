/**
 * Server-side store for workspace_integrations + workspace_integration_secrets.
 * All secret reads go through decryptSecret; plaintext never returns to a
 * client-side caller.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSecret, encryptSecret, tryDecryptSecret } from "@/lib/secrets";

type AuthType = "api_key" | "bearer" | "oauth" | "mcp" | "hmac";

export type IntegrationPublic = {
  id: string;
  workspaceId: string;
  slug: string;
  label: string;
  provider: string;
  authType: AuthType;
  status: "active" | "paused" | "error";
  config: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  hasSecrets: boolean;
};

export type CreateIntegrationInput = {
  workspaceId: string;
  slug?: string;
  label: string;
  provider: string;
  authType?: AuthType;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  createdBy?: string | null;
};

export type UpdateIntegrationInput = {
  label?: string;
  status?: "active" | "paused" | "error";
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

function requireAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return supabase;
}

function toPublic(row: Record<string, unknown>, hasSecrets: boolean): IntegrationPublic {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    slug: String(row.slug),
    label: String(row.label),
    provider: String(row.provider),
    authType: String(row.auth_type) as AuthType,
    status: String(row.status) as "active" | "paused" | "error",
    config: (row.config as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    hasSecrets,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "integration";
}

async function ensureUniqueSlug(workspaceId: string, base: string): Promise<string> {
  const supabase = requireAdmin();
  let candidate = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const { data } = await supabase
      .from("workspace_integrations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${slugify(base)}-${i + 2}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

export async function listIntegrations(workspaceId: string): Promise<IntegrationPublic[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_integrations")
    .select("id, workspace_id, slug, label, provider, auth_type, status, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: secretRows } = await supabase
    .from("workspace_integration_secrets")
    .select("integration_id")
    .in("integration_id", rows.map((r) => String(r.id)));
  const withSecrets = new Set((secretRows ?? []).map((r) => String(r.integration_id)));
  return rows.map((row) => toPublic(row as Record<string, unknown>, withSecrets.has(String(row.id))));
}

export async function getIntegrationBySlug(
  workspaceId: string,
  slug: string,
): Promise<IntegrationPublic | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_integrations")
    .select("id, workspace_id, slug, label, provider, auth_type, status, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secretRows } = await supabase
    .from("workspace_integration_secrets")
    .select("integration_id")
    .eq("integration_id", String(data.id));
  return toPublic(data as Record<string, unknown>, (secretRows ?? []).length > 0);
}

export async function getIntegrationById(
  workspaceId: string,
  integrationId: string,
): Promise<IntegrationPublic | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_integrations")
    .select("id, workspace_id, slug, label, provider, auth_type, status, config, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", integrationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secretRows } = await supabase
    .from("workspace_integration_secrets")
    .select("integration_id")
    .eq("integration_id", String(data.id));
  return toPublic(data as Record<string, unknown>, (secretRows ?? []).length > 0);
}

export async function createIntegration(input: CreateIntegrationInput): Promise<IntegrationPublic> {
  const supabase = requireAdmin();
  const slugBase = input.slug?.trim() || input.label || input.provider;
  const slug = await ensureUniqueSlug(input.workspaceId, slugBase);
  const { data, error } = await supabase
    .from("workspace_integrations")
    .insert({
      workspace_id: input.workspaceId,
      slug,
      label: input.label,
      provider: input.provider,
      auth_type: input.authType ?? "api_key",
      config: input.config ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id, workspace_id, slug, label, provider, auth_type, status, config, created_by, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  const integrationId = String(data.id);
  if (input.secrets) {
    await replaceSecrets(integrationId, input.secrets);
  }
  return toPublic(data as Record<string, unknown>, Boolean(input.secrets && Object.keys(input.secrets).length > 0));
}

export async function updateIntegration(
  workspaceId: string,
  integrationId: string,
  input: UpdateIntegrationInput,
): Promise<IntegrationPublic | null> {
  const supabase = requireAdmin();
  const patch: Record<string, unknown> = {};
  if (typeof input.label === "string") patch.label = input.label;
  if (typeof input.status === "string") patch.status = input.status;
  if (input.config) patch.config = input.config;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("workspace_integrations")
      .update(patch)
      .eq("workspace_id", workspaceId)
      .eq("id", integrationId);
    if (error) throw new Error(error.message);
  }
  if (input.secrets) {
    await replaceSecrets(integrationId, input.secrets);
  }
  return getIntegrationById(workspaceId, integrationId);
}

export async function deleteIntegration(workspaceId: string, integrationId: string): Promise<boolean> {
  const supabase = requireAdmin();
  const { error } = await supabase
    .from("workspace_integrations")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", integrationId);
  if (error) throw new Error(error.message);
  return true;
}

async function replaceSecrets(integrationId: string, secrets: Record<string, string>) {
  const supabase = requireAdmin();
  for (const [keyName, plaintext] of Object.entries(secrets)) {
    if (typeof plaintext !== "string" || plaintext.length === 0) continue;
    const env = encryptSecret(plaintext);
    const { error } = await supabase
      .from("workspace_integration_secrets")
      .upsert(
        {
          integration_id: integrationId,
          key_name: keyName,
          ciphertext: env.ciphertext,
          iv: env.iv,
          auth_tag: env.authTag,
        },
        { onConflict: "integration_id,key_name" },
      );
    if (error) throw new Error(error.message);
  }
}

export async function getIntegrationSecrets(integrationId: string): Promise<Record<string, string>> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_integration_secrets")
    .select("key_name, ciphertext, iv, auth_tag")
    .eq("integration_id", integrationId);
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

export async function getIntegrationSecret(
  integrationId: string,
  keyName: string,
): Promise<string | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("workspace_integration_secrets")
    .select("ciphertext, iv, auth_tag")
    .eq("integration_id", integrationId)
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

export async function logOutboundEvent(params: {
  workspaceId: string;
  integrationId?: string | null;
  kind: string;
  targetUrl?: string | null;
  requestBody?: unknown;
  responseStatus?: number | null;
  responseBody?: unknown;
  ok: boolean;
  error?: string | null;
  createdBy?: string | null;
}) {
  const supabase = requireAdmin();
  await supabase.from("workspace_outbound_events").insert({
    workspace_id: params.workspaceId,
    integration_id: params.integrationId ?? null,
    kind: params.kind,
    target_url: params.targetUrl ?? null,
    request_body: params.requestBody ?? null,
    response_status: params.responseStatus ?? null,
    response_body: params.responseBody ?? null,
    ok: params.ok,
    error: params.error ?? null,
    created_by: params.createdBy ?? null,
  });
}
