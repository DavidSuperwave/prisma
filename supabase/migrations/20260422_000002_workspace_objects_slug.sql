-- Adds a stable `slug` column to workspace_objects so the agent can reference
-- datasets by a rename-proof identifier in addition to `id` and `name`.
--
-- Slugs are derived from the initial object name (lowercased, diacritics
-- stripped, non-alphanumerics collapsed to `-`), but once created they are
-- preserved across renames — the application layer does NOT rewrite the slug
-- when `name` changes. Users can still change the slug manually via an admin
-- API, but the default behavior is "sticky slug".

alter table public.workspace_objects
  add column if not exists slug text;

-- Helper: derive a candidate slug from the existing name. Keep this in SQL so
-- the backfill is deterministic and doesn't depend on extensions like
-- `unaccent` being available. We do a best-effort diacritic strip via
-- substring substitutions for the common Spanish characters in this repo.
create or replace function public.pg_temp.prisma_slugify_object_name(input text)
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
              'AAAAAAAEEEEEIIIIIOOOOOOUUUUUNCaaaaaaaeeeeeiiiiiooooooυuuuunc'
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

-- Backfill existing rows. For each workspace, generate a slug from `name`
-- and suffix duplicates with -2, -3, ...
with numbered as (
  select
    id,
    workspace_id,
    pg_temp.prisma_slugify_object_name(name) as base_slug,
    row_number() over (
      partition by workspace_id, pg_temp.prisma_slugify_object_name(name)
      order by created_at asc, id asc
    ) as rn
  from public.workspace_objects
  where slug is null or slug = ''
)
update public.workspace_objects o
set slug = case
    when n.base_slug is null then 'objeto-' || substr(o.id::text, 1, 8)
    when n.rn = 1 then n.base_slug
    else n.base_slug || '-' || n.rn::text
  end
from numbered n
where o.id = n.id;

-- Anything left with a null slug (e.g. empty name) gets an id-derived fallback.
update public.workspace_objects
set slug = 'objeto-' || substr(id::text, 1, 8)
where slug is null or slug = '';

alter table public.workspace_objects
  alter column slug set not null;

-- Unique per workspace.
create unique index if not exists idx_workspace_objects_workspace_slug_unique
  on public.workspace_objects (workspace_id, slug);

comment on column public.workspace_objects.slug is
  'Stable per-workspace identifier. Set at creation from the object name and preserved across renames so agents and APIs can address the object by a rename-proof reference.';
