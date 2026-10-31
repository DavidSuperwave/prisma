create table if not exists public.workspace_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null,
  label text not null,
  provider text not null default 'custom',
  auth_type text not null default 'api_key' check (auth_type in ('api_key', 'bearer', 'oauth', 'mcp', 'hmac', 'webhook', 'none')),
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  mode text not null default 'http_poll' check (mode in ('http_poll', 'webhook_inbound', 'mcp_server', 'manual')),
  base_url text,
  webhook_path text,
  webhook_token text,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.workspace_connection_secrets (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.workspace_connections(id) on delete cascade,
  key_name text not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, key_name)
);

create index if not exists idx_workspace_connections_workspace
  on public.workspace_connections (workspace_id, status, updated_at desc);

create index if not exists idx_workspace_connections_webhook
  on public.workspace_connections (workspace_id, webhook_path);

drop trigger if exists trg_workspace_connections_updated_at on public.workspace_connections;
create trigger trg_workspace_connections_updated_at
before update on public.workspace_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_workspace_connection_secrets_updated_at on public.workspace_connection_secrets;
create trigger trg_workspace_connection_secrets_updated_at
before update on public.workspace_connection_secrets
for each row execute function public.set_updated_at();

alter table public.workspace_connections enable row level security;
alter table public.workspace_connection_secrets enable row level security;

drop policy if exists workspace_connections_all on public.workspace_connections;
create policy workspace_connections_all
  on public.workspace_connections
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_connection_secrets_select on public.workspace_connection_secrets;
create policy workspace_connection_secrets_select
  on public.workspace_connection_secrets
  for select using (
    exists (
      select 1
      from public.workspace_connections connections
      where connections.id = workspace_connection_secrets.connection_id
        and public.is_workspace_member(connections.workspace_id)
    )
  );

drop policy if exists workspace_connection_secrets_insert on public.workspace_connection_secrets;
create policy workspace_connection_secrets_insert
  on public.workspace_connection_secrets
  for insert with check (
    exists (
      select 1
      from public.workspace_connections connections
      where connections.id = workspace_connection_secrets.connection_id
        and public.is_workspace_member(connections.workspace_id)
    )
  );

drop policy if exists workspace_connection_secrets_update on public.workspace_connection_secrets;
create policy workspace_connection_secrets_update
  on public.workspace_connection_secrets
  for update using (
    exists (
      select 1
      from public.workspace_connections connections
      where connections.id = workspace_connection_secrets.connection_id
        and public.is_workspace_member(connections.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_connections connections
      where connections.id = workspace_connection_secrets.connection_id
        and public.is_workspace_member(connections.workspace_id)
    )
  );

drop policy if exists workspace_connection_secrets_delete on public.workspace_connection_secrets;
create policy workspace_connection_secrets_delete
  on public.workspace_connection_secrets
  for delete using (
    exists (
      select 1
      from public.workspace_connections connections
      where connections.id = workspace_connection_secrets.connection_id
        and public.is_workspace_member(connections.workspace_id)
    )
  );
