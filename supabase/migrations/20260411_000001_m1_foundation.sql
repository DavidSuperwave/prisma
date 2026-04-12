-- Prisma M1 foundation schema
-- Creates meta-model and agent registry tables for workspace-scoped operations.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain text not null unique,
  logo_url text,
  primary_color text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspaces
  add column if not exists subdomain text,
  add column if not exists logo_url text,
  add column if not exists primary_color text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists idx_workspaces_subdomain_unique
  on public.workspaces (subdomain)
  where subdomain is not null;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.workspace_objects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  singular_name text,
  plural_name text,
  description text,
  icon text,
  default_status_field_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  name text not null,
  key text not null,
  type text not null check (type in ('text', 'number', 'currency', 'date', 'boolean', 'select', 'relation', 'file', 'status')),
  required boolean not null default false,
  options jsonb not null default '{}'::jsonb,
  default_value text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (object_id, key)
);

create table if not exists public.workspace_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  sort_by text,
  sort_order text check (sort_order in ('asc', 'desc')),
  columns text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('copilot', 'channel', 'worker')),
  description text,
  avatar_url text,
  container_name text not null,
  api_endpoint text not null,
  api_key text not null,
  hermes_version text not null default 'v2026.4.1',
  status text not null default 'active' check (status in ('active', 'paused', 'deploying', 'error')),
  soul_md text,
  skills text[] not null default '{}',
  knowledge_scope jsonb not null default '{}'::jsonb,
  cron_jobs jsonb not null default '[]'::jsonb,
  channel_config jsonb not null default '{}'::jsonb,
  memory_limit_mb integer not null default 512,
  cpu_limit numeric(4, 2) not null default 0.5,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, container_name)
);

create table if not exists public.agent_activity (
  id bigserial primary key,
  agent_id uuid not null references public.workspace_agents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_events (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_agent_id uuid references public.workspace_agents(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_workspace_user
  on public.workspace_members (workspace_id, user_id);

create index if not exists idx_workspace_objects_workspace
  on public.workspace_objects (workspace_id, created_at desc);

create index if not exists idx_workspace_fields_object
  on public.workspace_fields (workspace_id, object_id, sort_order);

create index if not exists idx_workspace_views_workspace_object
  on public.workspace_views (workspace_id, object_id, created_at desc);

create index if not exists idx_records_workspace_object
  on public.records (workspace_id, object_id, updated_at desc);

create index if not exists idx_workspace_agents_workspace
  on public.workspace_agents (workspace_id, status, created_at desc);

create index if not exists idx_agent_activity_workspace
  on public.agent_activity (workspace_id, created_at desc);

create index if not exists idx_agent_events_workspace_type
  on public.agent_events (workspace_id, event_type, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_objects_default_status_field_fk'
  ) then
    alter table public.workspace_objects
      add constraint workspace_objects_default_status_field_fk
      foreign key (default_status_field_id) references public.workspace_fields(id) on delete set null;
  end if;
end
$$;

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_members_updated_at on public.workspace_members;
create trigger set_workspace_members_updated_at
before update on public.workspace_members
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_objects_updated_at on public.workspace_objects;
create trigger set_workspace_objects_updated_at
before update on public.workspace_objects
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_fields_updated_at on public.workspace_fields;
create trigger set_workspace_fields_updated_at
before update on public.workspace_fields
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_views_updated_at on public.workspace_views;
create trigger set_workspace_views_updated_at
before update on public.workspace_views
for each row execute procedure public.set_updated_at();

drop trigger if exists set_records_updated_at on public.records;
create trigger set_records_updated_at
before update on public.records
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_agents_updated_at on public.workspace_agents;
create trigger set_workspace_agents_updated_at
before update on public.workspace_agents
for each row execute procedure public.set_updated_at();
