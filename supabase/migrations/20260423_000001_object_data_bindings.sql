-- Object <-> data-source bindings.
--
-- A binding says "this workspace object is sourced from / pushed to this
-- integration, using this mapping and cadence." The agent creates these
-- from chat (bindings.create) and the scheduler honors `mode='scheduled'`
-- rows on every cron tick.
--
-- Invariant: there is ONE place the agent stores "how workspace object X
-- connects to external source Y." The bindings row. No per-object tool code
-- is required to add new providers once the provider adapter exists.

create table if not exists public.workspace_object_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  integration_id uuid not null references public.workspace_integrations(id) on delete cascade,
  recipe_id uuid references public.workspace_integration_recipes(id) on delete set null,
  label text not null,
  direction text not null check (direction in ('pull','push','two_way')),
  mode text not null check (mode in ('manual','on_demand','scheduled')),
  cadence text,
  mapping jsonb not null default '{}'::jsonb,
  match_key text,
  status text not null default 'active' check (status in ('active','paused','error')),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_agent_id uuid references public.workspace_agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_object_bindings_workspace
  on public.workspace_object_bindings (workspace_id, object_id);

create index if not exists idx_workspace_object_bindings_scheduled
  on public.workspace_object_bindings (workspace_id, mode, status)
  where mode = 'scheduled';

create index if not exists idx_workspace_object_bindings_integration
  on public.workspace_object_bindings (integration_id);

drop trigger if exists trg_workspace_object_bindings_updated_at
  on public.workspace_object_bindings;
create trigger trg_workspace_object_bindings_updated_at
before update on public.workspace_object_bindings
for each row execute function public.set_updated_at();

alter table public.workspace_object_bindings enable row level security;

drop policy if exists workspace_object_bindings_select
  on public.workspace_object_bindings;
create policy workspace_object_bindings_select
  on public.workspace_object_bindings
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_object_bindings_insert
  on public.workspace_object_bindings;
create policy workspace_object_bindings_insert
  on public.workspace_object_bindings
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_object_bindings_update
  on public.workspace_object_bindings;
create policy workspace_object_bindings_update
  on public.workspace_object_bindings
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_object_bindings_delete
  on public.workspace_object_bindings;
create policy workspace_object_bindings_delete
  on public.workspace_object_bindings
  for delete using (public.is_workspace_member(workspace_id));
