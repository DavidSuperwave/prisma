-- Prisma M13 inbound leads + reply pipeline
-- Adds workspace-scoped tables for ManyChat-style inbound conversations:
--   leads, conversations, messages, replies, processed_webhooks
-- All tables are workspace_id-scoped with RLS mirroring the M1 foundation pattern.

create extension if not exists pgcrypto;

-- Leads: one row per external subscriber (ManyChat subscriber_id, etc.).
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  manychat_subscriber_id text,
  first_name text,
  last_name text,
  phone text,
  email text,
  channel text not null default 'unknown',
  pipeline_stage text not null default 'new_lead',
  opportunity_value integer, -- amount in cents; null means unset; must be >= 0
  assigned_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_opportunity_value_nonneg check (opportunity_value is null or opportunity_value >= 0)
);

-- manychat_subscriber_id must be unique within a workspace.
create unique index if not exists idx_leads_workspace_manychat_subscriber
  on public.leads (workspace_id, manychat_subscriber_id)
  where manychat_subscriber_id is not null;

create index if not exists idx_leads_workspace on public.leads (workspace_id);
create index if not exists idx_leads_phone on public.leads (workspace_id, phone);
create index if not exists idx_leads_pipeline_stage on public.leads (workspace_id, pipeline_stage);

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

-- Conversations: one thread per lead per channel.
create table if not exists public.crm_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null,
  status text not null default 'active', -- active | archived | closed
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_conversations_workspace on public.crm_conversations (workspace_id);
create index if not exists idx_crm_conversations_lead on public.crm_conversations (lead_id);
create index if not exists idx_crm_conversations_status on public.crm_conversations (workspace_id, status);

drop trigger if exists trg_crm_conversations_updated_at on public.crm_conversations;
create trigger trg_crm_conversations_updated_at
before update on public.crm_conversations
for each row execute function public.set_updated_at();

-- Messages: each inbound/outbound message on a conversation.
create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('client', 'agent', 'operator', 'system')),
  content text not null,
  manychat_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_messages_workspace on public.crm_messages (workspace_id);
create index if not exists idx_crm_messages_conversation on public.crm_messages (conversation_id);
create index if not exists idx_crm_messages_created on public.crm_messages (conversation_id, created_at desc);
create unique index if not exists idx_crm_messages_manychat_id
  on public.crm_messages (workspace_id, manychat_message_id)
  where manychat_message_id is not null;

-- Replies: lifecycle tracking for agent draft -> operator edit -> sent.
create table if not exists public.crm_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  message_id uuid references public.crm_messages(id) on delete set null,
  agent_id text,
  agent_draft text,
  operator_edit text,
  final_text text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent', 'failed', 'cancelled')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_replies_workspace on public.crm_replies (workspace_id);
create index if not exists idx_crm_replies_conversation on public.crm_replies (conversation_id);
create index if not exists idx_crm_replies_status on public.crm_replies (workspace_id, status);

drop trigger if exists trg_crm_replies_updated_at on public.crm_replies;
create trigger trg_crm_replies_updated_at
before update on public.crm_replies
for each row execute function public.set_updated_at();

-- Processed webhooks: idempotency key store.
create table if not exists public.processed_webhooks (
  idempotency_key text primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  source text not null, -- e.g. 'manychat'
  processed_at timestamptz not null default now()
);

create index if not exists idx_processed_webhooks_processed_at on public.processed_webhooks (processed_at);

-- RLS policies: mirror the M1 "is_workspace_member" pattern.
alter table public.leads enable row level security;
alter table public.crm_conversations enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_replies enable row level security;
alter table public.processed_webhooks enable row level security;

drop policy if exists leads_all on public.leads;
create policy leads_all on public.leads
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists crm_conversations_all on public.crm_conversations;
create policy crm_conversations_all on public.crm_conversations
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists crm_messages_all on public.crm_messages;
create policy crm_messages_all on public.crm_messages
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists crm_replies_all on public.crm_replies;
create policy crm_replies_all on public.crm_replies
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- processed_webhooks is written by the service role from the webhook handler
-- and only read by service role. No user-facing policy; service role bypasses RLS.
drop policy if exists processed_webhooks_noop on public.processed_webhooks;
create policy processed_webhooks_noop on public.processed_webhooks
for select using (false);

-- Helper: cleanup processed_webhooks older than 7 days. Call from cron.
create or replace function public.cleanup_processed_webhooks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.processed_webhooks
  where processed_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.cleanup_processed_webhooks() to service_role;
