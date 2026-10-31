import { readSkillMarkdownBySlug } from "@/lib/skillsTap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ skillSlug: string }>;
};

export async function GET(_request: Request, context: Context) {
  const { skillSlug } = await context.params;
  const markdown = await readSkillMarkdownBySlug(skillSlug);
  if (!markdown) {
    return Response.json({ error: "Skill not found." }, { status: 404 });
  }
  return new Response(markdown, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
    },
  });
}
