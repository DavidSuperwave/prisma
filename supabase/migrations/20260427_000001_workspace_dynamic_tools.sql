-- Dynamic tool definitions and execution audit for operator agents

create table if not exists public.workspace_dynamic_tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.workspace_agents(id) on delete set null,
  name text not null,
  description text not null default '',
  args_schema jsonb not null default '{}'::jsonb,
  implementation jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled')),
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists idx_workspace_dynamic_tools_lookup
  on public.workspace_dynamic_tools (workspace_id, status, updated_at desc);

create index if not exists idx_workspace_dynamic_tools_agent
  on public.workspace_dynamic_tools (workspace_id, agent_id, status);

create table if not exists public.workspace_dynamic_tool_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_id uuid not null references public.workspace_dynamic_tools(id) on delete cascade,
  agent_id uuid,
  args jsonb,
  result jsonb,
  ok boolean not null default false,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_dynamic_tool_runs_tool
  on public.workspace_dynamic_tool_runs (workspace_id, tool_id, created_at desc);

drop trigger if exists trg_workspace_dynamic_tools_updated_at on public.workspace_dynamic_tools;
create trigger trg_workspace_dynamic_tools_updated_at
  before update on public.workspace_dynamic_tools
  for each row execute function public.set_updated_at();

alter table public.workspace_dynamic_tools enable row level security;
alter table public.workspace_dynamic_tool_runs enable row level security;

drop policy if exists workspace_dynamic_tools_all on public.workspace_dynamic_tools;
create policy workspace_dynamic_tools_all
  on public.workspace_dynamic_tools
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_dynamic_tool_runs_all on public.workspace_dynamic_tool_runs;
create policy workspace_dynamic_tool_runs_all
  on public.workspace_dynamic_tool_runs
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
