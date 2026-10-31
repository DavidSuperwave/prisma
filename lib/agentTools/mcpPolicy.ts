import type { PrismaMcpRolePreset } from "@/lib/agentMcpSession";
import { listTools } from "@/lib/agentTools/registry";
import "@/lib/agentTools/executor";

type ResolvePresetInput = {
  agentType: "copilot" | "channel" | "worker";
  legacyRole?: string | null;
  explicitPreset?: string | null;
};

type ResolveToolPolicyInput = ResolvePresetInput & {
  knowledgeScope?: Record<string, unknown> | null;
};

export const DEFAULT_OPERATOR_TOOLSET_NAMESPACES = [
  "general",
  "objects",
  "schema",
  "records",
  "crm",
  "documents",
  "spreadsheet",
  "images",
  "integrations",
  "connections",
  "recipes",
  "automations",
  "bindings",
  "cms",
  "peer",
  "skills",
] as const;

const PRESET_NAMESPACES: Record<Exclude<PrismaMcpRolePreset, "custom">, string[]> = {
  intake: ["general", "objects", "schema", "records", "crm", "documents", "spreadsheet", "images", "integrations"],
  ops: [
    "general",
    "objects",
    "schema",
    "records",
    "crm",
    "documents",
    "spreadsheet",
    "images",
    "integrations",
    "connections",
    "recipes",
    "automations",
    "bindings",
    "cms",
    "peer",
    "skills",
  ],
  sales: [
    "general",
    "objects",
    "schema",
    "records",
    "crm",
    "documents",
    "spreadsheet",
    "images",
    "integrations",
    "connections",
    "recipes",
    "automations",
    "cms",
    "peer",
    "skills",
  ],
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function normalizePreset(value: string | null | undefined): PrismaMcpRolePreset | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "intake" || normalized === "ops" || normalized === "sales" || normalized === "custom") {
    return normalized;
  }
  return null;
}

function namespaceOf(toolName: string): string {
  return toolName.includes(".") ? toolName.split(".")[0] : "general";
}

export function listRegisteredToolNames(): string[] {
  return listTools()
    .map((tool) => tool.name)
    .sort((a, b) => a.localeCompare(b));
}

export function listDefaultOperatorToolNames(): string[] {
  const namespaces = new Set<string>(DEFAULT_OPERATOR_TOOLSET_NAMESPACES);
  return listRegisteredToolNames().filter((toolName) => namespaces.has(namespaceOf(toolName)));
}

export function isDefaultOperatorToolName(toolName: string): boolean {
  return new Set<string>(DEFAULT_OPERATOR_TOOLSET_NAMESPACES).has(namespaceOf(toolName));
}

export function applyToolPolicyToNames(
  toolNames: string[],
  policy: { include: string[]; exclude: string[] },
): string[] {
  const includeSet = new Set(policy.include);
  const excludeSet = new Set(policy.exclude);
  return toolNames.filter((toolName) => {
    if (includeSet.size > 0 && !includeSet.has(toolName)) {
      return false;
    }
    return !excludeSet.has(toolName);
  });
}

export function resolveAgentRolePreset(input: ResolvePresetInput): PrismaMcpRolePreset {
  const explicit = normalizePreset(input.explicitPreset);
  if (explicit) return explicit;

  const legacy = String(input.legacyRole ?? "").trim().toLowerCase();
  if (legacy === "intake_assistant") return "intake";
  if (legacy === "ops_assistant") return "ops";
  if (legacy === "lead_qualifier" || legacy === "follow_up" || legacy === "crm_updater") return "sales";

  if (input.agentType === "channel") return "sales";
  if (input.agentType === "worker") return "ops";
  return "intake";
}

export function resolveMcpToolPolicy(input: ResolveToolPolicyInput): {
  rolePreset: PrismaMcpRolePreset;
  include: string[];
  exclude: string[];
} {
  const allTools = listRegisteredToolNames();
  const scope = (input.knowledgeScope ?? {}) as Record<string, unknown>;
  const explicitPreset =
    (typeof scope.mcp_role_preset === "string" ? scope.mcp_role_preset : null) ??
    (typeof scope.mcpRolePreset === "string" ? scope.mcpRolePreset : null);
  const rolePreset = resolveAgentRolePreset({
    agentType: input.agentType,
    legacyRole: input.legacyRole,
    explicitPreset,
  });

  const explicitInclude = normalizeStringArray(scope.mcp_tools_include ?? scope.mcpToolsInclude);
  const explicitExclude = normalizeStringArray(scope.mcp_tools_exclude ?? scope.mcpToolsExclude);

  let include = explicitInclude;
  if (include.length === 0 && rolePreset !== "custom") {
    const allowedNamespaces = new Set(PRESET_NAMESPACES[rolePreset]);
    include = allTools.filter((tool) => allowedNamespaces.has(namespaceOf(tool)));
  }

  const includeSet = new Set(include);
  const exclude = explicitExclude.filter((tool) => includeSet.size === 0 || includeSet.has(tool));

  return {
    rolePreset,
    include,
    exclude,
  };
}
