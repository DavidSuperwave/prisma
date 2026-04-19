-- Workspace integrations vault: per-workspace 3rd-party connectors and
-- encrypted credentials. Used by lib/agentTools/tools/integrations.ts and
-- lib/agentTools/tools/cms.ts.

create table if not exists public.workspace_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null,
  label text not null,
  provider text not null,
  auth_type text not null default 'api_key' check (auth_type in ('api_key', 'bearer', 'oauth', 'mcp', 'hmac')),
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists idx_workspace_integrations_workspace
  on public.workspace_integrations (workspace_id);

drop trigger if exists trg_workspace_integrations_updated_at on public.workspace_integrations;
create trigger trg_workspace_integrations_updated_at
before update on public.workspace_integrations
for each row execute function public.set_updated_at();

-- Encrypted per-key secret values. ciphertext/iv/tag are base64.
create table if not exists public.workspace_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.workspace_integrations(id) on delete cascade,
  key_name text not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, key_name)
);

drop trigger if exists trg_workspace_integration_secrets_updated_at
  on public.workspace_integration_secrets;
create trigger trg_workspace_integration_secrets_updated_at
before update on public.workspace_integration_secrets
for each row execute function public.set_updated_at();

alter table public.workspace_integrations enable row level security;
alter table public.workspace_integration_secrets enable row level security;

drop policy if exists workspace_integrations_select on public.workspace_integrations;
create policy workspace_integrations_select on public.workspace_integrations
for select using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_integrations_insert on public.workspace_integrations;
create policy workspace_integrations_insert on public.workspace_integrations
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_integrations_update on public.workspace_integrations;
create policy workspace_integrations_update on public.workspace_integrations
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_integrations_delete on public.workspace_integrations;
create policy workspace_integrations_delete on public.workspace_integrations
for delete using (public.is_workspace_member(workspace_id));

-- Secrets: client/anon reads forbidden. Only service_role reads plaintext;
-- API routes decrypt server-side.
drop policy if exists workspace_integration_secrets_noread on public.workspace_integration_secrets;
create policy workspace_integration_secrets_noread on public.workspace_integration_secrets
for select using (false);

-- Outbound audit log for Part 3 (cms.push_inventory et al)
create table if not exists public.workspace_outbound_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id uuid references public.workspace_integrations(id) on delete set null,
  kind text not null,
  target_url text,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  ok boolean not null default false,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_outbound_events_workspace_created
  on public.workspace_outbound_events (workspace_id, created_at desc);

alter table public.workspace_outbound_events enable row level security;

drop policy if exists workspace_outbound_events_select on public.workspace_outbound_events;
create policy workspace_outbound_events_select on public.workspace_outbound_events
for select using (public.is_workspace_member(workspace_id));
