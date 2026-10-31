import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSkill(slug: string) {
  return readFileSync(path.join(root, "skills", slug, "SKILL.md"), "utf8");
}

describe("Prisma Hermes skills contract", () => {
  it("documents the WhatsApp SDR acceptance flow without mixing branch links", () => {
    const skill = readSkill("prisma-sdr-whatsapp");
    expect(skill).toContain("¿Cuántas personas trabajan en tu empresa?");
    expect(skill).toContain("https://calendly.com/jaime-ailegalgrowth/30min");
    expect(skill).toContain("https://buy.stripe.com/9B68wOgOw4g8fPk1617EQ0m");
    expect(skill).toContain("Never send both Calendly and Stripe links in the same branch.");
    expect(skill).toContain("Do not ask all qualification questions at once.");
  });

  it("documents API-key integration building as tool-led, draft-first behavior", () => {
    const skill = readSkill("prisma-integration-builder");
    expect(skill).toContain("Store credentials only through Prisma tools");
    expect(skill).toContain("integrations.probe");
    expect(skill).toContain("Keep it draft until the user/admin approves.");
    expect(skill).toContain("Do not call arbitrary external URLs unless the URL is part of an approved connection/MCP config.");
  });
});
