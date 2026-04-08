-- Prisma platform multi-tenant schema foundation.
-- This keeps intake as the entry point but maps it to workspace/project/site.

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

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('owner', 'admin', 'operator', 'viewer', 'client');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('draft', 'onboarding', 'active', 'paused', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'intake_lifecycle_status') then
    create type public.intake_lifecycle_status as enum ('submitted', 'paid', 'reviewing', 'ready_to_publish', 'published');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'agent_role_type') then
    create type public.agent_role_type as enum (
      'intake_assistant',
      'lead_qualifier',
      'crm_updater',
      'follow_up',
      'ops_assistant',
      'custom'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'agent_deployment_status') then
    create type public.agent_deployment_status as enum ('pending', 'building', 'running', 'degraded', 'stopped', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'site_publish_status') then
    create type public.site_publish_status as enum ('draft', 'reviewing', 'ready', 'published', 'archived');
  end if;
end
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  owner_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status public.project_status not null default 'draft',
  industry text,
  primary_color text,
  intake_submission_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landing_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  vertical text,
  schema_version integer not null default 1,
  section_schema jsonb not null default '[]'::jsonb,
  default_content jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landing_sites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  template_id uuid not null references public.landing_templates(id),
  name text not null,
  subdomain text not null unique,
  custom_domain text,
  publish_status public.site_publish_status not null default 'draft',
  theme_config jsonb not null default '{}'::jsonb,
  seo_config jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_submissions (
  id text primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  lifecycle_status public.intake_lifecycle_status not null default 'submitted',
  payment_status public.payment_status not null default 'pending',
  business_name text not null,
  contact_name text not null,
  contact_email text not null,
  whatsapp_number text not null,
  website_url text,
  industry text not null,
  primary_color text,
  service_description text not null,
  tone_guidance text,
  notes text,
  social_links jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  submitted_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  website text,
  industry text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.crm_companies(id) on delete set null,
  source_intake_id text references public.intake_submissions(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  whatsapp_number text,
  role_title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  company_id uuid references public.crm_companies(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  title text not null,
  stage text not null default 'new',
  priority text not null default 'normal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  role public.agent_role_type not null default 'custom',
  model text not null,
  prompt_pack jsonb not null default '{}'::jsonb,
  tools_config jsonb not null default '{}'::jsonb,
  integration_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_definition_id uuid not null references public.agent_definitions(id) on delete cascade,
  droplet_host text not null,
  container_name text not null,
  image_ref text not null,
  env_secret_ref text,
  deployment_version integer not null default 1,
  status public.agent_deployment_status not null default 'pending',
  health_details jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, container_name)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null,
  event_name text not null,
  event_value numeric(18, 6),
  event_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  intake_submission_id text references public.intake_submissions(id) on delete set null,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null default 0,
  bucket text not null default 'intake-assets',
  storage_path text not null,
  public_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  intake_submission_id text references public.intake_submissions(id) on delete set null,
  job_type text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_memberships_workspace_user_idx
  on public.workspace_memberships (workspace_id, user_id);

create index if not exists projects_workspace_id_idx
  on public.projects (workspace_id);

create index if not exists landing_sites_workspace_publish_idx
  on public.landing_sites (workspace_id, publish_status);

create index if not exists intake_submissions_workspace_status_idx
  on public.intake_submissions (workspace_id, lifecycle_status, payment_status);

create index if not exists crm_contacts_workspace_idx
  on public.crm_contacts (workspace_id);

create index if not exists crm_cases_workspace_stage_idx
  on public.crm_cases (workspace_id, stage);

create index if not exists agent_definitions_workspace_idx
  on public.agent_definitions (workspace_id);

create index if not exists agent_deployments_workspace_status_idx
  on public.agent_deployments (workspace_id, status);

create index if not exists usage_events_workspace_name_idx
  on public.usage_events (workspace_id, event_name, created_at desc);

create index if not exists provisioning_jobs_workspace_status_idx
  on public.provisioning_jobs (workspace_id, status, created_at desc);

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_memberships_updated_at on public.workspace_memberships;
create trigger set_workspace_memberships_updated_at
before update on public.workspace_memberships
for each row execute procedure public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();

drop trigger if exists set_landing_templates_updated_at on public.landing_templates;
create trigger set_landing_templates_updated_at
before update on public.landing_templates
for each row execute procedure public.set_updated_at();

drop trigger if exists set_landing_sites_updated_at on public.landing_sites;
create trigger set_landing_sites_updated_at
before update on public.landing_sites
for each row execute procedure public.set_updated_at();

drop trigger if exists set_intake_submissions_updated_at on public.intake_submissions;
create trigger set_intake_submissions_updated_at
before update on public.intake_submissions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_crm_companies_updated_at on public.crm_companies;
create trigger set_crm_companies_updated_at
before update on public.crm_companies
for each row execute procedure public.set_updated_at();

drop trigger if exists set_crm_contacts_updated_at on public.crm_contacts;
create trigger set_crm_contacts_updated_at
before update on public.crm_contacts
for each row execute procedure public.set_updated_at();

drop trigger if exists set_crm_cases_updated_at on public.crm_cases;
create trigger set_crm_cases_updated_at
before update on public.crm_cases
for each row execute procedure public.set_updated_at();

drop trigger if exists set_agent_definitions_updated_at on public.agent_definitions;
create trigger set_agent_definitions_updated_at
before update on public.agent_definitions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_agent_deployments_updated_at on public.agent_deployments;
create trigger set_agent_deployments_updated_at
before update on public.agent_deployments
for each row execute procedure public.set_updated_at();

drop trigger if exists set_assets_updated_at on public.assets;
create trigger set_assets_updated_at
before update on public.assets
for each row execute procedure public.set_updated_at();

drop trigger if exists set_provisioning_jobs_updated_at on public.provisioning_jobs;
create trigger set_provisioning_jobs_updated_at
before update on public.provisioning_jobs
for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('intake-assets', 'intake-assets', true)
on conflict (id) do nothing;

-- RLS should be enabled in production and scoped by workspace_id.
-- Example policy pattern:
--   auth.uid() in workspace_memberships for the target workspace.
