export const DEFAULT_QUALIFICATION_YEARS = 3;

export type WhatsAppSalesStage =
  | "initial_outreach"
  | "ask_employee_count"
  | "ask_years_in_business"
  | "ask_physical_offices"
  | "qualified"
  | "not_qualified"
  | "post_payment"
  | "delivery";

export type QualificationReason = "employee_count" | "years_in_business" | "physical_office";

export type WhatsAppLeadState = {
  businessDescription?: string | null;
  employeeCount?: number | null;
  yearsInBusiness?: number | null;
  hasPhysicalOffices?: boolean | null;
  paymentConfirmed?: boolean | null;
  deliveryReady?: boolean | null;
};

export type WhatsAppSalesResolution = {
  stage: WhatsAppSalesStage;
  reasons: QualificationReason[];
  nextAction:
    | "offer_free_site_and_ask_business_type"
    | "ask_employee_count"
    | "ask_years_in_business"
    | "ask_physical_offices"
    | "send_calendly_link"
    | "offer_paid_maintenance_and_send_stripe_link"
    | "collect_build_assets"
    | "send_site_link_and_invite_revisions";
};

export type WhatsAppQualificationScenario = {
  id: string;
  description: string;
  state: WhatsAppLeadState;
  expectedStage: WhatsAppSalesStage;
  expectedAction: WhatsAppSalesResolution["nextAction"];
  expectedReasons: QualificationReason[];
};

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function evaluateQualificationReasons(
  state: WhatsAppLeadState,
  yearsThreshold = DEFAULT_QUALIFICATION_YEARS,
): QualificationReason[] {
  const reasons: QualificationReason[] = [];
  const employeeCount = normalizeNumber(state.employeeCount);
  const yearsInBusiness = normalizeNumber(state.yearsInBusiness);
  if (employeeCount !== null && employeeCount > 5) {
    reasons.push("employee_count");
  }
  if (state.hasPhysicalOffices === true) {
    reasons.push("physical_office");
  }
  if (yearsInBusiness !== null && yearsInBusiness >= yearsThreshold) {
    reasons.push("years_in_business");
  }
  return reasons;
}

export function resolveWhatsAppSalesStage(
  state: WhatsAppLeadState,
  yearsThreshold = DEFAULT_QUALIFICATION_YEARS,
): WhatsAppSalesResolution {
  const reasons = evaluateQualificationReasons(state, yearsThreshold);

  if (state.deliveryReady) {
    return {
      stage: "delivery",
      reasons,
      nextAction: "send_site_link_and_invite_revisions",
    };
  }

  if (state.paymentConfirmed) {
    return {
      stage: "post_payment",
      reasons,
      nextAction: "collect_build_assets",
    };
  }

  if (!state.businessDescription?.trim()) {
    return {
      stage: "initial_outreach",
      reasons,
      nextAction: "offer_free_site_and_ask_business_type",
    };
  }

  if (normalizeNumber(state.employeeCount) === null) {
    return {
      stage: "ask_employee_count",
      reasons,
      nextAction: "ask_employee_count",
    };
  }

  if (reasons.length > 0) {
    return {
      stage: "qualified",
      reasons,
      nextAction: "send_calendly_link",
    };
  }

  if (normalizeNumber(state.yearsInBusiness) === null) {
    return {
      stage: "ask_years_in_business",
      reasons,
      nextAction: "ask_years_in_business",
    };
  }

  const afterYearsReasons = evaluateQualificationReasons(state, yearsThreshold);
  if (afterYearsReasons.length > 0) {
    return {
      stage: "qualified",
      reasons: afterYearsReasons,
      nextAction: "send_calendly_link",
    };
  }

  if (typeof state.hasPhysicalOffices !== "boolean") {
    return {
      stage: "ask_physical_offices",
      reasons: afterYearsReasons,
      nextAction: "ask_physical_offices",
    };
  }

  const finalReasons = evaluateQualificationReasons(state, yearsThreshold);
  if (finalReasons.length > 0) {
    return {
      stage: "qualified",
      reasons: finalReasons,
      nextAction: "send_calendly_link",
    };
  }

  return {
    stage: "not_qualified",
    reasons: finalReasons,
    nextAction: "offer_paid_maintenance_and_send_stripe_link",
  };
}

export const WHATSAPP_QUALIFICATION_TEST_MATRIX: WhatsAppQualificationScenario[] = [
  {
    id: "initial-outreach",
    description: "Start by offering the free site and asking what the company does.",
    state: {},
    expectedStage: "initial_outreach",
    expectedAction: "offer_free_site_and_ask_business_type",
    expectedReasons: [],
  },
  {
    id: "ask-employee-count-first",
    description: "Once the business is known, employee count is always the first qualification question.",
    state: { businessDescription: "Agencia automotriz" },
    expectedStage: "ask_employee_count",
    expectedAction: "ask_employee_count",
    expectedReasons: [],
  },
  {
    id: "qualified-by-employees",
    description: "More than five employees immediately qualifies the lead.",
    state: { businessDescription: "Agencia automotriz", employeeCount: 8 },
    expectedStage: "qualified",
    expectedAction: "send_calendly_link",
    expectedReasons: ["employee_count"],
  },
  {
    id: "qualified-by-years",
    description: "A smaller team can still qualify after several years in business.",
    state: {
      businessDescription: "Taller mecanico",
      employeeCount: 3,
      yearsInBusiness: 6,
    },
    expectedStage: "qualified",
    expectedAction: "send_calendly_link",
    expectedReasons: ["years_in_business"],
  },
  {
    id: "qualified-by-physical-office",
    description: "A physical office or branch qualifies the lead even with a small team.",
    state: {
      businessDescription: "Despacho contable",
      employeeCount: 2,
      yearsInBusiness: 1,
      hasPhysicalOffices: true,
    },
    expectedStage: "qualified",
    expectedAction: "send_calendly_link",
    expectedReasons: ["physical_office"],
  },
  {
    id: "not-qualified-branch",
    description: "A small, young, remote business should get the maintenance + Stripe branch.",
    state: {
      businessDescription: "Negocio local",
      employeeCount: 2,
      yearsInBusiness: 1,
      hasPhysicalOffices: false,
    },
    expectedStage: "not_qualified",
    expectedAction: "offer_paid_maintenance_and_send_stripe_link",
    expectedReasons: [],
  },
  {
    id: "post-payment-branch",
    description: "After payment, the agent must collect services, logo/images, contacts, and other assets.",
    state: {
      businessDescription: "Negocio local",
      employeeCount: 2,
      yearsInBusiness: 1,
      hasPhysicalOffices: false,
      paymentConfirmed: true,
    },
    expectedStage: "post_payment",
    expectedAction: "collect_build_assets",
    expectedReasons: [],
  },
  {
    id: "delivery-branch",
    description: "Once the site is ready, the agent should send the site link and invite revisions.",
    state: {
      businessDescription: "Negocio local",
      employeeCount: 2,
      yearsInBusiness: 1,
      hasPhysicalOffices: false,
      paymentConfirmed: true,
      deliveryReady: true,
    },
    expectedStage: "delivery",
    expectedAction: "send_site_link_and_invite_revisions",
    expectedReasons: [],
  },
];

