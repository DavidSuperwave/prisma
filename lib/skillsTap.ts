import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type PrismaSkillEntry = {
  slug: string;
  title: string;
  description: string;
  path: string;
};

export function resolveRepoSkillsRoot() {
  return path.join(process.cwd(), "skills");
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function parseDescription(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("description:")) {
      return trimmed.replace(/^description:\s*/, "").replace(/^["']|["']$/g, "");
    }
  }
  return "Prisma workspace skill";
}

export async function listPrismaSkillsTap(): Promise<PrismaSkillEntry[]> {
  const root = resolveRepoSkillsRoot();
  const entries = await readdir(root, { withFileTypes: true });
  const skills: PrismaSkillEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(root, entry.name, "SKILL.md");
    try {
      const markdown = await readFile(skillPath, "utf8");
      skills.push({
        slug: entry.name,
        title: humanizeSlug(entry.name),
        description: parseDescription(markdown),
        path: skillPath,
      });
    } catch {
      // Ignore directories without a SKILL.md.
    }
  }
  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readSkillMarkdownBySlug(slug: string): Promise<string | null> {
  const skillPath = path.join(resolveRepoSkillsRoot(), slug, "SKILL.md");
  try {
    return await readFile(skillPath, "utf8");
  } catch {
    return null;
  }
}
