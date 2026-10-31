-- Hermes multi-agent persona and runtime correlation columns.

alter table if exists public.workspace_agents
  add column if not exists mcp_tools_include text[] not null default '{}',
  add column if not exists skills_scope text[] not null default '{}',
  add column if not exists model_overrides jsonb not null default '{}'::jsonb;

create index if not exists idx_workspace_agents_mcp_tools_include
  on public.workspace_agents using gin (mcp_tools_include);

create index if not exists idx_workspace_agents_skills_scope
  on public.workspace_agents using gin (skills_scope);

alter table if exists public.workspace_conversation_messages
  add column if not exists runtime_session_id text;

create index if not exists idx_workspace_conversation_messages_runtime_session
  on public.workspace_conversation_messages (runtime_session_id);
