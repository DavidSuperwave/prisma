import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getIntegrationSecrets, listIntegrations } from "@/lib/integrations/store";

type EnsureHermesHomeInput = {
  workspaceId: string;
  workspaceSlug?: string;
  modelOverride?: string | null;
  agentId?: string | null;
};

export type WorkspaceSkillsState = {
  disabledBuiltIn: string[];
  promotedLocal: string[];
};

function resolveHomesRoot() {
  const configured = process.env.PRISMA_HERMES_HOME_ROOT?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), ".data", "hermes-homes");
}

function resolveRepoSkillsRoot() {
  return path.join(process.cwd(), "skills");
}

export function resolveWorkspaceHermesHome(workspaceId: string) {
  return path.join(resolveHomesRoot(), workspaceId);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultWorkspaceSkillsState(): WorkspaceSkillsState {
  return {
    disabledBuiltIn: [],
    promotedLocal: [],
  };
}

function normalizeSkillSlug(raw: string): string {
  const parts = raw
    .split("/")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter((part) => part.length > 0);
  return parts.join("/");
}

function resolveSkillsStatePath(workspaceId: string) {
  return path.join(resolveWorkspaceHermesHome(workspaceId), "skills", ".prisma-state.json");
}

function resolveLocalSkillMarkdownPath(workspaceId: string, skillSlug: string) {
  const normalized = normalizeSkillSlug(skillSlug);
  return path.join(resolveWorkspaceHermesHome(workspaceId), "skills", ...normalized.split("/"), "SKILL.md");
}

async function listBuiltInSkillSlugs(): Promise<string[]> {
  const root = resolveRepoSkillsRoot();
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const slugs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = normalizeSkillSlug(entry.name);
      if (!slug) continue;
      const markdownPath = path.join(root, slug, "SKILL.md");
      if (await fileExists(markdownPath)) slugs.push(slug);
    }
    return slugs.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function loadWorkspaceSkillsState(workspaceId: string): Promise<WorkspaceSkillsState> {
  const statePath = resolveSkillsStatePath(workspaceId);
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as {
      disabledBuiltIn?: unknown;
      promotedLocal?: unknown;
    };
    const disabledBuiltIn = Array.isArray(parsed.disabledBuiltIn)
      ? parsed.disabledBuiltIn.map((entry) => normalizeSkillSlug(String(entry ?? ""))).filter((entry) => entry.length > 0)
      : [];
    const promotedLocal = Array.isArray(parsed.promotedLocal)
      ? parsed.promotedLocal.map((entry) => normalizeSkillSlug(String(entry ?? ""))).filter((entry) => entry.length > 0)
      : [];
    return {
      disabledBuiltIn: Array.from(new Set(disabledBuiltIn)).sort((a, b) => a.localeCompare(b)),
      promotedLocal: Array.from(new Set(promotedLocal)).sort((a, b) => a.localeCompare(b)),
    };
  } catch {
    return defaultWorkspaceSkillsState();
  }
}

export async function saveWorkspaceSkillsState(workspaceId: string, state: WorkspaceSkillsState) {
  const home = resolveWorkspaceHermesHome(workspaceId);
  const skillsDir = path.join(home, "skills");
  await mkdir(skillsDir, { recursive: true });
  const normalized: WorkspaceSkillsState = {
    disabledBuiltIn: Array.from(
      new Set((state.disabledBuiltIn ?? []).map((entry) => normalizeSkillSlug(entry)).filter((entry) => entry.length > 0)),
    ).sort((a, b) => a.localeCompare(b)),
    promotedLocal: Array.from(
      new Set((state.promotedLocal ?? []).map((entry) => normalizeSkillSlug(entry)).filter((entry) => entry.length > 0)),
    ).sort((a, b) => a.localeCompare(b)),
  };
  await writeFile(resolveSkillsStatePath(workspaceId), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

async function ensureConfigYamlHasSkillsDirs(configPath: string, input: EnsureHermesHomeInput) {
  const desiredBlock = [
    "skills:",
    "  external_dirs:",
    "    - ./skills",
    "    - ./skills/external/prisma",
    "    - ./skills/external/prisma-promoted",
    "",
  ].join("\n");

  if (!(await fileExists(configPath))) {
    await writeFile(configPath, defaultConfigYaml(input), "utf8");
    return;
  }

  const current = await readFile(configPath, "utf8");
  if (
    current.includes("./skills") &&
    current.includes("./skills/external/prisma") &&
    current.includes("./skills/external/prisma-promoted")
  ) {
    return;
  }

  const legacyBlock = ["skills:", "  external_dirs:", "    - ./skills", "    - ./skills/external", ""].join("\n");
  if (current.includes(legacyBlock)) {
    const updated = current.replace(legacyBlock, desiredBlock);
    await writeFile(configPath, updated, "utf8");
    return;
  }

  const updated = `${current.replace(/\s*$/, "\n")}\n${desiredBlock}`;
  await writeFile(configPath, updated, "utf8");
}

export async function syncWorkspaceExternalSkills(workspaceId: string, stateOverride?: WorkspaceSkillsState) {
  const home = resolveWorkspaceHermesHome(workspaceId);
  const externalRoot = path.join(home, "skills", "external");
  const builtInDestRoot = path.join(externalRoot, "prisma");
  const promotedDestRoot = path.join(externalRoot, "prisma-promoted");
  await mkdir(externalRoot, { recursive: true });
  await rm(builtInDestRoot, { recursive: true, force: true });
  await rm(promotedDestRoot, { recursive: true, force: true });
  await mkdir(builtInDestRoot, { recursive: true });
  await mkdir(promotedDestRoot, { recursive: true });

  const state = stateOverride ?? (await loadWorkspaceSkillsState(workspaceId));
  const disabled = new Set(state.disabledBuiltIn.map((entry) => normalizeSkillSlug(entry)));
  const builtInSlugs = await listBuiltInSkillSlugs();

  let builtInSynced = 0;
  for (const slug of builtInSlugs) {
    if (disabled.has(slug)) continue;
    const sourceMarkdownPath = path.join(resolveRepoSkillsRoot(), slug, "SKILL.md");
    if (!(await fileExists(sourceMarkdownPath))) continue;
    const markdown = await readFile(sourceMarkdownPath, "utf8");
    const destDir = path.join(builtInDestRoot, slug);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, "SKILL.md"), markdown, "utf8");
    builtInSynced += 1;
  }

  let promotedSynced = 0;
  for (const promotedSlug of state.promotedLocal) {
    const normalized = normalizeSkillSlug(promotedSlug);
    if (!normalized) continue;
    const sourceMarkdownPath = resolveLocalSkillMarkdownPath(workspaceId, normalized);
    if (!(await fileExists(sourceMarkdownPath))) continue;
    const markdown = await readFile(sourceMarkdownPath, "utf8");
    const destDir = path.join(promotedDestRoot, ...normalized.split("/"));
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, "SKILL.md"), markdown, "utf8");
    promotedSynced += 1;
  }

  const tapMetaPath = path.join(externalRoot, ".tap.json");
  const tapMeta = {
    generatedAt: new Date().toISOString(),
    source: "prisma-skills-tap",
    builtInSynced,
    promotedSynced,
  };
  await writeFile(tapMetaPath, `${JSON.stringify(tapMeta, null, 2)}\n`, "utf8");

  return {
    builtInSynced,
    promotedSynced,
  };
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildMcpServersYamlSection(servers: Array<{
  slug: string;
  url: string;
  headers?: Record<string, string>;
  includeTools?: string[];
  excludeTools?: string[];
}>): string {
  if (servers.length === 0) {
    return "mcp_servers: {}\n";
  }
  const lines: string[] = ["mcp_servers:"];
  for (const server of servers) {
    lines.push(`  ${server.slug}:`);
    lines.push(`    url: ${yamlQuote(server.url)}`);
    if (server.headers && Object.keys(server.headers).length > 0) {
      lines.push("    headers:");
      for (const [key, value] of Object.entries(server.headers)) {
        lines.push(`      ${key}: ${yamlQuote(value)}`);
      }
    }
    if (
      (server.includeTools && server.includeTools.length > 0) ||
      (server.excludeTools && server.excludeTools.length > 0)
    ) {
      lines.push("    tools:");
      if (server.includeTools && server.includeTools.length > 0) {
        lines.push("      include:");
        for (const tool of server.includeTools) lines.push(`        - ${yamlQuote(tool)}`);
      }
      if (server.excludeTools && server.excludeTools.length > 0) {
        lines.push("      exclude:");
        for (const tool of server.excludeTools) lines.push(`        - ${yamlQuote(tool)}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

function replaceTopLevelYamlSection(content: string, sectionKey: string, replacementBlock: string): string {
  const lines = content.split(/\r?\n/);
  const keyPattern = new RegExp(`^${sectionKey}:\\b`);
  const topLevelPattern = /^[A-Za-z0-9_]+:\b/;
  const startIndex = lines.findIndex((line) => keyPattern.test(line));
  const replacementLines = replacementBlock.replace(/\r/g, "").replace(/\n$/, "").split("\n");

  if (startIndex < 0) {
    const withTrailingNewline = content.replace(/\s*$/, "\n");
    return `${withTrailingNewline}${replacementBlock}`;
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (topLevelPattern.test(line)) {
      endIndex = i;
      break;
    }
  }

  const next = [...lines.slice(0, startIndex), ...replacementLines, ...lines.slice(endIndex)];
  return `${next.join("\n").replace(/\s*$/, "")}\n`;
}

export async function syncWorkspaceSoulMd(workspaceId: string, preferredAgentId?: string | null) {
  const home = resolveWorkspaceHermesHome(workspaceId);
  await mkdir(home, { recursive: true });
  const soulPath = path.join(home, "SOUL.md");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const fallback = [
      "# SOUL.md",
      "",
      "Eres un agente de Prisma para este workspace.",
      "Usa herramientas y datos solo de este tenant.",
    ].join("\n");
    await writeFile(soulPath, `${fallback}\n`, "utf8");
    return { source: "fallback", agentId: null as string | null, soulPath };
  }

  const { data, error } = await supabase
    .from("workspace_agents")
    .select("id, name, type, status, soul_md, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    type: "copilot" | "channel" | "worker";
    status: "active" | "paused" | "deploying" | "error";
    soul_md: string | null;
  }>;
  const selected =
    (preferredAgentId ? rows.find((row) => row.id === preferredAgentId) : null) ??
    rows.find((row) => row.status === "active" && row.type === "copilot") ??
    rows.find((row) => row.status === "active") ??
    rows[0] ??
    null;

  const selectedSoul = selected?.soul_md?.trim() ?? "";
  const content =
    selectedSoul.length > 0
      ? [
          "# SOUL.md",
          "",
          `<!-- source_agent_id: ${selected?.id ?? "unknown"} -->`,
          `<!-- source_agent_name: ${(selected?.name ?? "workspace-agent").replace(/--/g, "—")} -->`,
          "",
          selectedSoul,
        ].join("\n")
      : [
          "# SOUL.md",
          "",
          "Eres un agente de Prisma para este workspace.",
          "Mantén respuestas claras, ejecutables y estrictamente scoped al tenant.",
        ].join("\n");

  await writeFile(soulPath, `${content}\n`, "utf8");
  return { source: selected ? "workspace_agents" : "fallback", agentId: selected?.id ?? null, soulPath };
}

export async function syncWorkspaceMcpServers(workspaceId: string) {
  const home = resolveWorkspaceHermesHome(workspaceId);
  await mkdir(home, { recursive: true });
  const configPath = path.join(home, "config.yaml");
  const current = (await fileExists(configPath)) ? await readFile(configPath, "utf8") : defaultConfigYaml({ workspaceId });

  let integrations = [] as Awaited<ReturnType<typeof listIntegrations>>;
  try {
    integrations = await listIntegrations(workspaceId);
  } catch {
    const replacement = buildMcpServersYamlSection([]);
    await writeFile(configPath, replaceTopLevelYamlSection(current, "mcp_servers", replacement), "utf8");
    return { count: 0 };
  }

  const servers: Array<{
    slug: string;
    url: string;
    headers?: Record<string, string>;
    includeTools?: string[];
    excludeTools?: string[];
  }> = [];
  for (const integration of integrations) {
    if (integration.authType !== "mcp" || integration.status !== "active") continue;
    const url = typeof integration.config.url === "string" ? integration.config.url.trim() : "";
    if (!url) continue;
    const secrets = await getIntegrationSecrets(integration.id).catch(() => ({} as Record<string, string>));
    const headers: Record<string, string> = {};
    if (secrets.bearer) headers.Authorization = `Bearer ${secrets.bearer}`;
    else if (secrets.apiKey) headers.Authorization = `Bearer ${secrets.apiKey}`;
    const extraHeaders =
      integration.config.extraHeaders &&
      typeof integration.config.extraHeaders === "object" &&
      !Array.isArray(integration.config.extraHeaders)
        ? (integration.config.extraHeaders as Record<string, unknown>)
        : {};
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (typeof value === "string" && value.trim().length > 0) headers[key] = value;
    }
    const includeTools = Array.isArray((integration.config as Record<string, unknown>).tools_include)
      ? ((integration.config as Record<string, unknown>).tools_include as unknown[])
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0)
      : [];
    const excludeTools = Array.isArray((integration.config as Record<string, unknown>).tools_exclude)
      ? ((integration.config as Record<string, unknown>).tools_exclude as unknown[])
          .map((entry) => String(entry ?? "").trim())
          .filter((entry) => entry.length > 0)
      : [];
    servers.push({
      slug: integration.slug,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(includeTools.length > 0 ? { includeTools } : {}),
      ...(excludeTools.length > 0 ? { excludeTools } : {}),
    });
  }

  const replacement = buildMcpServersYamlSection(servers);
  const nextConfig = replaceTopLevelYamlSection(current, "mcp_servers", replacement);
  await writeFile(configPath, nextConfig, "utf8");
  return { count: servers.length };
}

function defaultConfigYaml(input: EnsureHermesHomeInput) {
  const lines = [
    "display:",
    "  tool_progress: all",
    "memory:",
    "  provider: honcho",
    `  workspace: "${input.workspaceId}"`,
    '  member_peer: "user-peer"',
    '  agent_peer: "AI-peer"',
    "mcp_servers: {}",
    "skills:",
    "  external_dirs:",
    "    - ./skills",
    "    - ./skills/external/prisma",
    "    - ./skills/external/prisma-promoted",
  ];
  if (input.modelOverride && input.modelOverride.trim().length > 0) {
    lines.push("model:");
    lines.push(`  default: "${input.modelOverride.trim()}"`);
  }
  return `${lines.join("\n")}\n`;
}

export async function ensureWorkspaceHermesHome(input: EnsureHermesHomeInput) {
  const home = resolveWorkspaceHermesHome(input.workspaceId);
  await mkdir(home, { recursive: true });
  await mkdir(path.join(home, "skills"), { recursive: true });
  await mkdir(path.join(home, "skills", "external"), { recursive: true });
  await mkdir(path.join(home, "skills", "external", "prisma"), { recursive: true });
  await mkdir(path.join(home, "skills", "external", "prisma-promoted"), { recursive: true });
  await mkdir(path.join(home, "memories"), { recursive: true });
  await mkdir(path.join(home, "cron"), { recursive: true });
  await mkdir(path.join(home, "credentials"), { recursive: true });

  const configPath = path.join(home, "config.yaml");
  await ensureConfigYamlHasSkillsDirs(configPath, input);

  const envPath = path.join(home, ".env");
  if (!(await fileExists(envPath))) {
    const envLines = [
      `PRISMA_WORKSPACE_ID=${input.workspaceId}`,
      ...(input.workspaceSlug ? [`PRISMA_WORKSPACE_SLUG=${input.workspaceSlug}`] : []),
    ];
    await writeFile(envPath, `${envLines.join("\n")}\n`, "utf8");
  }

  const state = await loadWorkspaceSkillsState(input.workspaceId);
  await saveWorkspaceSkillsState(input.workspaceId, state);
  await syncWorkspaceExternalSkills(input.workspaceId, state);
  try {
    await syncWorkspaceSoulMd(input.workspaceId, input.agentId);
  } catch (error) {
    console.error("syncWorkspaceSoulMd failed", error);
  }
  try {
    await syncWorkspaceMcpServers(input.workspaceId);
  } catch (error) {
    console.error("syncWorkspaceMcpServers failed", error);
  }

  return {
    home,
    configPath,
    envPath,
  };
}
