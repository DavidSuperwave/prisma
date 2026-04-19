import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";

import type { SidecarConfig } from "./config";
import { getLogger } from "./logger";
import { startGateway, stopGateway } from "./hermesControl";

export type BridgeStatus =
  | {
      state: "idle";
      paired: false;
      qr: null;
      lastSeen: string | null;
      lastError: string | null;
    }
  | {
      state: "pairing";
      paired: false;
      qr: string;
      lastSeen: string | null;
      lastError: null;
    }
  | {
      state: "paired";
      paired: true;
      qr: null;
      lastSeen: string | null;
      lastError: null;
      phoneId: string | null;
    }
  | {
      state: "error";
      paired: false;
      qr: null;
      lastSeen: string | null;
      lastError: string;
    };

async function ensureSessionDirectory(sessionPath: string): Promise<void> {
  await fs.mkdir(sessionPath, { recursive: true, mode: 0o700 });
  try {
    await fs.chmod(sessionPath, 0o700);
  } catch {
    // non-fatal on filesystems that don't support chmod
  }
}

async function listSessionFiles(sessionPath: string): Promise<string[]> {
  try {
    return await fs.readdir(sessionPath);
  } catch {
    return [];
  }
}

function fingerprintSession(files: string[]): string | null {
  if (files.length === 0) return null;
  const sorted = [...files].sort();
  return createHash("sha256").update(sorted.join("|")).digest("hex").slice(0, 12);
}

export class BaileysBridge {
  private readonly config: SidecarConfig;
  private status: BridgeStatus;
  private socket: WASocket | null = null;
  private pairingTimeout: NodeJS.Timeout | null = null;
  private starting = false;

  constructor(config: SidecarConfig) {
    this.config = config;
    this.status = {
      state: "idle",
      paired: false,
      qr: null,
      lastSeen: null,
      lastError: null,
    };
  }

  async initialize(): Promise<void> {
    await ensureSessionDirectory(this.config.sessionPath);
    const files = await listSessionFiles(this.config.sessionPath);
    if (files.some((name) => name.startsWith("creds"))) {
      this.status = {
        state: "paired",
        paired: true,
        qr: null,
        lastSeen: null,
        lastError: null,
        phoneId: null,
      };
    }
  }

  getStatus(): BridgeStatus {
    return this.status;
  }

  async startPairing(options: { force?: boolean } = {}): Promise<void> {
    const logger = getLogger();
    if (this.starting) {
      throw new Error("Pairing already starting");
    }
    if (this.status.state === "pairing") {
      return;
    }
    if (this.status.state === "paired" && !options.force) {
      throw new Error("Session already paired. Re-pair with force=true or call /logout first.");
    }
    this.starting = true;
    try {
      await stopGateway(this.config);
      if (options.force) {
        await this.wipeSessionFiles();
      }
      await ensureSessionDirectory(this.config.sessionPath);
      await this.openSocket();
      this.armTimeout();
      logger.info(
        {
          sessionFingerprint: fingerprintSession(await listSessionFiles(this.config.sessionPath)),
        },
        "pairing started",
      );
    } finally {
      this.starting = false;
    }
  }

  async logout(): Promise<void> {
    const logger = getLogger();
    await this.closeSocket("logout requested");
    await this.wipeSessionFiles();
    await stopGateway(this.config);
    this.status = {
      state: "idle",
      paired: false,
      qr: null,
      lastSeen: null,
      lastError: null,
    };
    logger.info("session wiped, sidecar back to idle");
  }

  private async wipeSessionFiles(): Promise<void> {
    try {
      await fs.rm(this.config.sessionPath, { recursive: true, force: true });
      await ensureSessionDirectory(this.config.sessionPath);
    } catch (error) {
      getLogger().warn(
        { err: error instanceof Error ? error.message : String(error) },
        "failed to wipe session files",
      );
    }
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.pairingTimeout = setTimeout(() => {
      const logger = getLogger();
      logger.warn({ timeoutMs: this.config.pairingTimeoutMs }, "pairing timed out");
      void this.closeSocket("pairing timeout").catch(() => {});
      this.status = {
        state: "error",
        paired: false,
        qr: null,
        lastSeen: this.status.lastSeen,
        lastError: `Pairing timed out after ${this.config.pairingTimeoutMs}ms`,
      };
    }, this.config.pairingTimeoutMs);
  }

  private clearTimeout(): void {
    if (this.pairingTimeout) {
      clearTimeout(this.pairingTimeout);
      this.pairingTimeout = null;
    }
  }

  private async closeSocket(reason: string): Promise<void> {
    this.clearTimeout();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      socket.end(new Error(reason));
    } catch {
      // swallow
    }
  }

  async shutdown(reason: string): Promise<void> {
    await this.closeSocket(reason);
  }

  private async openSocket(): Promise<void> {
    const logger = getLogger();
    // Ensure any previous socket / listeners are torn down before creating a
    // new one. Without this, repeated pair attempts can orphan `ev` listeners
    // and leak the underlying websocket.
    await this.closeSocket("reopen");
    const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionPath);
    const { version } = await getCachedBaileysVersion();
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      version,
      logger: pinoChildForBaileys(),
      browser: ["Prisma", "Chrome", "0.1.0"],
      syncFullHistory: false,
    });
    this.socket = socket;

    socket.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          "saveCreds failed",
        );
      }
    });

    socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        void this.handleQr(qr).catch((error) => {
          logger.error(
            { err: error instanceof Error ? error.message : String(error) },
            "qr encoding failed",
          );
        });
      }
      if (connection === "open") {
        void this.handleOpen(socket).catch((error) => {
          logger.error(
            { err: error instanceof Error ? error.message : String(error) },
            "handleOpen failed",
          );
        });
      }
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const unauthorized = statusCode === DisconnectReason.loggedOut;
        const message = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "connection closed";
        logger.info({ statusCode, unauthorized, message }, "connection.update close");
        if (unauthorized) {
          void this.logout().catch(() => {});
          return;
        }
        if (this.status.state === "pairing") {
          this.status = {
            state: "error",
            paired: false,
            qr: null,
            lastSeen: this.status.lastSeen,
            lastError: message,
          };
        }
        // Drop reference so the next pair attempt starts clean.
        void this.closeSocket("connection closed").catch(() => {});
      }
    });
  }

  private async handleQr(qr: string): Promise<void> {
    const dataUrl = await QRCode.toDataURL(qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    });
    this.status = {
      state: "pairing",
      paired: false,
      qr: dataUrl,
      lastSeen: this.status.lastSeen,
      lastError: null,
    };
    getLogger().info(
      { fingerprint: createHash("sha256").update(qr).digest("hex").slice(0, 12) },
      "QR emitted",
    );
  }

  private async handleOpen(socket: WASocket): Promise<void> {
    const logger = getLogger();
    this.clearTimeout();
    const phoneId = socket.user?.id ?? null;
    this.status = {
      state: "paired",
      paired: true,
      qr: null,
      lastSeen: new Date().toISOString(),
      lastError: null,
      phoneId,
    };
    logger.info({ phoneId }, "pairing succeeded");
    try {
      socket.end(undefined);
    } catch {
      // swallow
    }
    this.socket = null;
    await startGateway(this.config);
  }
}

function pinoChildForBaileys() {
  const logger = getLogger().child({ component: "baileys" });
  logger.level = "warn";
  return logger;
}

// Cache the Baileys version check for an hour to avoid paying an outbound
// request + parsing cost on every pair attempt.
type BaileysVersion = { version: [number, number, number] };
const BAILEYS_VERSION_TTL_MS = 60 * 60 * 1000;
let cachedBaileysVersion: { value: BaileysVersion; expiresAt: number } | null = null;

async function getCachedBaileysVersion(): Promise<BaileysVersion> {
  const now = Date.now();
  if (cachedBaileysVersion && cachedBaileysVersion.expiresAt > now) {
    return cachedBaileysVersion.value;
  }
  const fallback: BaileysVersion = { version: [2, 3000, 0] };
  try {
    const { version } = await fetchLatestBaileysVersion();
    const value: BaileysVersion = { version: version as [number, number, number] };
    cachedBaileysVersion = { value, expiresAt: now + BAILEYS_VERSION_TTL_MS };
    return value;
  } catch {
    // Keep the last known good value if possible; otherwise use the fallback
    // but only briefly so we re-attempt soon.
    if (cachedBaileysVersion) return cachedBaileysVersion.value;
    cachedBaileysVersion = { value: fallback, expiresAt: now + 60_000 };
    return fallback;
  }
}
