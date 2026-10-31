import { describeSelectedToolsForPrompt, type ToolArgShape } from "@/lib/agentTools/registry";
import { listDynamicTools } from "./store";
import { isDynamicToolName } from "./types";

/**
 * Union of static registry tools and active workspace dynamic tool names.
 */
export async function listActiveDynamicToolNamesForChat(
  workspaceId: string,
  agentId: string | null,
): Promise<string[]> {
  const rows = await listDynamicTools(workspaceId, { status: "active", agentId });
  return rows.map((r) => r.name);
}

/**
 * Merged tool descriptions for Hermes: static tools from registry plus DB-backed `dyn.*` tools.
 */
export async function describeMergedToolsForPrompt(
  workspaceId: string,
  agentId: string | null,
  allowedNames: string[],
): Promise<
  Array<{
    name: string;
    description: string;
    args: ToolArgShape;
  }>
> {
  const staticNames = allowedNames.filter((n) => !isDynamicToolName(n));
  const base = describeSelectedToolsForPrompt(staticNames);
  const wantDyn = new Set(allowedNames.filter((n) => isDynamicToolName(n)));
  if (wantDyn.size === 0) {
    return base;
  }
  const rows = await listDynamicTools(workspaceId, { status: "active", agentId });
  const byName = new Map(rows.map((r) => [r.name, r] as const));
  const extra: Array<{ name: string; description: string; args: ToolArgShape }> = [];
  for (const n of wantDyn) {
    const row = byName.get(n);
    if (!row) continue;
    extra.push({
      name: row.name,
      description: row.description,
      args: (row.args_schema as ToolArgShape) ?? {},
    });
  }
  return [...base, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}
