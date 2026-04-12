-- M1 isolation seed
-- Replace USER_A_ID and USER_B_ID with real auth.users IDs before running.

begin;

-- Example user IDs:
-- \set USER_A_ID '11111111-1111-1111-1111-111111111111'
-- \set USER_B_ID '22222222-2222-2222-2222-222222222222'

insert into public.workspaces (id, name, subdomain, created_at, updated_at)
values
  ('a1111111-1111-1111-1111-111111111111', 'Workspace A', 'workspace-a', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', 'Workspace B', 'workspace-b', now(), now())
on conflict (id) do update
set
  name = excluded.name,
  subdomain = excluded.subdomain,
  updated_at = now();

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('a1111111-1111-1111-1111-111111111111', :'USER_A_ID', 'admin'),
  ('b2222222-2222-2222-2222-222222222222', :'USER_B_ID', 'admin')
on conflict (workspace_id, user_id) do update
set role = excluded.role;

insert into public.workspace_objects (id, workspace_id, name, singular_name, plural_name, description)
values
  ('a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'Companies', 'Company', 'Companies', 'Workspace A companies'),
  ('b4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'Companies', 'Company', 'Companies', 'Workspace B companies')
on conflict (id) do update
set
  name = excluded.name,
  singular_name = excluded.singular_name,
  plural_name = excluded.plural_name,
  description = excluded.description,
  updated_at = now();

insert into public.workspace_fields (id, workspace_id, object_id, name, key, type, required, sort_order)
values
  ('a5555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'Name', 'name', 'text', true, 1),
  ('b6666666-6666-6666-6666-666666666666', 'b2222222-2222-2222-2222-222222222222', 'b4444444-4444-4444-4444-444444444444', 'Name', 'name', 'text', true, 1)
on conflict (id) do update
set
  name = excluded.name,
  key = excluded.key,
  type = excluded.type,
  required = excluded.required,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.records (id, workspace_id, object_id, data)
values
  ('a7777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', '{"name":"A Corp"}'::jsonb),
  ('b8888888-8888-8888-8888-888888888888', 'b2222222-2222-2222-2222-222222222222', 'b4444444-4444-4444-4444-444444444444', '{"name":"B Corp"}'::jsonb)
on conflict (id) do update
set
  data = excluded.data,
  updated_at = now();

commit;
