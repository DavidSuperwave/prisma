// Canonical column lists for CRM / inbox tables. Use these instead of
// `select('*')` so the wire payload is explicit, smaller, and stable when
// columns are added to the physical schema later.
//
// Values are declared as literal strings with `as const` so that the Supabase
// JS client can infer the returned row shape from `select(COLUMNS)`.

export const LEADS_COLUMNS =
  "id, workspace_id, manychat_subscriber_id, first_name, last_name, phone, email, channel, pipeline_stage, opportunity_value, assigned_agent, metadata, created_at, updated_at" as const;

export const CRM_CONVERSATIONS_COLUMNS =
  "id, workspace_id, lead_id, channel, status, last_inbound_at, last_outbound_at, metadata, created_at, updated_at" as const;

export const CRM_MESSAGES_COLUMNS =
  "id, workspace_id, conversation_id, direction, sender_type, content, manychat_message_id, metadata, created_at" as const;

export const CRM_REPLIES_COLUMNS =
  "id, workspace_id, conversation_id, message_id, agent_id, agent_draft, operator_edit, final_text, status, approved_by, approved_at, sent_at, error, metadata, created_at, updated_at" as const;
