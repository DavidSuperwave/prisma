export type InboxChannel = "email" | "whatsapp";

export type InboxQueue = "all" | "open" | "unread" | "assigned";

export type InboxThreadStatus = "open" | "pending" | "resolved";

export type InboxMessageDirection = "inbound" | "outbound" | "note";

export type InboxCrmEntity = "people" | "companies" | "deals";

export type InboxThread = {
  id: string;
  channel: InboxChannel;
  title: string;
  participantName: string;
  participantAddress: string;
  preview: string;
  unreadCount: number;
  lastMessageAt: string;
  status: InboxThreadStatus;
  assignee: string | null;
  tags: string[];
  crmLink: {
    entity: InboxCrmEntity;
    recordId: string;
    label: string;
    href: string;
  } | null;
};

export type InboxMessage = {
  id: string;
  threadId: string;
  direction: InboxMessageDirection;
  sender: string;
  body: string;
  createdAt: string;
};

export type InboxCrmContext = {
  threadId: string;
  recordTitle: string;
  recordSubtitle: string;
  owner: string;
  priority: "high" | "medium" | "low";
  fields: Array<{
    label: string;
    value: string;
  }>;
  timeline: Array<{
    id: string;
    title: string;
    detail: string;
    createdAt: string;
  }>;
  links: Array<{
    label: string;
    href: string;
  }>;
};

export type InboxIntegrationState = {
  emailConnected: boolean;
  whatsappConnected: boolean;
};

export type InboxMockState = {
  integrations: InboxIntegrationState;
  threads: InboxThread[];
  messagesByThreadId: Record<string, InboxMessage[]>;
  crmContextByThreadId: Record<string, InboxCrmContext | null>;
};
