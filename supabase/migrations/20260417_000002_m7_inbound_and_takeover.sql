-- M7 inbound webhook token + human takeover flag
alter table public.workspaces
  add column if not exists inbound_token text;

update public.workspaces
set inbound_token = encode(gen_random_bytes(16), 'hex')
where inbound_token is null;

create unique index if not exists idx_workspaces_inbound_token_unique
  on public.workspaces (inbound_token)
  where inbound_token is not null;

alter table public.workspace_conversations
  add column if not exists agent_paused boolean not null default false;

create index if not exists idx_workspace_conversations_agent_paused
  on public.workspace_conversations (workspace_id, agent_paused, updated_at desc);
