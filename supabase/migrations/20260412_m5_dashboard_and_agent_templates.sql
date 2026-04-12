-- M5 groundwork: dashboard cards and agent templates
create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null check (type in ('copilot', 'channel', 'worker', 'chatbot')),
  category text,
  default_soul_md text,
  default_skills text[] not null default '{}',
  default_knowledge_scope jsonb not null default '{}'::jsonb,
  default_cron_jobs jsonb not null default '[]'::jsonb,
  default_channel_config jsonb not null default '{}'::jsonb,
  default_memory_config jsonb not null default '{}'::jsonb,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_dashboard_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dashboard_id uuid,
  card_type text not null check (card_type in ('metric', 'table', 'queue', 'activity', 'status', 'chart')),
  title text not null,
  subtitle text,
  config jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  grid_width integer not null default 1,
  is_visible boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_templates_active
  on public.agent_templates (is_active, created_at desc);

create index if not exists idx_workspace_dashboard_cards_workspace
  on public.workspace_dashboard_cards (workspace_id, position asc);

drop trigger if exists set_agent_templates_updated_at on public.agent_templates;
create trigger set_agent_templates_updated_at
before update on public.agent_templates
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workspace_dashboard_cards_updated_at on public.workspace_dashboard_cards;
create trigger set_workspace_dashboard_cards_updated_at
before update on public.workspace_dashboard_cards
for each row execute procedure public.set_updated_at();
