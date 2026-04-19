-- M11 templates: reusable email/SMS/WhatsApp templates with merge tags.

create table if not exists public.workspace_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('email','sms','whatsapp')),
  subject text,
  body text not null default '',
  variables jsonb not null default '[]'::jsonb,
  is_shared boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name, channel)
);

create index if not exists idx_workspace_templates_workspace
  on public.workspace_templates (workspace_id, channel, updated_at desc);

drop trigger if exists set_workspace_templates_updated_at on public.workspace_templates;
create trigger set_workspace_templates_updated_at
before update on public.workspace_templates
for each row execute procedure public.set_updated_at();

alter table public.workspace_templates enable row level security;

drop policy if exists workspace_templates_all on public.workspace_templates;
create policy workspace_templates_all on public.workspace_templates
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
