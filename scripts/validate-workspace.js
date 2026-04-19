#!/usr/bin/env node
/**
 * Validates the three agent workspaces under ./workspace/ against TENANT.md
 * and the openclaw.json agent list. Exits non-zero on any inconsistency so
 * it can gate server startup.
 *
 * Usage:
 *   node scripts/validate-workspace.js
 *
 * Called from `npm run validate:workspaces` and from Docker entrypoint before
 * the Next.js server accepts traffic.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const WORKSPACES_DIR = path.join(REPO_ROOT, "workspace");
const OPENCLAW_CONFIG = path.join(REPO_ROOT, "openclaw.json");
const TENANT_FILE = path.join(REPO_ROOT, "TENANT.md");

const REQUIRED_AGENTS = [
  { id: "operator", dir: "workspace-operator", memoryTag: "prismaalalegal_operator" },
  { id: "leads-inbox", dir: "workspace-leads-inbox", memoryTag: "prismaalalegal_leads" },
  { id: "qualified-leads", dir: "workspace-qualified-leads", memoryTag: "prismaalalegal_cases" },
];

const CANONICAL_TENANT = "prismaalalegal";
const FORBIDDEN_TAGS = ["client:alalegal", "client:prismaalalegal"];

/** @type {string[]} */
const errors = [];

function fileExistsSync(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function validateTenantFile() {
  if (!fileExistsSync(TENANT_FILE)) {
    errors.push(`TENANT.md is missing at ${TENANT_FILE}`);
    return;
  }
  const text = readFileOrNull(TENANT_FILE) ?? "";
  if (!text.includes(`\`${CANONICAL_TENANT}\``)) {
    errors.push(`TENANT.md does not declare canonical slug "${CANONICAL_TENANT}"`);
  }
}

function validateAgentWorkspaces() {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    errors.push(`workspace/ directory missing at ${WORKSPACES_DIR}`);
    return;
  }
  for (const agent of REQUIRED_AGENTS) {
    const dir = path.join(WORKSPACES_DIR, agent.dir);
    if (!fs.existsSync(dir)) {
      errors.push(`agent workspace missing: ${dir}`);
      continue;
    }
    for (const name of ["SOUL.md", "AGENTS.md", "USER.md"]) {
      const file = path.join(dir, name);
      if (!fileExistsSync(file)) {
        errors.push(`${agent.dir}/${name} is missing`);
        continue;
      }
      const contents = readFileOrNull(file) ?? "";

      for (const forbidden of FORBIDDEN_TAGS) {
        if (contents.includes(forbidden)) {
          errors.push(`${agent.dir}/${name} contains forbidden tag prefix "${forbidden}"`);
        }
      }

      if (name === "SOUL.md" && !contents.includes(CANONICAL_TENANT)) {
        errors.push(`${agent.dir}/SOUL.md does not declare tenant "${CANONICAL_TENANT}"`);
      }
      if (name === "AGENTS.md" && !contents.includes(agent.memoryTag)) {
        errors.push(
          `${agent.dir}/AGENTS.md does not declare agent-specific tag "${agent.memoryTag}"`,
        );
      }
    }
  }
}

function validateOpenclawConfig() {
  if (!fileExistsSync(OPENCLAW_CONFIG)) {
    // openclaw.json is optional when OpenClaw is disabled; Hermes is the
    // default runtime. Only warn, do not error, unless OPENCLAW_AGENT_URL is set.
    if (process.env.OPENCLAW_AGENT_URL) {
      errors.push(
        `openclaw.json is missing but OPENCLAW_AGENT_URL is set (${process.env.OPENCLAW_AGENT_URL})`,
      );
    }
    return;
  }
  const text = readFileOrNull(OPENCLAW_CONFIG) ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    errors.push(`openclaw.json is not valid JSON: ${e.message}`);
    return;
  }
  const list = parsed?.agents?.list;
  if (!Array.isArray(list)) {
    errors.push("openclaw.json is missing agents.list array");
    return;
  }
  const declaredIds = new Set(list.map((a) => a?.id));
  for (const agent of REQUIRED_AGENTS) {
    if (!declaredIds.has(agent.id)) {
      errors.push(`openclaw.json agents.list is missing "${agent.id}"`);
    }
  }
  for (const agent of list) {
    const declaredWorkspace = typeof agent?.workspace === "string" ? agent.workspace : "";
    const match = REQUIRED_AGENTS.find((a) => a.id === agent.id);
    if (!match) continue;
    if (!declaredWorkspace.includes(match.dir)) {
      errors.push(
        `openclaw.json agent "${agent.id}" workspace "${declaredWorkspace}" does not point to "${match.dir}"`,
      );
    }
  }
}

function main() {
  validateTenantFile();
  validateAgentWorkspaces();
  validateOpenclawConfig();

  if (errors.length > 0) {
    console.error("Workspace validation failed:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log("Workspace validation passed: 3 agents, TENANT.md, tags consistent.");
  process.exit(0);
}

main();
