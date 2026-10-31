import { listTools } from "@/lib/agentTools/registry";
import { hermesStructured } from "@/lib/extraction/structuredField";
import { fillWorkspaceSlugInRoutePattern, isAllowedInternalRoute, renderRouteCatalogForPrompt } from "./routeCatalog";
import { dynamicToolNameFromSpec, type ApiComposeStep } from "./types";

const plannerSchemaName = "workflow_planner_v1";

const plannerOutputSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    tools: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 2000 },
          rationale: { type: "string", maxLength: 2000 },
          args: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                key: { type: "string" },
                type: { type: "string" },
                required: { type: "boolean" },
                description: { type: "string" },
              },
              required: ["key", "type", "required", "description"],
            },
          },
          implementation: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["api_compose"] },
              steps: {
                type: "array",
                maxItems: 16,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    action: {
                      type: "string",
                      enum: ["fetch_internal", "filter", "map", "aggregate"],
                    },
                    route: { type: "string" },
                    method: { type: "string" },
                    bodyTemplate: { type: "object" },
                    field: { type: "string" },
                    op: { type: "string" },
                    value: { type: "string" },
                  },
                  required: ["action"],
                },
              },
            },
            required: ["kind", "steps"],
          },
        },
        required: ["name", "description", "rationale", "args", "implementation"],
      },
    },
    notes: { type: "string", maxLength: 4000 },
  },
  required: ["tools", "notes"],
};

export type PlannerToolArg = {
  key: string;
  type: string;
  required: boolean;
  description: string;
};

export type PlannerStep = ApiComposeStep;

export type ToolProposal = {
  name: string;
  description: string;
  args: PlannerToolArg[];
  implementation: {
    kind: "api_compose";
    steps: ApiComposeStep[];
  };
  rationale: string;
};

export type PlannerOutput = {
  tools: ToolProposal[];
  notes: string;
};

export type RunWorkflowPlannerInput = {
  documentText: string;
  workspaceSlug: string;
  staticToolNameHint?: string[];
};

/**
 * Proposes dynamic tools (structured JSON) from workflow document text.
 */
export async function runWorkflowPlanner(
  input: RunWorkflowPlannerInput,
): Promise<{ output: PlannerOutput; validationWarnings: string[] }> {
  const staticNames = input.staticToolNameHint?.length
    ? input.staticToolNameHint
    : listTools().map((t) => t.name);
  const routeCatalog = renderRouteCatalogForPrompt(input.workspaceSlug);

  const result = await hermesStructured<PlannerOutput>({
    schemaName: plannerSchemaName,
    schema: plannerOutputSchema,
    messages: [
      {
        role: "system",
        content: [
          "You are a workflow-to-tool planner for a Prisma workspace agent.",
          "Propose 2–6 dynamic tools (short snake_case or dot names without spaces).",
          "Do NOT invent HTTP routes: every fetch_internal `route` must be one of the allowed patterns,",
          "with the literal workspace segment replaced by the real slug, e.g. /api/workspaces/{slug}/records",
          "For CMS/inventory, prefer using existing static tool names in rationale (cms.*) and still output api_compose that calls real workspace APIs where appropriate.",
          "If a step does not need HTTP, you may use filter/map/aggregate on prior JSON results in order.",
          "Never add tools that call non-workspace or external raw URLs.",
          "Available static tool names (for reference only, do not duplicate blindly): " + staticNames.join(", "),
          "",
          routeCatalog,
        ].join("\n"),
      },
      {
        role: "user",
        content: `Workspace slug: ${input.workspaceSlug}\n\n--- Document ---\n${input.documentText.slice(0, 80_000)}`,
      },
    ],
    maxTokens: 4000,
    temperature: 0.2,
  });

  const validationWarnings: string[] = [];
  for (const tool of result.data.tools) {
    const fullName = dynamicToolNameFromSpec(tool.name);
    if (fullName !== tool.name) {
      (tool as { name: string }).name = fullName;
    }
    for (const step of tool.implementation?.steps ?? []) {
      if (step.action === "fetch_internal" && step.route) {
        const filled = fillWorkspaceSlugInRoutePattern(
          step.route.includes("<slug>") ? step.route : step.route,
          input.workspaceSlug,
        );
        if (!isAllowedInternalRoute(filled, input.workspaceSlug)) {
          validationWarnings.push(
            `Tool "${tool.name}": disallowed or malformed route "${step.route}" (resolved "${filled}"). Remove or fix this step.`,
          );
        }
      }
    }
  }

  return { output: result.data, validationWarnings };
}

/**
 * For tests: build args_schema JSON from planner arg list (tool registry shape).
 */
export function buildArgsSchemaFromProposal(args: PlannerToolArg[]): Record<string, unknown> {
  const shape: Record<string, unknown> = {};
  for (const a of args) {
    const t = (a.type === "number" || a.type === "boolean" ? a.type : "string") as
      | "string"
      | "number"
      | "boolean"
      | "object"
      | "array";
    shape[a.key] = {
      type: t,
      required: a.required,
      description: a.description,
    };
  }
  return shape;
}
