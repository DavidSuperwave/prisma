import type {
  InboxCrmContext,
  InboxCrmEntity,
  InboxMessage,
  InboxMockState,
  InboxThread,
} from "@/components/workspace/inbox/types";

function crmRecordHref(workspaceSlug: string, entity: InboxCrmEntity, recordId: string) {
  return `/workspaces/${workspaceSlug}/crm/${entity}/${recordId}`;
}

function seedThreads(workspaceSlug: string): InboxThread[] {
  return [
    {
      id: "thread-email-1",
      channel: "email",
      title: "Renewal and seat expansion",
      participantName: "Jenna Tripp",
      participantAddress: "jenna@northloop.io",
      preview: "Can we add 14 seats to our annual plan and keep the same renewal date?",
      unreadCount: 2,
      lastMessageAt: "2026-04-19T12:32:00.000Z",
      status: "open",
      assignee: "Sofia Vega",
      tags: ["renewal", "high-value"],
      crmLink: {
        entity: "people",
        recordId: "ppl_203",
        label: "Jenna Tripp",
        href: crmRecordHref(workspaceSlug, "people", "ppl_203"),
      },
    },
    {
      id: "thread-whatsapp-1",
      channel: "whatsapp",
      title: "Demo follow-up from Mexico City",
      participantName: "Ricardo Navarro",
      participantAddress: "+52 55 1189 2020",
      preview: "I shared this with my sales manager. Can you send implementation timing?",
      unreadCount: 1,
      lastMessageAt: "2026-04-19T11:18:00.000Z",
      status: "pending",
      assignee: "Nora Kim",
      tags: ["demo", "follow-up"],
      crmLink: {
        entity: "deals",
        recordId: "deal_392",
        label: "North Region Expansion",
        href: crmRecordHref(workspaceSlug, "deals", "deal_392"),
      },
    },
    {
      id: "thread-email-2",
      channel: "email",
      title: "Billing details request",
      participantName: "Avery Stone",
      participantAddress: "avery@horizonlogi.com",
      preview: "Need your W-9 and VAT format before procurement signs.",
      unreadCount: 0,
      lastMessageAt: "2026-04-18T18:04:00.000Z",
      status: "open",
      assignee: null,
      tags: ["finance"],
      crmLink: {
        entity: "companies",
        recordId: "cmp_118",
        label: "Horizon Logistics",
        href: crmRecordHref(workspaceSlug, "companies", "cmp_118"),
      },
    },
    {
      id: "thread-whatsapp-2",
      channel: "whatsapp",
      title: "Support handoff request",
      participantName: "Daniel Pena",
      participantAddress: "+1 786 213 0098",
      preview: "Can your team migrate our templates from the previous provider?",
      unreadCount: 3,
      lastMessageAt: "2026-04-19T09:06:00.000Z",
      status: "open",
      assignee: "Sofia Vega",
      tags: ["migration", "support"],
      crmLink: {
        entity: "people",
        recordId: "ppl_441",
        label: "Daniel Pena",
        href: crmRecordHref(workspaceSlug, "people", "ppl_441"),
      },
    },
    {
      id: "thread-email-3",
      channel: "email",
      title: "Closed won handoff",
      participantName: "Mina Choi",
      participantAddress: "mina@atlasstudio.co",
      preview: "Thanks team, legal approved and the purchase order is attached.",
      unreadCount: 0,
      lastMessageAt: "2026-04-17T16:21:00.000Z",
      status: "resolved",
      assignee: "Nora Kim",
      tags: ["closed-won"],
      crmLink: {
        entity: "deals",
        recordId: "deal_211",
        label: "Atlas Studio Annual",
        href: crmRecordHref(workspaceSlug, "deals", "deal_211"),
      },
    },
    {
      id: "thread-whatsapp-3",
      channel: "whatsapp",
      title: "New inbound lead",
      participantName: "Lucia Ramos",
      participantAddress: "+52 81 2211 4009",
      preview: "I saw your ad. Do you integrate with HubSpot and Close?",
      unreadCount: 4,
      lastMessageAt: "2026-04-19T13:05:00.000Z",
      status: "open",
      assignee: null,
      tags: ["new-lead"],
      crmLink: null,
    },
  ];
}

function seedMessages(): Record<string, InboxMessage[]> {
  return {
    "thread-email-1": [
      {
        id: "m-email-1",
        threadId: "thread-email-1",
        direction: "inbound",
        sender: "Jenna Tripp",
        body: "Can we add 14 seats to our annual plan and keep the same renewal date?",
        createdAt: "2026-04-19T12:32:00.000Z",
      },
      {
        id: "m-email-2",
        threadId: "thread-email-1",
        direction: "outbound",
        sender: "Sofia Vega",
        body: "Yes, we can align seat expansion to your current renewal. I will send the revised quote in a few minutes.",
        createdAt: "2026-04-19T12:37:00.000Z",
      },
      {
        id: "m-email-3",
        threadId: "thread-email-1",
        direction: "note",
        sender: "Internal note",
        body: "Check expansion discount matrix before sending quote.",
        createdAt: "2026-04-19T12:41:00.000Z",
      },
    ],
    "thread-whatsapp-1": [
      {
        id: "m-wa-1",
        threadId: "thread-whatsapp-1",
        direction: "inbound",
        sender: "Ricardo Navarro",
        body: "I shared this with my sales manager. Can you send implementation timing?",
        createdAt: "2026-04-19T11:18:00.000Z",
      },
      {
        id: "m-wa-2",
        threadId: "thread-whatsapp-1",
        direction: "outbound",
        sender: "Nora Kim",
        body: "Absolutely. Typical setup is 7-10 business days. I can send a rollout plan by EOD.",
        createdAt: "2026-04-19T11:20:00.000Z",
      },
    ],
    "thread-email-2": [
      {
        id: "m-email-4",
        threadId: "thread-email-2",
        direction: "inbound",
        sender: "Avery Stone",
        body: "Need your W-9 and VAT format before procurement signs.",
        createdAt: "2026-04-18T18:04:00.000Z",
      },
    ],
    "thread-whatsapp-2": [
      {
        id: "m-wa-3",
        threadId: "thread-whatsapp-2",
        direction: "inbound",
        sender: "Daniel Pena",
        body: "Can your team migrate our templates from the previous provider?",
        createdAt: "2026-04-19T09:06:00.000Z",
      },
      {
        id: "m-wa-4",
        threadId: "thread-whatsapp-2",
        direction: "outbound",
        sender: "Sofia Vega",
        body: "Yes. We can migrate templates and tags. We usually complete migration in one sprint.",
        createdAt: "2026-04-19T09:11:00.000Z",
      },
    ],
    "thread-email-3": [
      {
        id: "m-email-5",
        threadId: "thread-email-3",
        direction: "inbound",
        sender: "Mina Choi",
        body: "Thanks team, legal approved and the purchase order is attached.",
        createdAt: "2026-04-17T16:21:00.000Z",
      },
    ],
    "thread-whatsapp-3": [
      {
        id: "m-wa-5",
        threadId: "thread-whatsapp-3",
        direction: "inbound",
        sender: "Lucia Ramos",
        body: "I saw your ad. Do you integrate with HubSpot and Close?",
        createdAt: "2026-04-19T13:05:00.000Z",
      },
    ],
  };
}

function seedCrmContexts(workspaceSlug: string): Record<string, InboxCrmContext | null> {
  return {
    "thread-email-1": {
      threadId: "thread-email-1",
      recordTitle: "Jenna Tripp",
      recordSubtitle: "Northloop Operations Lead",
      owner: "Sofia Vega",
      priority: "high",
      fields: [
        { label: "Company", value: "Northloop" },
        { label: "Lifecycle stage", value: "Expansion" },
        { label: "ARR", value: "$84,000" },
        { label: "Renewal date", value: "2026-07-15" },
      ],
      timeline: [
        {
          id: "ctx-1",
          title: "Call completed",
          detail: "Quarterly business review with procurement.",
          createdAt: "2026-04-17T15:00:00.000Z",
        },
        {
          id: "ctx-2",
          title: "Task open",
          detail: "Prepare revised pricing for +14 seats.",
          createdAt: "2026-04-19T12:38:00.000Z",
        },
      ],
      links: [
        {
          label: "Open contact record",
          href: crmRecordHref(workspaceSlug, "people", "ppl_203"),
        },
        {
          label: "Open active deal",
          href: crmRecordHref(workspaceSlug, "deals", "deal_414"),
        },
      ],
    },
    "thread-whatsapp-1": {
      threadId: "thread-whatsapp-1",
      recordTitle: "North Region Expansion",
      recordSubtitle: "Deal · Qualified",
      owner: "Nora Kim",
      priority: "medium",
      fields: [
        { label: "Company", value: "Navarro Distribution" },
        { label: "Stage", value: "Evaluation" },
        { label: "Pipeline value", value: "$42,500" },
        { label: "Next step", value: "Send rollout timeline" },
      ],
      timeline: [
        {
          id: "ctx-3",
          title: "Demo held",
          detail: "Product and channel orchestration walkthrough.",
          createdAt: "2026-04-16T17:10:00.000Z",
        },
      ],
      links: [
        {
          label: "Open deal",
          href: crmRecordHref(workspaceSlug, "deals", "deal_392"),
        },
      ],
    },
    "thread-email-2": {
      threadId: "thread-email-2",
      recordTitle: "Horizon Logistics",
      recordSubtitle: "Company · Procurement review",
      owner: "Unassigned",
      priority: "medium",
      fields: [
        { label: "Industry", value: "Logistics" },
        { label: "Employees", value: "420" },
        { label: "Region", value: "US" },
      ],
      timeline: [
        {
          id: "ctx-4",
          title: "Document request",
          detail: "Finance requested compliance package.",
          createdAt: "2026-04-18T18:07:00.000Z",
        },
      ],
      links: [
        {
          label: "Open company",
          href: crmRecordHref(workspaceSlug, "companies", "cmp_118"),
        },
      ],
    },
    "thread-whatsapp-2": {
      threadId: "thread-whatsapp-2",
      recordTitle: "Daniel Pena",
      recordSubtitle: "Contact · Onboarding evaluation",
      owner: "Sofia Vega",
      priority: "high",
      fields: [
        { label: "Company", value: "Pena Retail Group" },
        { label: "Region", value: "LATAM" },
        { label: "Use case", value: "Template migration" },
      ],
      timeline: [
        {
          id: "ctx-5",
          title: "Technical review",
          detail: "Need migration estimate and implementation owner.",
          createdAt: "2026-04-19T09:15:00.000Z",
        },
      ],
      links: [
        {
          label: "Open contact",
          href: crmRecordHref(workspaceSlug, "people", "ppl_441"),
        },
      ],
    },
    "thread-email-3": {
      threadId: "thread-email-3",
      recordTitle: "Atlas Studio Annual",
      recordSubtitle: "Deal · Closed won",
      owner: "Nora Kim",
      priority: "low",
      fields: [
        { label: "Contract value", value: "$36,000" },
        { label: "Billing cadence", value: "Annual" },
        { label: "Go-live", value: "2026-05-05" },
      ],
      timeline: [
        {
          id: "ctx-6",
          title: "PO received",
          detail: "Purchase order attached by client via email.",
          createdAt: "2026-04-17T16:21:00.000Z",
        },
      ],
      links: [
        {
          label: "Open deal",
          href: crmRecordHref(workspaceSlug, "deals", "deal_211"),
        },
      ],
    },
    "thread-whatsapp-3": null,
  };
}

export function createInboxMockState(workspaceSlug: string): InboxMockState {
  return {
    integrations: {
      emailConnected: true,
      whatsappConnected: true,
    },
    threads: seedThreads(workspaceSlug),
    messagesByThreadId: seedMessages(),
    crmContextByThreadId: seedCrmContexts(workspaceSlug),
  };
}
