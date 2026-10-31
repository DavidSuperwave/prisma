import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillsRoot = path.join(root, "skills");
const outputDir = path.join(root, ".data", "skills-tap");
const outputPath = path.join(outputDir, "index.json");

async function run() {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const markdownPath = path.join(skillsRoot, entry.name, "SKILL.md");
    try {
      const markdown = await fs.readFile(markdownPath, "utf8");
      const descriptionLine = markdown
        .split(/\r?\n/)
        .find((line) => line.trim().startsWith("description:"));
      const description = descriptionLine
        ? descriptionLine.replace(/^description:\s*/, "").replace(/^["']|["']$/g, "")
        : "Prisma skill";
      skills.push({
        slug: entry.name,
        title: entry.name,
        description,
        file: `skills/${entry.name}/SKILL.md`,
      });
    } catch {
      // Ignore folders without SKILL.md
    }
  }

  const payload = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    skills: skills.sort((a, b) => a.slug.localeCompare(b.slug)),
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${outputPath} (${payload.skills.length} skills)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
