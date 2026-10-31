import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import {
  ensureWorkspaceHermesHome,
  loadWorkspaceSkillsState,
  resolveWorkspaceHermesHome,
  saveWorkspaceSkillsState,
  syncWorkspaceExternalSkills,
} from "@/lib/hermesHome";
import { listPrismaSkillsTap, readSkillMarkdownBySlug } from "@/lib/skillsTap";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type SkillsAction =
  | "create_local"
  | "fork_builtin"
  | "toggle_builtin"
  | "promote_local"
  | "unpromote_local"
  | "delete_local";

type SkillsBody = {
  action?: SkillsAction;
  slug?: string;
  sourceSlug?: string;
  title?: string;
  description?: string;
  requiredEnvironmentVariables?: string[];
  starterInstructions?: string;
  enabled?: boolean;
};

type WorkspaceLocalSkill = {
  slug: string;
  title: string;
  description: string;
  path: string;
};

function normalizeSlug(input: string) {
  const parts = input
    .split("/")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter((part) => part.length > 0);
  return parts.join("/");
}

function localSkillDir(workspaceId: string, slug: string) {
  const normalized = normalizeSlug(slug);
  return path.join(resolveWorkspaceHermesHome(workspaceId), "skills", ...normalized.split("/"));
}

function parseSkillSummary(markdown: string, fallback: string): { title: string; description: string } {
  const lines = markdown.split(/\r?\n/);
  const title =
    lines
      .find((line) => line.trim().startsWith("# "))
      ?.replace(/^#\s+/, "")
      .trim() || fallback;
  const description =
    lines
      .find((line) => line.trim().startsWith("description:"))
      ?.replace(/^description:\s*/, "")
      .replace(/^["']|["']$/g, "")
      .trim() || "Workspace-local Hermes skill";
  return { title, description };
}

async function listWorkspaceLocalSkills(workspaceId: string) {
  const home = resolveWorkspaceHermesHome(workspaceId);
  const root = path.join(home, "skills");
  const skills: WorkspaceLocalSkill[] = [];

  async function walk(relativeParts: string[]) {
    const currentDir = path.join(root, ...relativeParts);
    let entries: Array<{ isFile: () => boolean; isDirectory: () => boolean; name: string }>;
    try {
      entries = (await readdir(currentDir, { withFileTypes: true })).map((entry) => ({
        isFile: () => entry.isFile(),
        isDirectory: () => entry.isDirectory(),
        name: String(entry.name),
      }));
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      const markdownPath = path.join(currentDir, "SKILL.md");
      try {
        const markdown = await readFile(markdownPath, "utf8");
        const slug = relativeParts.join("/");
        const summary = parseSkillSummary(markdown, slug);
        skills.push({
          slug,
          title: summary.title,
          description: summary.description,
          path: markdownPath,
        });
      } catch {
        // Ignore malformed skill files.
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "external" || entry.name.startsWith(".")) continue;
      await walk([...relativeParts, entry.name]);
    }
  }

  await walk([]);
  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

function createSkillMarkdown(input: {
  title: string;
  description: string;
  requiredEnvironmentVariables: string[];
  starterInstructions: string;
}) {
  return [
    `# ${input.title}`,
    "",
    input.description,
    "",
    "## required_environment_variables",
    input.requiredEnvironmentVariables.length > 0
      ? input.requiredEnvironmentVariables.map((entry) => `- ${entry}`).join("\n")
      : "- none",
    "",
    "## workflow",
    input.starterInstructions,
    "",
  ].join("\n");
}

export async function GET(_request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;

  await ensureWorkspaceHermesHome({
    workspaceId: auth.context.workspaceId,
    workspaceSlug,
  });

  const [builtIn, local, state] = await Promise.all([
    listPrismaSkillsTap(),
    listWorkspaceLocalSkills(auth.context.workspaceId),
    loadWorkspaceSkillsState(auth.context.workspaceId),
  ]);

  const disabled = new Set(state.disabledBuiltIn);
  const promoted = new Set(state.promotedLocal);

  return Response.json({
    builtIn: builtIn.map((skill) => ({
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      enabled: !disabled.has(skill.slug),
    })),
    local: local.map((skill) => ({
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      promoted: promoted.has(skill.slug),
      path: skill.path,
    })),
    state,
  });
}

export async function POST(request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;
  if (auth.context.role === "viewer") {
    return Response.json({ error: "Viewers cannot modify skills." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as SkillsBody;
  const action = body.action ?? "create_local";

  await ensureWorkspaceHermesHome({
    workspaceId: auth.context.workspaceId,
    workspaceSlug,
  });

  const workspaceId = auth.context.workspaceId;
  const state = await loadWorkspaceSkillsState(workspaceId);

  if (action === "toggle_builtin") {
    const slug = normalizeSlug(body.slug ?? "");
    if (!slug) return Response.json({ error: "slug is required." }, { status: 400 });
    const enabled = body.enabled !== false;
    const disabledSet = new Set(state.disabledBuiltIn);
    if (enabled) {
      disabledSet.delete(slug);
    } else {
      disabledSet.add(slug);
    }
    const updated = await saveWorkspaceSkillsState(workspaceId, {
      ...state,
      disabledBuiltIn: Array.from(disabledSet),
    });
    await syncWorkspaceExternalSkills(workspaceId, updated);
    return Response.json({ ok: true, state: updated });
  }

  if (action === "promote_local" || action === "unpromote_local") {
    const slug = normalizeSlug(body.slug ?? "");
    if (!slug) return Response.json({ error: "slug is required." }, { status: 400 });
    const promotedSet = new Set(state.promotedLocal);
    if (action === "promote_local") {
      promotedSet.add(slug);
    } else {
      promotedSet.delete(slug);
    }
    const updated = await saveWorkspaceSkillsState(workspaceId, {
      ...state,
      promotedLocal: Array.from(promotedSet),
    });
    await syncWorkspaceExternalSkills(workspaceId, updated);
    return Response.json({ ok: true, state: updated });
  }

  if (action === "delete_local") {
    const slug = normalizeSlug(body.slug ?? "");
    if (!slug) return Response.json({ error: "slug is required." }, { status: 400 });
    const dir = localSkillDir(workspaceId, slug);
    await rm(dir, { recursive: true, force: true });
    const updated = await saveWorkspaceSkillsState(workspaceId, {
      ...state,
      promotedLocal: state.promotedLocal.filter((entry) => entry !== slug),
    });
    await syncWorkspaceExternalSkills(workspaceId, updated);
    return Response.json({ ok: true, deleted: slug, state: updated });
  }

  if (action === "fork_builtin") {
    const sourceSlug = normalizeSlug(body.sourceSlug ?? body.slug ?? "");
    if (!sourceSlug) return Response.json({ error: "sourceSlug is required." }, { status: 400 });
    const targetSlug = normalizeSlug(body.slug ?? sourceSlug);
    if (!targetSlug) return Response.json({ error: "slug is required." }, { status: 400 });
    const markdown = await readSkillMarkdownBySlug(sourceSlug);
    if (!markdown) return Response.json({ error: "Built-in skill not found." }, { status: 404 });
    const dir = localSkillDir(workspaceId, targetSlug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "SKILL.md"), markdown, "utf8");
    await syncWorkspaceExternalSkills(workspaceId, state);
    return Response.json({ ok: true, skill: { slug: targetSlug, sourceSlug } }, { status: 201 });
  }

  const inputSlug = normalizeSlug(body.slug ?? "");
  if (!inputSlug) {
    return Response.json({ error: "slug is required." }, { status: 400 });
  }

  const requiredEnvironmentVariables = Array.isArray(body.requiredEnvironmentVariables)
    ? body.requiredEnvironmentVariables
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0)
    : [];

  const title = (body.title ?? inputSlug).trim() || inputSlug;
  const description = (body.description ?? "Workspace-local Hermes skill").trim();
  const starterInstructions =
    (body.starterInstructions ??
      "1. Use web_extract to review documentation.\n2. Use execute_code for deterministic API calls.\n3. Persist stable patterns back into this skill.") +
    "";

  const dir = localSkillDir(workspaceId, inputSlug);
  await mkdir(dir, { recursive: true });
  const markdown = createSkillMarkdown({
    title,
    description,
    requiredEnvironmentVariables,
    starterInstructions,
  });
  const markdownPath = path.join(dir, "SKILL.md");
  await writeFile(markdownPath, markdown, "utf8");
  await syncWorkspaceExternalSkills(workspaceId, state);

  return Response.json(
    {
      skill: {
        slug: inputSlug,
        title,
        path: markdownPath,
      },
    },
    { status: 201 },
  );
}