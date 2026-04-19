-- M8b: extend workspace_tasks for CRM usage (due/reminder/assignment + record pointer).

alter table public.workspace_tasks
  add column if not exists record_id uuid references public.records(id) on delete set null,
  add column if not exists reminder_at timestamptz,
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_workspace_tasks_record
  on public.workspace_tasks (workspace_id, record_id, due_at);

create index if not exists idx_workspace_tasks_assigned_to
  on public.workspace_tasks (workspace_id, assigned_to_user_id, status, due_at);
