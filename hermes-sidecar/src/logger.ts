import pino from "pino";

import { loadConfig } from "./config";

let cached: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (cached) return cached;
  const config = loadConfig();
  cached = pino({
    level: config.logLevel,
    base: { service: "hermes-whatsapp-sidecar" },
    redact: {
      paths: ["req.headers.authorization", "req.headers['x-api-key']"],
      censor: "[redacted]",
    },
  });
  return cached;
}
