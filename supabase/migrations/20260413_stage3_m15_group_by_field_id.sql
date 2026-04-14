-- Stage 3 M15: board/kanban grouping support on views

alter table public.workspace_views
  add column if not exists group_by_field_id uuid references public.workspace_fields(id) on delete set null;

create index if not exists idx_workspace_views_group_by_field
  on public.workspace_views (workspace_id, object_id, group_by_field_id);
