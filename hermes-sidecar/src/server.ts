import * as fs from "node:fs/promises";

import express from "express";
import type { Request, Response } from "express";

import { requireBearer } from "./auth";
import { BaileysBridge } from "./baileysBridge";
import { loadConfig } from "./config";
import { getLogger } from "./logger";

async function main() {
  const config = loadConfig();
  const logger = getLogger();
  const bridge = new BaileysBridge(config);
  await bridge.initialize();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "hermes-whatsapp-sidecar" });
  });
  app.get("/v1/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "hermes-whatsapp-sidecar" });
  });

  // Readiness: distinguish liveness from "session dir writable + bridge not in error".
  async function readiness(): Promise<{ ready: boolean; reason?: string; state: string }> {
    const state = bridge.getStatus().state;
    try {
      await fs.access(config.sessionPath);
    } catch {
      return { ready: false, state, reason: "session path not accessible" };
    }
    if (state === "error") {
      return { ready: false, state, reason: "bridge in error state" };
    }
    return { ready: true, state };
  }

  app.get("/ready", async (_req: Request, res: Response) => {
    const result = await readiness();
    res.status(result.ready ? 200 : 503).json(result);
  });
  app.get("/v1/ready", async (_req: Request, res: Response) => {
    const result = await readiness();
    res.status(result.ready ? 200 : 503).json(result);
  });

  const auth = requireBearer(config);

  app.get("/v1/channels/whatsapp/status", auth, (_req: Request, res: Response) => {
    const status = bridge.getStatus();
    res.json({
      status: status.state,
      paired: status.paired,
      qr: status.state === "pairing" ? status.qr : null,
      lastSeen: status.lastSeen,
      lastError: status.state === "error" ? status.lastError : null,
    });
  });

  app.post("/v1/channels/whatsapp/pair", auth, async (req: Request, res: Response) => {
    try {
      const forceParam = String(req.query.force ?? "").toLowerCase();
      const force = forceParam === "1" || forceParam === "true" ||
        (req.body && typeof req.body === "object" && req.body.force === true);
      await bridge.startPairing({ force });
      res.status(202).json({ ok: true, status: bridge.getStatus().state });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start pairing";
      const conflict = /already paired/i.test(message);
      res.status(conflict ? 409 : 500).json({ error: message });
    }
  });

  app.post("/v1/channels/whatsapp/logout", auth, async (_req: Request, res: Response) => {
    try {
      await bridge.logout();
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to logout";
      res.status(500).json({ error: message });
    }
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      {
        host: config.host,
        port: config.port,
        sessionPath: config.sessionPath,
        manageGateway: config.manageHermesGateway,
      },
      "hermes whatsapp sidecar listening",
    );
  });

  // Tuning for long-lived clients behind proxies (values are conservative).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutdown requested");
    // Stop accepting new connections.
    server.close((err) => {
      if (err) {
        logger.warn({ err: err.message }, "server.close reported error");
      }
    });
    try {
      await bridge.shutdown("process signal");
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "bridge shutdown error",
      );
    }
    // Hard deadline so we never hang forever.
    setTimeout(() => {
      logger.warn("forcing exit after grace period");
      process.exit(0);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  const logger = getLogger();
  logger.fatal(
    { err: error instanceof Error ? error.stack ?? error.message : String(error) },
    "sidecar failed to start",
  );
  process.exit(1);
});
