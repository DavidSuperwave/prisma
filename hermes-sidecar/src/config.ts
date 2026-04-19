import * as path from "node:path";

export type SidecarConfig = {
  port: number;
  host: string;
  apiKey: string;
  sessionPath: string;
  pairingTimeoutMs: number;
  logLevel: string;
  hermesBinary: string;
  hermesHome: string | null;
  manageHermesGateway: boolean;
};

function readEnv(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    if (fallback === undefined) {
      throw new Error(`Missing required env var ${name}`);
    }
    return fallback;
  }
  return raw;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const lowered = raw.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(lowered);
}

export function loadConfig(): SidecarConfig {
  const apiKey = readEnv("API_SERVER_KEY", "");
  if (!apiKey) {
    throw new Error(
      "API_SERVER_KEY is required. The sidecar refuses to start without a bearer token.",
    );
  }
  return {
    port: Number.parseInt(readEnv("SIDECAR_PORT", "8643"), 10),
    host: readEnv("SIDECAR_HOST", "0.0.0.0"),
    apiKey,
    sessionPath: path.resolve(
      readEnv("WHATSAPP_SESSION_PATH", "/var/lib/hermes/whatsapp-session"),
    ),
    pairingTimeoutMs: Number.parseInt(readEnv("SIDECAR_PAIRING_TIMEOUT_MS", "120000"), 10),
    logLevel: readEnv("SIDECAR_LOG_LEVEL", "info"),
    hermesBinary: readEnv("HERMES_BINARY", "hermes"),
    hermesHome: process.env.HERMES_HOME ? String(process.env.HERMES_HOME) : null,
    manageHermesGateway: readBool("SIDECAR_MANAGE_GATEWAY", true),
  };
}
