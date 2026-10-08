-- Phase 3: one master menu per restaurant (spec §8). Branches override visibility and
-- availability without duplicating the menu. Text is per-language JSON {"en": "...", "ar": "..."};
-- i18n_meta records which translations are AI drafts awaiting review.
-- Menu rows are archived, never deleted (orders will snapshot them in Phase 5).

create or replace function private.is_i18n_text(p jsonb, p_required boolean default true)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_each(p) e where jsonb_typeof(e.value) <> 'string'
                                                      or e.key !~ '^[a-z]{2}(-[A-Z]{2})?$')
     and (not p_required or exists (select 1 from jsonb_each_text(p) e where btrim(e.value) <> ''));
$$;

-- Used in CHECK constraints, so writers need EXECUTE.
grant execute on function private.is_i18n_text(jsonb, boolean) to authenticated, service_role;

create or replace function private.guard_tenant_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.restaurant_id <> old.restaurant_id then
    raise exception 'restaurant cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  name jsonb not null check (private.is_i18n_text(name)),
  description jsonb not null default '{}' check (private.is_i18n_text(description, false)),
  i18n_meta jsonb not null default '{}',
  sort integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index menu_categories_restaurant_idx on public.menu_categories (restaurant_id, sort);

create type public.allergen as enum ('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
  'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs');
create type public.dietary_tag as enum ('vegetarian', 'vegan', 'halal', 'gluten_free', 'dairy_free', 'nut_free',
  'healthy', 'new', 'popular', 'chef_special');

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  category_id uuid not null,
  name jsonb not null check (private.is_i18n_text(name)),
  description jsonb not null default '{}' check (private.is_i18n_text(description, false)),
  i18n_meta jsonb not null default '{}',
  -- base price in the restaurant's currency, minor units (OMR has 3 decimals)
  price_minor bigint not null check (price_minor >= 0),
  calories integer check (calories between 0 and 20000),
  allergens public.allergen[] not null default '{}',
  dietary_tags public.dietary_tag[] not null default '{}',
  spice_level smallint not null default 0 check (spice_level between 0 and 3),
  sort integer not null default 0,
  is_available boolean not null default true,  -- temporarily sold out
  is_active boolean not null default true,     -- shown on the menu
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (category_id, restaurant_id) references public.menu_categories (id, restaurant_id)
);
create index menu_items_category_idx on public.menu_items (category_id, sort);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id);

create table public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  item_id uuid not null,
  name jsonb not null check (private.is_i18n_text(name)),
  i18n_meta jsonb not null default '{}',
  price_minor bigint not null check (price_minor >= 0),  -- full price for this variant
  sort integer not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id)
);
create index menu_item_variants_item_idx on public.menu_item_variants (item_id, sort);

create table public.menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  item_id uuid not null,
  name jsonb not null check (private.is_i18n_text(name)),
  i18n_meta jsonb not null default '{}',
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select is null or max_select >= greatest(min_select, 1)),
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id)
);
create index menu_option_groups_item_idx on public.menu_option_groups (item_id, sort);

-- Options and add-ons: a price delta of 0 is an option, > 0 an add-on.
create table public.menu_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  group_id uuid not null,
  name jsonb not null check (private.is_i18n_text(name)),
  i18n_meta jsonb not null default '{}',
  price_delta_minor bigint not null default 0 check (price_delta_minor >= 0),
  sort integer not null default 0,
  is_available boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, restaurant_id) references public.menu_option_groups (id, restaurant_id)
);
create index menu_options_group_idx on public.menu_options (group_id, sort);

-- Branch overrides: hide or mark unavailable an item or a whole category in one branch.
create table public.branch_menu_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  item_id uuid,
  category_id uuid,
  is_hidden boolean not null default false,
  is_available boolean not null default true,
  updated_at timestamptz not null default now(),
  check ((item_id is null) <> (category_id is null)),
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id) on delete cascade,
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id),
  foreign key (category_id, restaurant_id) references public.menu_categories (id, restaurant_id)
);
create unique index branch_menu_overrides_item_uidx on public.branch_menu_overrides (branch_id, item_id) where item_id is not null;
create unique index branch_menu_overrides_category_uidx on public.branch_menu_overrides (branch_id, category_id) where category_id is not null;

-- ---------------------------------------------------------------------------
-- Media (spec §8: up to 5 images (one cover) and 1 video per item; Gallery is separate)
-- ---------------------------------------------------------------------------
create type public.media_kind as enum ('image', 'video');

create table public.menu_item_media (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  item_id uuid not null,
  kind public.media_kind not null,
  storage_path text not null unique,
  poster_path text,
  width integer check (width > 0),
  height integer check (height > 0),
  bytes integer check (bytes > 0),
  sort integer not null default 0,
  is_cover boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id) on delete cascade,
  check (storage_path like restaurant_id::text || '/menu/%'),
  check (poster_path is null or poster_path like restaurant_id::text || '/menu/%'),
  check (not is_cover or kind = 'image')
);
create unique index menu_item_media_one_cover_uidx on public.menu_item_media (item_id) where is_cover;
create index menu_item_media_item_idx on public.menu_item_media (item_id, sort);

create table public.gallery_media (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.media_kind not null,
  storage_path text not null unique,
  poster_path text,
  caption jsonb not null default '{}' check (private.is_i18n_text(caption, false)),
  width integer, height integer, bytes integer,
  sort integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path like restaurant_id::text || '/gallery/%'),
  check (poster_path is null or poster_path like restaurant_id::text || '/gallery/%')
);
create index gallery_media_restaurant_idx on public.gallery_media (restaurant_id, sort);

-- Plan limits enforced in the database (entitlements: item_images, item_videos, gallery).
create or replace function private.guard_item_media_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feature record;
  v_count integer;
begin
  v_feature := private.feature_value(new.restaurant_id, case new.kind when 'image' then 'item_images' else 'item_videos' end);
  select count(*) into v_count from public.menu_item_media where item_id = new.item_id and kind = new.kind and id <> new.id;
  if not coalesce(v_feature.enabled, false)
     or (v_feature.limit_value is not null and v_count >= v_feature.limit_value) then
    raise exception 'your plan allows % % per item', coalesce(v_feature.limit_value, 0),
      case new.kind when 'image' then 'images' else 'videos' end using errcode = '23514';
  end if;
  return new;
end;
$$;
-- AFTER triggers: they run after the RLS check, so a caller who may not write here gets a
-- permission error rather than learning another restaurant's plan limits.
create trigger menu_item_media_limits after insert on public.menu_item_media
  for each row execute function private.guard_item_media_limits();

create or replace function private.guard_gallery_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_feature(new.restaurant_id, 'gallery') then
    raise exception 'the gallery is not included in your plan' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger gallery_media_feature after insert on public.gallery_media
  for each row execute function private.guard_gallery_feature();

-- ---------------------------------------------------------------------------
-- Shared plumbing: updated_at, immutability, lifecycle write guard, RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['menu_categories', 'menu_items', 'menu_item_variants', 'menu_option_groups', 'menu_options']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
  foreach t in array array['menu_categories', 'menu_items', 'menu_item_variants', 'menu_option_groups', 'menu_options',
                           'branch_menu_overrides', 'menu_item_media', 'gallery_media']
  loop
    execute format('create trigger tenant_write_guard before insert or update or delete on public.%I
                    for each row execute function private.guard_tenant_writable()', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.guard_tenant_immutable()',
                   t || '_immutable_tenant', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Reads: anyone with menu.view (waiters, kitchen, managers...). Writes: menu.edit.
-- Menu rows are archived, not deleted: no DELETE grant except media and overrides.
grant select, insert, update on public.menu_categories, public.menu_items, public.menu_item_variants,
  public.menu_option_groups, public.menu_options to authenticated;
grant select, insert, update, delete on public.branch_menu_overrides, public.menu_item_media,
  public.gallery_media to authenticated;

do $$
declare t text;
begin
  foreach t in array array['menu_categories', 'menu_items', 'menu_item_variants', 'menu_option_groups', 'menu_options',
                           'branch_menu_overrides', 'menu_item_media']
  loop
    execute format('create policy %I on public.%I for select to authenticated
                    using ((select private.has_permission(restaurant_id, ''menu.view'')))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check ((select private.has_permission(restaurant_id, ''menu.edit'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using ((select private.has_permission(restaurant_id, ''menu.edit'')))
                    with check ((select private.has_permission(restaurant_id, ''menu.edit'')))', t || '_update', t);
  end loop;
end $$;

create policy branch_menu_overrides_delete on public.branch_menu_overrides for delete to authenticated
  using ((select private.has_permission(restaurant_id, 'menu.edit')));
create policy menu_item_media_delete on public.menu_item_media for delete to authenticated
  using ((select private.has_permission(restaurant_id, 'menu.edit')));

create policy gallery_media_select on public.gallery_media for select to authenticated
  using ((select private.is_active_member(restaurant_id)));
create policy gallery_media_insert on public.gallery_media for insert to authenticated
  with check ((select private.has_permission(restaurant_id, 'gallery.manage')));
create policy gallery_media_update on public.gallery_media for update to authenticated
  using ((select private.has_permission(restaurant_id, 'gallery.manage')))
  with check ((select private.has_permission(restaurant_id, 'gallery.manage')));
create policy gallery_media_delete on public.gallery_media for delete to authenticated
  using ((select private.has_permission(restaurant_id, 'gallery.manage')));

-- Videos up to 15MB; posters/images are compressed in the browser before upload.
update storage.buckets set file_size_limit = 15728640 where id = 'restaurant-public';
