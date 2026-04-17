-- Stage 5: server-side conversations, transcript persistence, and readiness metadata

create table if not exists public.workspace_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.workspace_agents(id) on delete cascade,
  title text not null default 'Nuevo chat',
  source text not null default 'workspace_chat',
  runtime_conversation_id text not null,
  channel_type text,
  channel_identity text,
  metadata jsonb not null default '{}'::jsonb,
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, runtime_conversation_id)
);

create index if not exists idx_workspace_conversations_workspace_agent
  on public.workspace_conversations (workspace_id, agent_id, updated_at desc);

create index if not exists idx_workspace_conversations_workspace_source
  on public.workspace_conversations (workspace_id, source, updated_at desc);

create table if not exists public.workspace_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.workspace_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.workspace_agents(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_conversation_messages_conversation
  on public.workspace_conversation_messages (conversation_id, created_at asc);

create index if not exists idx_workspace_conversation_messages_workspace
  on public.workspace_conversation_messages (workspace_id, created_at desc);

create or replace function public.sync_workspace_conversation_after_message()
returns trigger
language plpgsql
as $$
begin
  update public.workspace_conversations
  set
    message_count = coalesce(message_count, 0) + 1,
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists sync_workspace_conversation_after_message on public.workspace_conversation_messages;
create trigger sync_workspace_conversation_after_message
after insert on public.workspace_conversation_messages
for each row execute procedure public.sync_workspace_conversation_after_message();

drop trigger if exists set_workspace_conversations_updated_at on public.workspace_conversations;
create trigger set_workspace_conversations_updated_at
before update on public.workspace_conversations
for each row execute procedure public.set_updated_at();

alter table public.workspace_conversations enable row level security;
alter table public.workspace_conversation_messages enable row level security;

drop policy if exists workspace_conversations_all on public.workspace_conversations;
create policy workspace_conversations_all on public.workspace_conversations
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_conversation_messages_all on public.workspace_conversation_messages;
create policy workspace_conversation_messages_all on public.workspace_conversation_messages
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

