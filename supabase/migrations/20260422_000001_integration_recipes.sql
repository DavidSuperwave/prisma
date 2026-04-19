-- Integration recipes: agent-curated memory of "how to call this API".
-- When the agent successfully probes an endpoint, it saves a templated
-- request here so it (and future sessions) can replay it by slug.
--
-- Paired with workspace_workflows trigger.type = 'cron' so the agent can
-- author scheduled jobs that run saved recipes.

create table if not exists public.workspace_integration_recipes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid not null references public.workspace_integrations(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  method text not null default 'GET' check (method in ('GET','POST','PUT','PATCH','DELETE')),
  path_template text not null,
  query_template jsonb not null default '{}'::jsonb,
  body_template jsonb,
  headers_template jsonb not null default '{}'::jsonb,
  sample_response jsonb,
  success_count integer not null default 0,
  last_used_at timestamptz,
  created_by_agent_id uuid references public.workspace_agents(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, integration_id, slug)
);

create index if not exists idx_workspace_integration_recipes_workspace
  on public.workspace_integration_recipes (workspace_id, integration_id);

create index if not exists idx_workspace_integration_recipes_slug
  on public.workspace_integration_recipes (workspace_id, slug);

drop trigger if exists trg_workspace_integration_recipes_updated_at
  on public.workspace_integration_recipes;
create trigger trg_workspace_integration_recipes_updated_at
before update on public.workspace_integration_recipes
for each row execute function public.set_updated_at();

alter table public.workspace_integration_recipes enable row level security;

drop policy if exists workspace_integration_recipes_select
  on public.workspace_integration_recipes;
create policy workspace_integration_recipes_select
  on public.workspace_integration_recipes
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_integration_recipes_insert
  on public.workspace_integration_recipes;
create policy workspace_integration_recipes_insert
  on public.workspace_integration_recipes
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_integration_recipes_update
  on public.workspace_integration_recipes;
create policy workspace_integration_recipes_update
  on public.workspace_integration_recipes
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_integration_recipes_delete
  on public.workspace_integration_recipes;
create policy workspace_integration_recipes_delete
  on public.workspace_integration_recipes
  for delete using (public.is_workspace_member(workspace_id));

-- Cron bookkeeping for agent-authored workflows. last_run_at prevents the
-- 5-minute workflow-tick from double-firing a cron workflow within the same
-- tick window.
alter table public.workspace_workflows
  add column if not exists last_run_at timestamptz;

create index if not exists idx_workspace_workflows_cron
  on public.workspace_workflows (workspace_id, enabled, last_run_at)
  where (trigger ->> 'type') = 'cron';
