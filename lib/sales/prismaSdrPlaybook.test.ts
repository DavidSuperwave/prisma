import { describe, expect, it } from "vitest";
import {
  PRISMA_SDR_CALENDLY_URL,
  PRISMA_SDR_PLAYBOOK,
  PRISMA_SDR_STRIPE_URL,
  buildPrismaSdrLeadMetadata,
} from "./prismaSdrPlaybook";

describe("Prisma SDR playbook", () => {
  it("keeps the qualified and unqualified branches distinct", () => {
    expect(PRISMA_SDR_PLAYBOOK.qualified).toContain(PRISMA_SDR_CALENDLY_URL);
    expect(PRISMA_SDR_PLAYBOOK.qualified).not.toContain(PRISMA_SDR_STRIPE_URL);
    expect(PRISMA_SDR_PLAYBOOK.unqualified).toContain(PRISMA_SDR_STRIPE_URL);
    expect(PRISMA_SDR_PLAYBOOK.unqualified).not.toContain(PRISMA_SDR_CALENDLY_URL);
  });

  it("builds structured state for inbound WhatsApp leads", () => {
    const metadata = buildPrismaSdrLeadMetadata({
      from: "+5215550001111",
      message: "Hola",
      payload: { text: "Hola" },
    });

    expect(metadata).toMatchObject({
      channel: "whatsapp",
      from: "+5215550001111",
      message: "Hola",
      sdr_playbook: "prisma-ai-free-website-v1",
      qualification_status: "collecting",
      next_question: "business_type",
    });
    expect(metadata.qualification_rules.qualified_if).toEqual([
      "more_than_5_employees",
      "has_offices_or_branches",
      "several_years_operating",
    ]);
  });
});
