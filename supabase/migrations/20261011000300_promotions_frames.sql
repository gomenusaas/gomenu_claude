-- Phase 4: Promotions and Frames (Gold, spec §8). Both target branches (none = all branches),
-- link to an item, and are translated. Frames expire 24h after publishing, enforced here.

create type public.promotion_kind as enum ('card', 'banner', 'carousel');

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.promotion_kind not null default 'card',
  title jsonb not null check (private.is_i18n_text(title)),
  body jsonb not null default '{}' check (private.is_i18n_text(body, false)),
  i18n_meta jsonb not null default '{}',
  image_path text check (image_path is null or image_path like restaurant_id::text || '/promotions/%'),
  item_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  sort integer not null default 0,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id),
  check (ends_at is null or ends_at > starts_at)
);
create index promotions_restaurant_idx on public.promotions (restaurant_id, sort);

create table public.promotion_branches (
  promotion_id uuid not null,
  branch_id uuid not null,
  restaurant_id uuid not null,
  primary key (promotion_id, branch_id),
  foreign key (promotion_id, restaurant_id) references public.promotions (id, restaurant_id) on delete cascade,
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id) on delete cascade
);

create table public.frames (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.media_kind not null,
  media_path text not null check (media_path like restaurant_id::text || '/frames/%'),
  poster_path text check (poster_path is null or poster_path like restaurant_id::text || '/frames/%'),
  caption jsonb not null default '{}' check (private.is_i18n_text(caption, false)),
  i18n_meta jsonb not null default '{}',
  item_id uuid,
  promotion_id uuid,
  published_at timestamptz not null default now(),
  -- spec §8: Frames expire 24h after publishing. Set by trigger; can't be changed or extended.
  expires_at timestamptz not null,
  archived_at timestamptz,   -- removed early
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id),
  foreign key (promotion_id, restaurant_id) references public.promotions (id, restaurant_id)
);
create index frames_restaurant_idx on public.frames (restaurant_id, published_at desc);

create table public.frame_branches (
  frame_id uuid not null,
  branch_id uuid not null,
  restaurant_id uuid not null,
  primary key (frame_id, branch_id),
  foreign key (frame_id, restaurant_id) references public.frames (id, restaurant_id) on delete cascade,
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id) on delete cascade
);

-- Publishing time is fixed: a Frame can't be re-dated to live longer.
create or replace function private.guard_frame_publish_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := now();
    new.expires_at := new.published_at + interval '24 hours';
  elsif new.published_at <> old.published_at or new.expires_at <> old.expires_at then
    raise exception 'a Frame''s publishing time cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger frames_publish_time before insert or update on public.frames
  for each row execute function private.guard_frame_publish_time();

-- Plan gates (after RLS, like the gallery: no leaking another restaurant's plan).
create or replace function private.guard_feature_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_feature(new.restaurant_id, tg_argv[0]) then
    raise exception '% are not included in your plan', tg_argv[1] using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger promotions_feature after insert on public.promotions
  for each row execute function private.guard_feature_on_insert('promotions', 'promotions');
create trigger frames_feature after insert on public.frames
  for each row execute function private.guard_feature_on_insert('frames', 'Frames');

create trigger promotions_set_updated_at before update on public.promotions
  for each row execute function private.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['promotions', 'promotion_branches', 'frames', 'frame_branches'] loop
    execute format('create trigger tenant_write_guard before insert or update or delete on public.%I
                    for each row execute function private.guard_tenant_writable()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['promotions', 'frames'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.guard_tenant_immutable()',
                   t || '_immutable_tenant', t);
  end loop;
end $$;

grant select, insert, update on public.promotions, public.frames to authenticated;
grant select, insert, delete on public.promotion_branches, public.frame_branches to authenticated;

create policy promotions_select on public.promotions for select to authenticated
  using ((select private.has_permission(restaurant_id, 'promotions.manage')));
create policy promotions_insert on public.promotions for insert to authenticated
  with check ((select private.has_permission(restaurant_id, 'promotions.manage')));
create policy promotions_update on public.promotions for update to authenticated
  using ((select private.has_permission(restaurant_id, 'promotions.manage')))
  with check ((select private.has_permission(restaurant_id, 'promotions.manage')));
create policy promotion_branches_all on public.promotion_branches for all to authenticated
  using ((select private.has_permission(restaurant_id, 'promotions.manage')))
  with check ((select private.has_permission(restaurant_id, 'promotions.manage')));

create policy frames_select on public.frames for select to authenticated
  using ((select private.has_permission(restaurant_id, 'frames.manage')));
create policy frames_insert on public.frames for insert to authenticated
  with check ((select private.has_permission(restaurant_id, 'frames.manage')));
create policy frames_update on public.frames for update to authenticated
  using ((select private.has_permission(restaurant_id, 'frames.manage')))
  with check ((select private.has_permission(restaurant_id, 'frames.manage')));
create policy frame_branches_all on public.frame_branches for all to authenticated
  using ((select private.has_permission(restaurant_id, 'frames.manage')))
  with check ((select private.has_permission(restaurant_id, 'frames.manage')));

-- Storage: promotion and Frame media live in the public bucket under their own folders.
drop policy restaurant_public_insert on storage.objects;
create policy restaurant_public_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-public'
              and (select private.restaurant_writable(private.path_restaurant_id(name)))
              and ((select private.has_permission(private.path_restaurant_id(name), 'website.manage'))
                   or (split_part(name, '/', 2) = 'menu' and (select private.has_permission(private.path_restaurant_id(name), 'menu.edit')))
                   or (split_part(name, '/', 2) = 'gallery' and (select private.has_permission(private.path_restaurant_id(name), 'gallery.manage')))
                   or (split_part(name, '/', 2) = 'promotions' and (select private.has_permission(private.path_restaurant_id(name), 'promotions.manage')))
                   or (split_part(name, '/', 2) = 'frames' and (select private.has_permission(private.path_restaurant_id(name), 'frames.manage')))));
drop policy restaurant_public_delete on storage.objects;
create policy restaurant_public_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.restaurant_writable(private.path_restaurant_id(name)))
         and ((select private.has_permission(private.path_restaurant_id(name), 'website.manage'))
              or (split_part(name, '/', 2) = 'menu' and (select private.has_permission(private.path_restaurant_id(name), 'menu.edit')))
              or (split_part(name, '/', 2) = 'gallery' and (select private.has_permission(private.path_restaurant_id(name), 'gallery.manage')))
              or (split_part(name, '/', 2) = 'promotions' and (select private.has_permission(private.path_restaurant_id(name), 'promotions.manage')))
              or (split_part(name, '/', 2) = 'frames' and (select private.has_permission(private.path_restaurant_id(name), 'frames.manage')))));
