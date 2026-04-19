import { getTool, validateArgs, type ToolContext, type ToolResult } from "./registry";
import "./tools/crm";
import "./tools/records";
import "./tools/schema";
import "./tools/integrations";
import "./tools/images";
import "./tools/cms";
import "./tools/recipes";
import "./tools/automations";
import "./tools/documents";
import "./tools/bindings";

export type RunToolParams = {
  name: string;
  args: unknown;
  ctx: ToolContext;
};

/**
 * Runs a tool by name with the provided args. Returns a `ToolResult`.
 * Never throws — errors are surfaced as `{ ok: false, error }`.
 */
export async function runTool({ name, args, ctx }: RunToolParams): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}`, status: 404 };
  }
  try {
    const validated = validateArgs(tool, args);
    return await tool.handler(validated, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed.";
    return { ok: false, error: message, status: 400 };
  }
}

/**
 * Helper for tool handlers that call internal REST routes.
 * Forwards the original session cookie so the route's auth checks pass.
 */
export async function fetchInternal(
  ctx: ToolContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = ctx.origin.replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  if (ctx.cookieHeader && !headers.has("cookie")) {
    headers.set("cookie", ctx.cookieHeader);
  }
  if (ctx.internalToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${ctx.internalToken}`);
  }
  return fetch(url, { ...init, headers });
}

export async function fetchInternalJson<T = unknown>(
  ctx: ToolContext,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const response = await fetchInternal(ctx, path, init);
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error =
      (data && typeof data === "object" && "error" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).error)
        : null) ?? response.statusText;
    return { ok: false, status: response.status, data: data as T | null, error };
  }
  return { ok: true, status: response.status, data: data as T };
}
