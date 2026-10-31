import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUALIFICATION_YEARS,
  WHATSAPP_QUALIFICATION_TEST_MATRIX,
  evaluateQualificationReasons,
  resolveWhatsAppSalesStage,
} from "./whatsappQualificationFlow";

describe("whatsappQualificationFlow", () => {
  it("encodes the full audit matrix branches", () => {
    expect(WHATSAPP_QUALIFICATION_TEST_MATRIX.map((scenario) => scenario.id)).toEqual([
      "initial-outreach",
      "ask-employee-count-first",
      "qualified-by-employees",
      "qualified-by-years",
      "qualified-by-physical-office",
      "not-qualified-branch",
      "post-payment-branch",
      "delivery-branch",
    ]);
  });

  it("qualifies leads by employees, years, or physical offices", () => {
    expect(
      evaluateQualificationReasons({ employeeCount: 6 }, DEFAULT_QUALIFICATION_YEARS),
    ).toEqual(["employee_count"]);
    expect(
      evaluateQualificationReasons({ yearsInBusiness: DEFAULT_QUALIFICATION_YEARS }, DEFAULT_QUALIFICATION_YEARS),
    ).toEqual(["years_in_business"]);
    expect(
      evaluateQualificationReasons({ hasPhysicalOffices: true }, DEFAULT_QUALIFICATION_YEARS),
    ).toEqual(["physical_office"]);
  });

  it("resolves every scenario to its expected stage and action", () => {
    for (const scenario of WHATSAPP_QUALIFICATION_TEST_MATRIX) {
      expect(resolveWhatsAppSalesStage(scenario.state)).toMatchObject({
        stage: scenario.expectedStage,
        nextAction: scenario.expectedAction,
        reasons: scenario.expectedReasons,
      });
    }
  });

  it("asks follow-up qualification questions only when still needed", () => {
    expect(
      resolveWhatsAppSalesStage({
        businessDescription: "Agencia automotriz",
        employeeCount: 3,
      }),
    ).toMatchObject({
      stage: "ask_years_in_business",
      nextAction: "ask_years_in_business",
    });

    expect(
      resolveWhatsAppSalesStage({
        businessDescription: "Agencia automotriz",
        employeeCount: 3,
        yearsInBusiness: 1,
      }),
    ).toMatchObject({
      stage: "ask_physical_offices",
      nextAction: "ask_physical_offices",
    });
  });
});

