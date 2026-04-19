/**
 * Hermes messaging gateway config resolver.
 *
 * Builds the `gateway` block returned by
 * `GET /api/workspaces/:slug/agents/:id/mcp-config`. Hermes runs the actual
 * messaging gateway (WhatsApp / Telegram / Email) in-process; Prisma only
 * describes which channels are wired up for a given agent and emits secret
 * *refs*. Raw tokens must never appear in the returned structure.
 *
 * Resolution order per channel:
 *   - whatsapp: requires `channel_config.whatsapp` + a `meta-whatsapp` vault
 *     integration with `auth_type = api_key`.
 *   - telegram: `channel_config.telegram.env_var` pointing at a populated
 *     `TELEGRAM_BOT_TOKEN_*` env var, falling back to common env conventions,
 *     falling back to a `telegram` vault integration.
 *   - email: `channel_config.email.address` plus optional `email-imap` /
 *     `email-smtp` vault integrations that hold the credentials.
 */
import { getIntegrationBySlug } from "@/lib/integrations/store";

export type HermesGatewayChannel =
  | { kind: "whatsapp"; phone_number_id?: string; api_key_ref: string }
  | { kind: "telegram"; bot_token_ref: string; allowed_chat_ids?: string[] }
  | { kind: "email"; address: string; imap_ref?: string; smtp_ref?: string };

export type HermesGatewayConfig = {
  enabled: boolean;
  channels: HermesGatewayChannel[];
};

export type ResolveHermesGatewayConfigInput = {
  workspaceId: string;
  agentId: string;
  channelConfig: Record<string, unknown> | null;
};

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return out.length > 0 ? out : undefined;
}

async function resolveWhatsappChannel(
  workspaceId: string,
  whatsapp: Record<string, unknown>,
): Promise<HermesGatewayChannel | null> {
  let integration = null;
  try {
    integration = await getIntegrationBySlug(workspaceId, "meta-whatsapp");
  } catch (error) {
    console.error("resolveHermesGatewayConfig: whatsapp vault lookup failed", error);
    return null;
  }
  if (!integration || integration.status !== "active") return null;

  const phoneNumberId =
    readString(whatsapp.phone_number_id) ?? readString(whatsapp.phoneNumberId);
  return {
    kind: "whatsapp",
    ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
    api_key_ref: "vault:meta-whatsapp:api_key",
  };
}

async function resolveTelegramChannel(
  workspaceId: string,
  telegram: Record<string, unknown>,
): Promise<HermesGatewayChannel | null> {
  const allowedChatIds = readStringArray(
    telegram.allowed_chat_ids ?? telegram.allowedChatIds,
  );
  const base = allowedChatIds ? { allowed_chat_ids: allowedChatIds } : {};

  const declaredEnvVar = readString(telegram.env_var) ?? readString(telegram.envVar);
  if (declaredEnvVar && process.env[declaredEnvVar]?.trim()) {
    return { kind: "telegram", bot_token_ref: `env:${declaredEnvVar}`, ...base };
  }

  const conventionalName = readString(telegram.bot) ?? readString(telegram.name);
  const candidates: string[] = [];
  if (conventionalName) {
    candidates.push(`TELEGRAM_BOT_TOKEN_${conventionalName.toUpperCase()}`);
  }
  candidates.push("TELEGRAM_BOT_TOKEN_OPERATOR");
  for (const candidate of candidates) {
    if (process.env[candidate]?.trim()) {
      return { kind: "telegram", bot_token_ref: `env:${candidate}`, ...base };
    }
  }

  try {
    const integration = await getIntegrationBySlug(workspaceId, "telegram");
    if (integration && integration.status === "active") {
      return { kind: "telegram", bot_token_ref: "vault:telegram:bot_token", ...base };
    }
  } catch (error) {
    console.error("resolveHermesGatewayConfig: telegram vault lookup failed", error);
  }

  return null;
}

async function resolveEmailChannel(
  workspaceId: string,
  email: Record<string, unknown>,
): Promise<HermesGatewayChannel | null> {
  const address = readString(email.address);
  if (!address) return null;

  let imapRef: string | undefined;
  let smtpRef: string | undefined;
  try {
    const imap = await getIntegrationBySlug(workspaceId, "email-imap");
    if (imap && imap.status === "active") {
      imapRef = "vault:email-imap:password";
    }
  } catch (error) {
    console.error("resolveHermesGatewayConfig: imap vault lookup failed", error);
  }
  try {
    const smtp = await getIntegrationBySlug(workspaceId, "email-smtp");
    if (smtp && smtp.status === "active") {
      smtpRef = "vault:email-smtp:password";
    }
  } catch (error) {
    console.error("resolveHermesGatewayConfig: smtp vault lookup failed", error);
  }

  return {
    kind: "email",
    address,
    ...(imapRef ? { imap_ref: imapRef } : {}),
    ...(smtpRef ? { smtp_ref: smtpRef } : {}),
  };
}

export async function resolveHermesGatewayConfig(
  opts: ResolveHermesGatewayConfigInput,
): Promise<HermesGatewayConfig> {
  const root = readObject(opts.channelConfig) ?? {};
  const channels: HermesGatewayChannel[] = [];

  const whatsapp = readObject(root.whatsapp);
  if (whatsapp) {
    const entry = await resolveWhatsappChannel(opts.workspaceId, whatsapp);
    if (entry) channels.push(entry);
  }

  const telegram = readObject(root.telegram);
  if (telegram) {
    const entry = await resolveTelegramChannel(opts.workspaceId, telegram);
    if (entry) channels.push(entry);
  }

  const email = readObject(root.email);
  if (email) {
    const entry = await resolveEmailChannel(opts.workspaceId, email);
    if (entry) channels.push(entry);
  }

  return {
    enabled: channels.length > 0,
    channels,
  };
}
