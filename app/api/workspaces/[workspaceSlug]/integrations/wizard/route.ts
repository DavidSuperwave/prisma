import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { createIntegration, getIntegrationBySlug, updateIntegration } from "@/lib/integrations/store";
import { ensureWorkspaceHermesHome, resolveWorkspaceHermesHome, syncWorkspaceExternalSkills } from "@/lib/hermesHome";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type WizardBody = {
  vendorName?: string;
  docsUrl?: string;
  apiKey?: string;
  baseUrl?: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCredentialEnvKey(vendorSlug: string) {
  return `${vendorSlug.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase()}_API_KEY`;
}

function inferBaseUrl(docsUrl: string | null, explicitBaseUrl: string | null) {
  if (explicitBaseUrl) return explicitBaseUrl;
  if (!docsUrl) return null;
  try {
    const parsed = new URL(docsUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

async function upsertWorkspaceIntegration(params: {
  workspaceId: string;
  vendorSlug: string;
  vendorLabel: string;
  docsUrl: string | null;
  apiKey: string;
  credentialEnvKey: string;
  baseUrl: string | null;
  createdBy: string | null;
}) {
  const existing = await getIntegrationBySlug(params.workspaceId, params.vendorSlug);
  const config = {
    baseUrl: params.baseUrl ?? "",
    docsUrl: params.docsUrl ?? "",
    authHeader: "Authorization",
    authScheme: "Bearer",
    credentialEnvKey: params.credentialEnvKey,
  };
  const secrets = {
    apiKey: params.apiKey,
  };

  if (existing) {
    return updateIntegration(params.workspaceId, existing.id, {
      status: "active",
      config,
      secrets,
    });
  }

  return createIntegration({
    workspaceId: params.workspaceId,
    slug: params.vendorSlug,
    label: params.vendorLabel,
    provider: "custom_api",
    authType: "api_key",
    config,
    secrets,
    createdBy: params.createdBy,
  });
}

async function scaffoldIntegrationSkill(params: {
  workspaceId: string;
  workspaceSlug: string;
  vendorSlug: string;
  vendorName: string;
  docsUrl: string | null;
  credentialEnvKey: string;
}) {
  await ensureWorkspaceHermesHome({
    workspaceId: params.workspaceId,
    workspaceSlug: params.workspaceSlug,
  });
  const home = resolveWorkspaceHermesHome(params.workspaceId);
  const skillDir = path.join(home, "skills", "integrations", params.vendorSlug);
  await mkdir(skillDir, { recursive: true });
  const markdown = [
    `# ${params.vendorName} integration skill`,
    "",
    `Use this skill to call ${params.vendorName} without hardcoding app-side integrations.`,
    "",
    "## required_environment_variables",
    `- ${params.credentialEnvKey}`,
    "",
    "## workflow",
    `1. Use web_extract to review API docs (${params.docsUrl ?? "provide docs URL at runtime"}).`,
    "2. Use execute_code to write and run Python API calls.",
    "3. Save stable request patterns with recipe tools for reuse.",
    "4. Patch this skill with discovered endpoints and payload contracts.",
    "",
  ].join("\n");
  const skillPath = path.join(skillDir, "SKILL.md");
  await writeFile(skillPath, markdown, "utf8");
  return skillPath;
}

async function projectCredentialFile(params: {
  workspaceId: string;
  workspaceSlug: string;
  vendorSlug: string;
  apiKey: string;
  credentialEnvKey: string;
}) {
  await ensureWorkspaceHermesHome({
    workspaceId: params.workspaceId,
    workspaceSlug: params.workspaceSlug,
  });
  const home = resolveWorkspaceHermesHome(params.workspaceId);
  const credentialsDir = path.join(home, "credentials");
  await mkdir(credentialsDir, { recursive: true });
  const credentialPath = path.join(credentialsDir, `${params.vendorSlug}.env`);
  await writeFile(credentialPath, `${params.credentialEnvKey}=${params.apiKey}\n`, "utf8");
  return credentialPath;
}

export async function POST(request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;
  if (auth.context.role === "viewer") {
    return Response.json({ error: "Viewers cannot configure integrations." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as WizardBody;
  const vendorName = (body.vendorName ?? "").trim();
  const docsUrl = (body.docsUrl ?? "").trim() || null;
  const apiKey = (body.apiKey ?? "").trim();
  const explicitBaseUrl = (body.baseUrl ?? "").trim() || null;

  if (!vendorName) {
    return Response.json({ error: "vendorName is required." }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json({ error: "apiKey is required." }, { status: 400 });
  }

  const vendorSlug = `integration-${slugify(vendorName) || "custom"}`;
  const credentialEnvKey = buildCredentialEnvKey(vendorSlug);
  const baseUrl = inferBaseUrl(docsUrl, explicitBaseUrl);

  const integration = await upsertWorkspaceIntegration({
    workspaceId: auth.context.workspaceId,
    vendorSlug,
    vendorLabel: `${vendorName} API`,
    docsUrl,
    apiKey,
    credentialEnvKey,
    baseUrl,
    createdBy: auth.context.user.id,
  });

  const skillPath = await scaffoldIntegrationSkill({
    workspaceId: auth.context.workspaceId,
    workspaceSlug,
    vendorSlug,
    vendorName,
    docsUrl,
    credentialEnvKey,
  });
  const credentialPath = await projectCredentialFile({
    workspaceId: auth.context.workspaceId,
    workspaceSlug,
    vendorSlug,
    apiKey,
    credentialEnvKey,
  });
  await syncWorkspaceExternalSkills(auth.context.workspaceId);

  return Response.json(
    {
      integration,
      skill: {
        slug: `integrations/${vendorSlug}`,
        path: skillPath,
      },
      credentialFile: credentialPath,
      credentialEnvKey,
      nextSteps: [
        "Prompt the agent to read docs via web_extract and call the API via execute_code.",
        "After first successful run, persist the API pattern with recipes.save.",
      ],
    },
    { status: 201 },
  );
}
