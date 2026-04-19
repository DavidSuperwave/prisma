/**
 * Helpers for the WhatsApp pairing sidecar that runs alongside the Hermes
 * gateway container. The sidecar exposes /v1/channels/whatsapp/{status,pair,logout}
 * on a different port than the Hermes API server (default 8643 vs 8642).
 *
 * These helpers derive the sidecar base URL from the stored agent row and
 * normalise status responses into the shape the Prisma UI expects.
 */

export type ChannelStatusSnapshot = {
  status: string;
  paired: boolean;
  qr: string | null;
  lastSeen: string | null;
  lastError?: string | null;
};

export const WHATSAPP_SIDECAR_DEFAULT_PORT = "8643";

function readSidecarOverride(channelConfig: Record<string, unknown> | null | undefined): string | null {
  if (!channelConfig || typeof channelConfig !== "object") return null;
  const whatsapp = (channelConfig as Record<string, unknown>).whatsapp;
  if (!whatsapp || typeof whatsapp !== "object") return null;
  const candidate = (whatsapp as Record<string, unknown>).sidecarUrl;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

/**
 * Derive the WhatsApp sidecar base URL from an agent row.
 *
 * Priority:
 *   1. channel_config.whatsapp.sidecarUrl (operator override)
 *   2. api_endpoint with the port replaced by SIDECAR_PORT (default 8643)
 *   3. null when the api_endpoint has no port to substitute
 */
export function resolveSidecarBaseUrl(
  apiEndpoint: string,
  channelConfig: Record<string, unknown> | null | undefined,
): string | null {
  const override = readSidecarOverride(channelConfig);
  if (override) {
    return override.replace(/\/$/, "");
  }
  const endpoint = apiEndpoint.trim();
  if (!endpoint) return null;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return null;
  }
  const sidecarPort = process.env.HERMES_WHATSAPP_SIDECAR_PORT?.trim() || WHATSAPP_SIDECAR_DEFAULT_PORT;
  parsed.port = sidecarPort;
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function parseStatusPayload(payload: Record<string, unknown>): ChannelStatusSnapshot {
  const status =
    typeof payload.status === "string"
      ? payload.status
      : typeof payload.state === "string"
        ? payload.state
        : "unknown";
  const paired =
    payload.paired === true || payload.connected === true || payload.ready === true;
  const qr =
    typeof payload.qr === "string"
      ? payload.qr
      : typeof payload.qr_code === "string"
        ? payload.qr_code
        : null;
  const lastSeen =
    typeof payload.last_seen === "string"
      ? payload.last_seen
      : typeof payload.lastSeen === "string"
        ? payload.lastSeen
        : null;
  const lastError =
    typeof payload.last_error === "string"
      ? payload.last_error
      : typeof payload.lastError === "string"
        ? payload.lastError
        : null;
  return { status, paired, qr, lastSeen, lastError };
}

const PROBE_TIMEOUT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 10_000;

async function probeUrl(url: string, apiKey: string): Promise<ChannelStatusSnapshot | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return null;
    return parseStatusPayload(payload);
  } catch {
    return null;
  }
}

/**
 * Probe both the sidecar (preferred) and the Hermes API server for a WhatsApp
 * status response. Returns the first successful payload.
 */
export async function fetchWhatsappChannelStatus(
  apiEndpoint: string,
  apiKey: string,
  channelConfig: Record<string, unknown> | null | undefined,
): Promise<ChannelStatusSnapshot | null> {
  const normalizedEndpoint = apiEndpoint.trim().replace(/\/$/, "");
  if (!normalizedEndpoint || !apiKey) {
    return null;
  }
  const sidecarBase = resolveSidecarBaseUrl(normalizedEndpoint, channelConfig);
  const candidates: string[] = [];
  if (sidecarBase) {
    candidates.push(`${sidecarBase}/v1/channels/whatsapp/status`);
  }
  candidates.push(
    `${normalizedEndpoint}/v1/channels/whatsapp/status`,
    `${normalizedEndpoint}/channels/whatsapp/status`,
    `${normalizedEndpoint}/whatsapp/status`,
  );
  // Probe all candidates in parallel and return the first snapshot that
  // succeeds. Each probe is bounded by PROBE_TIMEOUT_MS so total wall time is
  // bounded as well, vs. the old sequential fallback that summed timeouts.
  try {
    const winner = await Promise.any(
      candidates.map(async (url) => {
        const snapshot = await probeUrl(url, apiKey);
        if (!snapshot) throw new Error("no snapshot");
        return snapshot;
      }),
    );
    return winner;
  } catch {
    return null;
  }
}

/**
 * Forward a command (pair / logout) to the sidecar. Returns the upstream
 * response so callers can surface errors verbatim to the dashboard.
 */
export async function forwardSidecarCommand(
  baseUrl: string,
  apiKey: string,
  pathSegment: "pair" | "logout",
  init: { force?: boolean } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/v1/channels/whatsapp/${pathSegment}`);
  if (pathSegment === "pair" && init.force) {
    url.searchParams.set("force", "true");
  }
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ force: init.force === true }),
    signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}
