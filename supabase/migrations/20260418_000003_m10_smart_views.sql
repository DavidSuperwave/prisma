-- M10 Smart Views: extend workspace_views with filter DSL + scope + saved column set.

alter table public.workspace_views
  add column if not exists scope text not null default 'private'
    check (scope in ('private', 'team', 'org')),
  add column if not exists filter_dsl jsonb not null default '{}'::jsonb,
  add column if not exists sort_config jsonb not null default '[]'::jsonb,
  add column if not exists column_config jsonb not null default '[]'::jsonb,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists view_mode text not null default 'table'
    check (view_mode in ('table', 'board', 'kpi', 'pipeline')),
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_workspace_views_scope
  on public.workspace_views (workspace_id, scope, is_pinned);
