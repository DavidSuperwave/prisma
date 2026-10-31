-- Platform admin surfaces: projects, landing templates, and landing sites.
-- These tables were previously falling back to local platform-state.json.

create table if not exists public.projects (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'onboarding', 'active', 'paused', 'archived')),
  industry text,
  primary_color text,
  intake_submission_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_workspace
  on public.projects (workspace_id, created_at desc);

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create table if not exists public.landing_templates (
  id text primary key,
  key text not null unique,
  name text not null,
  vertical text,
  section_schema jsonb not null default '[]'::jsonb,
  default_content jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_landing_templates_active
  on public.landing_templates (is_active, created_at desc);

drop trigger if exists trg_landing_templates_updated_at on public.landing_templates;
create trigger trg_landing_templates_updated_at
before update on public.landing_templates
for each row execute function public.set_updated_at();

create table if not exists public.landing_sites (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id text references public.projects(id) on delete set null,
  template_id text not null references public.landing_templates(id) on delete restrict,
  name text not null,
  subdomain text not null unique,
  publish_status text not null default 'draft'
    check (publish_status in ('draft', 'reviewing', 'ready', 'published', 'archived')),
  content jsonb not null default '{}'::jsonb,
  theme_config jsonb not null default '{}'::jsonb,
  seo_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_landing_sites_workspace
  on public.landing_sites (workspace_id, created_at desc);

create index if not exists idx_landing_sites_project
  on public.landing_sites (project_id)
  where project_id is not null;

drop trigger if exists trg_landing_sites_updated_at on public.landing_sites;
create trigger trg_landing_sites_updated_at
before update on public.landing_sites
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.landing_templates enable row level security;
alter table public.landing_sites enable row level security;

drop policy if exists projects_all on public.projects;
create policy projects_all on public.projects
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists landing_sites_all on public.landing_sites;
create policy landing_sites_all on public.landing_sites
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists landing_templates_authenticated_select on public.landing_templates;
create policy landing_templates_authenticated_select on public.landing_templates
for select using (auth.role() = 'authenticated');

insert into public.landing_templates (
  id,
  key,
  name,
  vertical,
  section_schema,
  default_content,
  is_active,
  created_at,
  updated_at
)
values
  (
    'tmpl_legal_base',
    'legal-base',
    'Legal Intake Base',
    'legal',
    '["hero","trust","services","faq","cta"]'::jsonb,
    '{"hero":{"title":"Tu firma legal con IA","subtitle":"Captura y califica casos 24/7"},"cta":{"label":"Comenzar intake"}}'::jsonb,
    true,
    '2026-04-17T10:17:09.065Z'::timestamptz,
    '2026-04-17T10:17:09.065Z'::timestamptz
  ),
  (
    'tmpl_finance_base',
    'finance-base',
    'Finance Conversion Base',
    'finance',
    '["hero","proof","services","insights","cta"]'::jsonb,
    '{"hero":{"title":"Acelera tu captacion con IA","subtitle":"Landing + agente + CRM en una sola base"},"cta":{"label":"Solicitar onboarding"}}'::jsonb,
    true,
    '2026-04-17T10:17:09.065Z'::timestamptz,
    '2026-04-17T10:17:09.065Z'::timestamptz
  )
on conflict (id) do update
set
  key = excluded.key,
  name = excluded.name,
  vertical = excluded.vertical,
  section_schema = excluded.section_schema,
  default_content = excluded.default_content,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;
