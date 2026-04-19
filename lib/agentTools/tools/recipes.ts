/**
 * Agent tools for the recipes layer + skill publishing.
 *
 *   recipes.save            -> persist a known-good call as a named recipe
 *   recipes.list            -> list recipes for an integration (or workspace)
 *   recipes.call            -> execute a recipe by (integrationSlug, recipeSlug)
 *                              with {{var}} substitution; bumps success_count
 *   recipes.delete          -> remove a recipe
 *   skills.publish_recipe   -> emit a Hermes SKILL.md under skills/ so future
 *                              sessions inherit the learned API shape
 *
 * None of these tools expose secrets; renderings happen server-side against
 * the integrations vault.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { registerTool, type ToolContext } from "../registry";
import { getIntegrationBySlug } from "@/lib/integrations/store";
import {
  deleteRecipe,
  getRecipeById,
  getRecipeBySlug,
  listRecipes,
  runRecipe,
  saveRecipe,
} from "@/lib/integrations/recipes";

async function resolveWorkspaceId(ctx: ToolContext): Promise<string | null> {
  const mod = await import("@/lib/supabaseAdmin");
  const supabase = mod.getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

registerTool({
  name: "recipes.save",
  description:
    "Save a known-good API call against a configured integration as a reusable 'recipe'. Use {{var}} placeholders in pathTemplate / query / body for values the caller should supply at run time. Call this after integrations.probe succeeded and you understand the response shape.",
  args: {
    integrationSlug: { type: "string", required: true, description: "Slug of the integration (from integrations.list)" },
    name: { type: "string", required: true, description: "Human-readable name, e.g. 'List recent Close leads'" },
    slug: { type: "string", description: "Optional stable slug; auto-generated from name if omitted" },
    description: { type: "string", description: "What this recipe does and when to use it" },
    method: { type: "string", description: "GET | POST | PUT | PATCH | DELETE (default GET)" },
    pathTemplate: { type: "string", required: true, description: "Path on the vendor API, may contain {{var}}" },
    queryTemplate: { type: "object", description: "Query params (values may contain {{var}})" },
    bodyTemplate: { type: "object", description: "JSON body (keys/values may contain {{var}})" },
    headersTemplate: { type: "object", description: "Extra headers" },
    sampleResponse: { type: "object", description: "Trimmed sample of a successful response (for future prompt context)" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const integration = await getIntegrationBySlug(workspaceId, String(args.integrationSlug));
    if (!integration) return { ok: false, error: `Integration '${String(args.integrationSlug)}' not found.`, status: 404 };
    try {
      const recipe = await saveRecipe({
        workspaceId,
        integrationId: integration.id,
        name: String(args.name),
        slug: typeof args.slug === "string" ? args.slug : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        method: typeof args.method === "string" ? args.method : "GET",
        pathTemplate: String(args.pathTemplate),
        queryTemplate: (args.queryTemplate as Record<string, unknown>) ?? {},
        bodyTemplate: args.bodyTemplate ?? null,
        headersTemplate: (args.headersTemplate as Record<string, unknown>) ?? {},
        sampleResponse: args.sampleResponse ?? null,
      });
      return {
        ok: true,
        data: {
          id: recipe.id,
          integrationSlug: integration.slug,
          slug: recipe.slug,
          name: recipe.name,
          method: recipe.method,
          pathTemplate: recipe.pathTemplate,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to save recipe.", status: 400 };
    }
  },
});

registerTool({
  name: "recipes.list",
  description: "List saved recipes for the workspace, optionally filtered by integration slug.",
  args: {
    integrationSlug: { type: "string", description: "Filter by integration slug" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    let integrationId: string | undefined;
    if (typeof args.integrationSlug === "string" && args.integrationSlug) {
      const integration = await getIntegrationBySlug(workspaceId, args.integrationSlug);
      if (!integration) return { ok: false, error: `Integration '${args.integrationSlug}' not found.`, status: 404 };
      integrationId = integration.id;
    }
    const rows = await listRecipes(workspaceId, integrationId);
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        integrationId: r.integrationId,
        slug: r.slug,
        name: r.name,
        description: r.description,
        method: r.method,
        pathTemplate: r.pathTemplate,
        successCount: r.successCount,
        lastUsedAt: r.lastUsedAt,
      })),
    };
  },
});

registerTool({
  name: "recipes.call",
  description:
    "Execute a saved recipe by (integrationSlug, recipeSlug) with a `vars` object for {{var}} substitution. Returns the parsed response and bumps success_count on 2xx.",
  args: {
    integrationSlug: { type: "string", required: true },
    recipeSlug: { type: "string", required: true },
    vars: { type: "object", description: "Values substituted into the recipe's {{var}} placeholders" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const result = await runRecipe({
      workspaceId,
      integrationSlug: String(args.integrationSlug),
      recipeSlug: String(args.recipeSlug),
      vars: (args.vars as Record<string, unknown>) ?? {},
    });
    if (!result.ok) {
      return { ok: false, error: result.error, status: result.status, details: result.data };
    }
    return {
      ok: true,
      data: { status: result.status, data: result.data, url: result.url, latencyMs: result.latencyMs },
    };
  },
});

registerTool({
  name: "recipes.delete",
  description: "Delete a saved recipe by id.",
  args: {
    recipeId: { type: "string", required: true },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    try {
      await deleteRecipe(workspaceId, String(args.recipeId));
      return { ok: true, data: { deleted: true } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to delete recipe.", status: 400 };
    }
  },
});

/**
 * Resolve the workspace-local skills directory. Files live on disk alongside
 * the app source so Hermes can load them via the existing skills/ convention.
 */
function skillsRoot(): string {
  return path.join(process.cwd(), "skills");
}

function safeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "unnamed";
}

function formatSkillMarkdown(params: {
  integrationSlug: string;
  integrationProvider: string;
  recipeSlug: string;
  recipeName: string;
  description: string | null;
  method: string;
  pathTemplate: string;
  queryTemplate: Record<string, unknown>;
  bodyTemplate: unknown;
  headersTemplate: Record<string, unknown>;
  sampleResponse: unknown;
}): string {
  const summary = params.description ?? `Call ${params.integrationSlug} ${params.method} ${params.pathTemplate}`;
  const sample = params.sampleResponse
    ? "```json\n" + JSON.stringify(params.sampleResponse, null, 2).slice(0, 2000) + "\n```"
    : "_no sample captured_";
  const exampleArgs = {
    integrationSlug: params.integrationSlug,
    recipeSlug: params.recipeSlug,
    vars: {},
  };
  return [
    "# " + params.recipeName,
    "",
    `Integration: \`${params.integrationSlug}\` (provider: ${params.integrationProvider})`,
    `Recipe slug: \`${params.recipeSlug}\``,
    "",
    "## When to use",
    "",
    summary,
    "",
    "## Request template",
    "",
    `- Method: \`${params.method}\``,
    `- Path: \`${params.pathTemplate}\``,
    "- Query:",
    "```json",
    JSON.stringify(params.queryTemplate ?? {}, null, 2),
    "```",
    "- Body:",
    "```json",
    JSON.stringify(params.bodyTemplate ?? null, null, 2),
    "```",
    "- Headers:",
    "```json",
    JSON.stringify(params.headersTemplate ?? {}, null, 2),
    "```",
    "",
    "## How to invoke",
    "",
    "Call the `recipes.call` tool:",
    "",
    "```json",
    JSON.stringify(exampleArgs, null, 2),
    "```",
    "",
    "Any `{{var}}` placeholders above must be supplied inside `vars`.",
    "",
    "## Example response",
    "",
    sample,
    "",
  ].join("\n");
}

registerTool({
  name: "skills.publish_recipe",
  description:
    "Emit a Hermes SKILL.md file for a saved recipe so future sessions inherit it. Writes to skills/integration-{provider}-{recipeSlug}/SKILL.md. Returns the file path.",
  args: {
    recipeId: { type: "string", required: true, description: "Recipe id from recipes.save / recipes.list" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const recipe = await getRecipeById(workspaceId, String(args.recipeId));
    if (!recipe) return { ok: false, error: "Recipe not found.", status: 404 };
    // Look up the integration so we can include provider + slug in the skill path.
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const { data: integrationRow } = await supabase
      .from("workspace_integrations")
      .select("slug, provider")
      .eq("id", recipe.integrationId)
      .maybeSingle();
    const integrationSlug = String((integrationRow as { slug?: string } | null)?.slug ?? "integration");
    const provider = String((integrationRow as { provider?: string } | null)?.provider ?? "custom");
    const folderName = `integration-${safeSegment(provider)}-${safeSegment(recipe.slug)}`;
    const dirPath = path.join(skillsRoot(), folderName);
    const filePath = path.join(dirPath, "SKILL.md");
    try {
      await fs.mkdir(dirPath, { recursive: true });
      const markdown = formatSkillMarkdown({
        integrationSlug,
        integrationProvider: provider,
        recipeSlug: recipe.slug,
        recipeName: recipe.name,
        description: recipe.description,
        method: recipe.method,
        pathTemplate: recipe.pathTemplate,
        queryTemplate: recipe.queryTemplate,
        bodyTemplate: recipe.bodyTemplate,
        headersTemplate: recipe.headersTemplate,
        sampleResponse: recipe.sampleResponse,
      });
      await fs.writeFile(filePath, markdown, "utf8");
      return {
        ok: true,
        data: {
          path: `skills/${folderName}/SKILL.md`,
          integrationSlug,
          recipeSlug: recipe.slug,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to write skill file.", status: 500 };
    }
  },
});

registerTool({
  name: "skills.publish_automation",
  description:
    "Emit a Hermes SKILL.md summarizing a cron workflow the agent authored, so future sessions see it exists. Writes to skills/automation-{name}/SKILL.md.",
  args: {
    workflowId: { type: "string", required: true, description: "workspace_workflows.id" },
    notes: { type: "string", description: "Optional free-form notes the agent wants future sessions to see" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };
    const { data, error } = await supabase
      .from("workspace_workflows")
      .select("id, name, description, enabled, trigger, steps")
      .eq("workspace_id", workspaceId)
      .eq("id", String(args.workflowId))
      .maybeSingle();
    if (error) return { ok: false, error: error.message, status: 500 };
    if (!data) return { ok: false, error: "Workflow not found.", status: 404 };
    const row = data as {
      id: string;
      name: string;
      description: string | null;
      enabled: boolean;
      trigger: Record<string, unknown> | null;
      steps: unknown[] | null;
    };
    const folderName = `automation-${safeSegment(row.name || row.id)}`;
    const dirPath = path.join(skillsRoot(), folderName);
    const filePath = path.join(dirPath, "SKILL.md");
    const notes = typeof args.notes === "string" && args.notes ? args.notes : null;
    const markdown = [
      `# ${row.name || "Agent automation"}`,
      "",
      row.description ?? "_(no description)_",
      "",
      `Status: ${row.enabled ? "enabled" : "disabled"}`,
      `Workflow id: \`${row.id}\``,
      "",
      "## Trigger",
      "",
      "```json",
      JSON.stringify(row.trigger ?? {}, null, 2),
      "```",
      "",
      "## Steps",
      "",
      "```json",
      JSON.stringify(row.steps ?? [], null, 2),
      "```",
      "",
      notes ? "## Notes\n\n" + notes + "\n" : "",
      "## How to modify",
      "",
      "Use the `automations.update` or `automations.disable` tools with this workflow id.",
      "",
    ].join("\n");
    try {
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, markdown, "utf8");
      return { ok: true, data: { path: `skills/${folderName}/SKILL.md`, workflowId: row.id } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to write skill file.", status: 500 };
    }
  },
});
