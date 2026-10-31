-- Align hosted workspaces with the current Prisma app/runtime expectations.
--
-- Some environments were provisioned before object slugs landed, while the
-- current agent tools and workspace routes now address objects by stable slug.
-- This migration is intentionally idempotent so it can repair those databases
-- even if the original 20260422 slug migration was skipped.

alter table public.workspace_objects
  add column if not exists slug text;

create or replace function public.prisma_slugify_object_name(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      both '-' from
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              coalesce(input, ''),
              'ÁÀÂÄÃÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÖÕŌÚÙÛÜŪÑÇáàâäãåāéèêëēíìîïīóòôöõōúùûüūñç',
              'AAAAAAAEEEEEIIIIIOOOOOOUUUUUNCaaaaaaaeeeeeiiiiioooooouuuuunc'
            )
          ),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-+', '-', 'g'
      )
    ),
    ''
  );
$$;

with numbered as (
  select
    id,
    workspace_id,
    public.prisma_slugify_object_name(name) as base_slug,
    row_number() over (
      partition by workspace_id, public.prisma_slugify_object_name(name)
      order by created_at asc, id asc
    ) as rn
  from public.workspace_objects
  where slug is null or slug = ''
)
update public.workspace_objects o
set slug = case
    when n.base_slug is null then 'object-' || substr(o.id::text, 1, 8)
    when n.rn = 1 then n.base_slug
    else n.base_slug || '-' || n.rn::text
  end
from numbered n
where o.id = n.id;

update public.workspace_objects
set slug = 'object-' || substr(id::text, 1, 8)
where slug is null or slug = '';

alter table public.workspace_objects
  alter column slug set not null;

create unique index if not exists idx_workspace_objects_workspace_slug_unique
  on public.workspace_objects (workspace_id, slug);

comment on column public.workspace_objects.slug is
  'Stable per-workspace identifier used by agents and APIs to address objects safely across renames.';

alter table public.workspace_agents
  alter column hermes_version set default 'v2026.4.30';

update public.workspace_agents
set hermes_version = 'v2026.4.30',
    updated_at = now()
where hermes_version = 'v2026.4.1';
