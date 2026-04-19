/**
 * Agent Tool Registry
 *
 * Structured tool envelope for Hermes agents + HTTP callers.
 * A tool has a stable name, a JSON-schema-ish arg description, and a handler.
 * Handlers call through the workspace REST API (preserving dedupe, activity,
 * events, scoring) using the caller's session cookies.
 *
 * Envelope (SSE from Hermes):
 *   {"type":"tool_call","id":"tc_1","name":"crm.update_person","args":{...}}
 * Result (SSE back to client):
 *   {"type":"tool_result","id":"tc_1","result":{...}} or {"error":{...}}
 */

export type ToolArgShape = Record<
  string,
  {
    type: "string" | "number" | "boolean" | "object" | "array";
    required?: boolean;
    description?: string;
  }
>;

export type ToolContext = {
  workspaceSlug: string;
  origin: string;
  cookieHeader?: string;
  /** Optional bearer used for internal server-to-server calls */
  internalToken?: string;
};

export type ToolResultOk<T = unknown> = {
  ok: true;
  data: T;
};

export type ToolResultError = {
  ok: false;
  error: string;
  status?: number;
  details?: unknown;
};

export type ToolResult<T = unknown> = ToolResultOk<T> | ToolResultError;

export type ToolDefinition<TArgs = Record<string, unknown>, TData = unknown> = {
  name: string;
  description: string;
  args: ToolArgShape;
  handler: (args: TArgs, ctx: ToolContext) => Promise<ToolResult<TData>>;
};

const registry = new Map<string, ToolDefinition>();

export function registerTool<TArgs = Record<string, unknown>, TData = unknown>(
  definition: ToolDefinition<TArgs, TData>,
): void {
  registry.set(definition.name, definition as unknown as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

/** Shape returned from `listToolsForPrompt` to embed in agent system prompt */
export function describeToolsForPrompt(): Array<{
  name: string;
  description: string;
  args: ToolArgShape;
}> {
  return listTools().map((t) => ({
    name: t.name,
    description: t.description,
    args: t.args,
  }));
}

/**
 * Basic runtime validation. Throws a human-friendly error if args are malformed.
 */
export function validateArgs(definition: ToolDefinition, args: unknown): Record<string, unknown> {
  if (args === null || args === undefined) {
    args = {};
  }
  if (typeof args !== "object" || Array.isArray(args)) {
    throw new Error(`Tool ${definition.name} expects an args object.`);
  }
  const asRec = args as Record<string, unknown>;
  for (const [key, schema] of Object.entries(definition.args)) {
    const value = asRec[key];
    if (value === undefined || value === null) {
      if (schema.required) {
        throw new Error(`Tool ${definition.name}: missing required arg \`${key}\`.`);
      }
      continue;
    }
    if (schema.type === "string" && typeof value !== "string") {
      throw new Error(`Tool ${definition.name}: arg \`${key}\` must be a string.`);
    }
    if (schema.type === "number" && typeof value !== "number") {
      throw new Error(`Tool ${definition.name}: arg \`${key}\` must be a number.`);
    }
    if (schema.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Tool ${definition.name}: arg \`${key}\` must be a boolean.`);
    }
    if (schema.type === "array" && !Array.isArray(value)) {
      throw new Error(`Tool ${definition.name}: arg \`${key}\` must be an array.`);
    }
    if (schema.type === "object" && (typeof value !== "object" || Array.isArray(value))) {
      throw new Error(`Tool ${definition.name}: arg \`${key}\` must be an object.`);
    }
  }
  return asRec;
}
