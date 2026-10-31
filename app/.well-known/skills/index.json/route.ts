import { listPrismaSkillsTap } from "@/lib/skillsTap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const skills = await listPrismaSkillsTap();
  const origin = new URL(request.url).origin;
  return Response.json({
    version: "1.0",
    generatedAt: new Date().toISOString(),
    source: "prisma-skills-tap",
    skills: skills.map((skill) => ({
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      url: `${origin}/.well-known/skills/${encodeURIComponent(skill.slug)}`,
    })),
  });
}
