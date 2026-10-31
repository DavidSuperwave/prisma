import type { ToolResult } from "@/lib/agentTools/registry";

export type DynamicToolStatus = "draft" | "active" | "disabled";

export type DynamicToolRow = {
  id: string;
  workspace_id: string;
  agent_id: string | null;
  name: string;
  description: string;
  args_schema: Record<string, unknown>;
  implementation: unknown;
  status: DynamicToolStatus;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Single step in an api_compose tool (planner + executor share this shape). */
export type ApiComposeStep = {
  action: "fetch_internal" | "filter" | "map" | "aggregate";
  route?: string;
  method?: string;
  bodyTemplate?: Record<string, unknown>;
  field?: string;
  op?: string;
  value?: unknown;
};

export type DynamicToolImplementation =
  | { kind: "api_compose"; steps: ApiComposeStep[] }
  | { kind: "spreadsheet_transform"; recordIdParam: string; operations: unknown[]; outputFormat?: string };

export type UpsertDynamicToolInput = {
  name: string;
  description: string;
  args_schema: Record<string, unknown>;
  implementation: DynamicToolImplementation;
  agentId?: string | null;
  status?: DynamicToolStatus;
  sourceDocumentId?: string | null;
};

export type LogDynamicToolRunInput = {
  toolId: string;
  agentId?: string | null;
  args: Record<string, unknown> | null;
  result: ToolResult | Record<string, unknown> | null;
  ok: boolean;
  durationMs: number;
};

export const DYNAMIC_TOOL_PREFIX = "dyn." as const;

export function dynamicToolNameFromSpec(name: string): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith(DYNAMIC_TOOL_PREFIX)) return trimmed;
  return `${DYNAMIC_TOOL_PREFIX}${trimmed.replace(/^\.+/, "")}`;
}

export function isDynamicToolName(name: string): boolean {
  return String(name ?? "").trim().startsWith(DYNAMIC_TOOL_PREFIX);
}
