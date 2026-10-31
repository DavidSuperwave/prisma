import { fetchInternalJson } from "@/lib/agentTools/executor";
import {
  validateArgs,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "@/lib/agentTools/registry";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAllowedInternalRoute } from "./routeCatalog";
import {
  countDynamicToolRunsSince,
  getDynamicTool,
  logDynamicToolRun,
} from "./store";
import type { ApiComposeStep, DynamicToolImplementation } from "./types";
import { isDynamicToolName } from "./types";

async function resolveWorkspaceId(slug: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("workspaces").select("id").eq("subdomain", slug).maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

function interpolateValue(tpl: unknown, args: Record<string, unknown>): unknown {
  if (typeof tpl === "string") {
    return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
      const v = args[key as string];
      if (v === undefined || v === null) return "";
      return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
    });
  }
  if (Array.isArray(tpl)) {
    return tpl.map((x) => interpolateValue(x, args));
  }
  if (tpl && typeof tpl === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tpl as Record<string, unknown>)) {
      o[k] = interpolateValue(v, args);
    }
    return o;
  }
  return tpl;
}

function asRows(value: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    return value.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Array<
      Record<string, unknown>
    >;
  }
  if (value && typeof value === "object" && "records" in (value as object)) {
    const rec = (value as { records?: unknown }).records;
    if (Array.isArray(rec)) {
      return rec.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Array<
        Record<string, unknown>
      >;
    }
  }
  return null;
}

function wrapRows(rows: Array<Record<string, unknown>>): unknown {
  return { records: rows };
}

function applyFilterStep(
  pipeline: unknown,
  field: string | undefined,
  op: string | undefined,
  value: unknown,
): unknown {
  const rows = asRows(pipeline);
  if (!rows || !field) return pipeline;
  const cop = op ?? "eq";
  const filtered = rows.filter((row) => {
    const a = row[field];
    const s = (x: unknown) => String(x ?? "");
    const n = (x: unknown) => (typeof x === "number" ? x : Number(x));
    switch (cop) {
      case "eq":
        return s(a) === s(value);
      case "ne":
        return s(a) !== s(value);
      case "contains":
        return s(a).toLowerCase().includes(s(value).toLowerCase());
      case "gt":
        return n(a) > n(value);
      case "gte":
        return n(a) >= n(value);
      case "lt":
        return n(a) < n(value);
      case "lte":
        return n(a) <= n(value);
      default:
        return s(a) === s(value);
    }
  });
  if (Array.isArray(pipeline)) return filtered;
  if (pipeline && typeof pipeline === "object" && "records" in (pipeline as object)) {
    return { ...(pipeline as object), records: filtered };
  }
  return wrapRows(filtered);
}

async function runApiCompose(
  steps: ApiComposeStep[],
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  let pipeline: unknown = null;
  for (const step of steps) {
    if (step.action === "fetch_internal") {
      const route = String(step.route ?? "").trim();
      if (!isAllowedInternalRoute(route, ctx.workspaceSlug)) {
        return {
          ok: false,
          error: `Disallowed route for dynamic tool: ${route}`,
          status: 400,
        };
      }
      const method = String(step.method ?? "GET").toUpperCase();
      const init: RequestInit = { method };
      if (method !== "GET" && method !== "HEAD") {
        const bodyObj = step.bodyTemplate
          ? (interpolateValue(step.bodyTemplate, args) as Record<string, unknown>)
          : {};
        init.body = JSON.stringify(bodyObj);
      }
      const res = await fetchInternalJson<unknown>(ctx, route, init);
      if (!res.ok) {
        return {
          ok: false,
          error: res.error ?? `HTTP ${res.status}`,
          status: res.status || 400,
          details: res.data,
        };
      }
      pipeline = res.data;
    } else if (step.action === "filter") {
      pipeline = applyFilterStep(pipeline, step.field, step.op, step.value);
    } else if (step.action === "map" || step.action === "aggregate") {
      return {
        ok: false,
        error: `Step action "${step.action}" is not implemented in the dynamic executor yet.`,
        status: 501,
      };
    }
  }
  return { ok: true, data: pipeline };
}

/**
 * Execute a persisted dynamic tool by name (`dyn.*`).
 */
export async function executeDynamicTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!isDynamicToolName(name)) {
    return { ok: false, error: "Not a dynamic tool name.", status: 400 };
  }
  const workspaceId = await resolveWorkspaceId(ctx.workspaceSlug);
  if (!workspaceId) {
    return { ok: false, error: "Workspace not found.", status: 404 };
  }
  const spec = await getDynamicTool(workspaceId, name);
  if (!spec) {
    return { ok: false, error: `Unknown dynamic tool: ${name}`, status: 404 };
  }
  if (spec.status !== "active") {
    return { ok: false, error: `Dynamic tool "${name}" is not active.`, status: 409 };
  }
  if (spec.agent_id && ctx.agentId && spec.agent_id !== ctx.agentId) {
    return { ok: false, error: "This tool is not bound to the current agent.", status: 403 };
  }

  const def: ToolDefinition = {
    name: spec.name,
    description: spec.description,
    args: spec.args_schema as ToolDefinition["args"],
    handler: async () => ({ ok: true, data: null }),
  };
  try {
    validateArgs(def, args);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid args.";
    return { ok: false, error: message, status: 400 };
  }

  const maxPerMin = Math.max(
    10,
    Number(process.env.PRISMA_DYNAMIC_TOOL_MAX_PER_MIN ?? 120),
  );
  const since = new Date(Date.now() - 60_000);
  const recent = await countDynamicToolRunsSince(workspaceId, since);
  if (recent >= maxPerMin) {
    return {
      ok: false,
      error: "Dynamic tool rate limit exceeded for this workspace. Try again shortly.",
      status: 429,
    };
  }

  const started = Date.now();
  const impl = spec.implementation as DynamicToolImplementation;
  let result: ToolResult;

  if (impl.kind === "spreadsheet_transform") {
    const mod = await import("@/lib/agentTools/executor");
    const recordId =
      typeof args[impl.recordIdParam] === "string"
        ? String(args[impl.recordIdParam])
        : String(args.recordId ?? "");
    result = await mod.runTool({
      name: "spreadsheet.transform",
      args: {
        recordId,
        operations: impl.operations,
        outputFormat: impl.outputFormat ?? "json",
      },
      ctx,
    });
  } else if (impl.kind === "api_compose") {
    result = await runApiCompose(impl.steps, args, ctx);
  } else {
    result = { ok: false, error: "Unsupported implementation kind.", status: 400 };
  }

  const durationMs = Date.now() - started;
  await logDynamicToolRun(workspaceId, {
    toolId: spec.id,
    agentId: ctx.agentId ?? null,
    args,
    result: result as unknown as Record<string, unknown>,
    ok: Boolean(result.ok),
    durationMs,
  });

  return result;
}
