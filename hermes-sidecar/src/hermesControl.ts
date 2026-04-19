import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SidecarConfig } from "./config";
import { getLogger } from "./logger";

const execFileAsync = promisify(execFile);

async function runHermes(config: SidecarConfig, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const env = { ...process.env };
  if (config.hermesHome) {
    env.HERMES_HOME = config.hermesHome;
  }
  try {
    const { stdout, stderr } = await execFileAsync(config.hermesBinary, args, {
      env,
      timeout: 30_000,
      maxBuffer: 1_048_576,
    });
    return { ok: true, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, stdout: "", stderr: message };
  }
}

export async function stopGateway(config: SidecarConfig): Promise<void> {
  if (!config.manageHermesGateway) return;
  const logger = getLogger();
  const result = await runHermes(config, ["gateway", "stop"]);
  if (!result.ok) {
    logger.warn(
      { err: result.stderr },
      "hermes gateway stop failed. Continuing; Baileys may still connect, but a concurrent bridge could kick the session.",
    );
    return;
  }
  logger.info("hermes gateway stopped for pairing");
}

export async function startGateway(config: SidecarConfig): Promise<void> {
  if (!config.manageHermesGateway) return;
  const logger = getLogger();
  const result = await runHermes(config, ["gateway", "start"]);
  if (!result.ok) {
    logger.warn(
      { err: result.stderr },
      "hermes gateway start failed after pairing. Session files are written; manual restart may be required.",
    );
    return;
  }
  logger.info("hermes gateway started after pairing");
}
