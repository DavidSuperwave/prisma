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

const PRESET_NAMESPACES: Record<Exclude<PrismaMcpRolePreset, "custom">, string[]> = {
  intake: ["objects", "schema", "records", "crm", "documents", "images", "integrations"],
  ops: ["objects", "schema", "records", "crm", "documents", "images", "integrations", "recipes", "automations", "bindings", "cms", "skills"],
  sales: ["objects", "schema", "records", "crm", "documents", "images", "integrations", "recipes", "automations"],
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
