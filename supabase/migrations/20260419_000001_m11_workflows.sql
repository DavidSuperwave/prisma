-- M11 workflows: trigger + action engine for CRM automation.

create table if not exists public.workspace_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  enabled boolean not null default true,
  trigger jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_workflows_workspace
  on public.workspace_workflows (workspace_id, enabled, updated_at desc);

drop trigger if exists set_workspace_workflows_updated_at on public.workspace_workflows;
create trigger set_workspace_workflows_updated_at
before update on public.workspace_workflows
for each row execute procedure public.set_updated_at();

create table if not exists public.workspace_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workspace_workflows(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid references public.records(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  current_step integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_workflow_runs_status
  on public.workspace_workflow_runs (workspace_id, status, created_at desc);

drop trigger if exists set_workspace_workflow_runs_updated_at on public.workspace_workflow_runs;
create trigger set_workspace_workflow_runs_updated_at
before update on public.workspace_workflow_runs
for each row execute procedure public.set_updated_at();

alter table public.workspace_workflows enable row level security;
alter table public.workspace_workflow_runs enable row level security;

drop policy if exists workspace_workflows_all on public.workspace_workflows;
create policy workspace_workflows_all on public.workspace_workflows
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_workflow_runs_all on public.workspace_workflow_runs;
create policy workspace_workflow_runs_all on public.workspace_workflow_runs
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
