-- Phase 3: restaurant profile settings, branch details and opening hours, languages.

-- ---------------------------------------------------------------------------
-- Restaurant profile (shown on the website in Phase 4). Text fields are per-language JSON:
-- {"en": "...", "ar": "..."}.
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column timezone text not null default 'Asia/Muscat',
  add column tagline jsonb not null default '{}'::jsonb,
  add column description jsonb not null default '{}'::jsonb,
  add column contact_phone_e164 text check (contact_phone_e164 is null or private.is_e164(contact_phone_e164)),
  add column whatsapp_e164 text check (whatsapp_e164 is null or private.is_e164(whatsapp_e164)),
  add column contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column social_links jsonb not null default '{}'::jsonb,
  add column logo_path text,
  add column cover_path text;

grant update (timezone, tagline, description, contact_phone_e164, whatsapp_e164, contact_email, social_links,
              logo_path, cover_path) on public.restaurants to authenticated;

-- Media paths must live in this restaurant's folder.
create or replace function private.guard_restaurant_media_paths()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.logo_path is not null and new.logo_path not like new.id::text || '/%')
     or (new.cover_path is not null and new.cover_path not like new.id::text || '/%') then
    raise exception 'media must be stored in the restaurant''s own folder' using errcode = '23514';
  end if;
  if jsonb_typeof(new.social_links) <> 'object' or jsonb_typeof(new.tagline) <> 'object'
     or jsonb_typeof(new.description) <> 'object' then
    raise exception 'invalid profile fields' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger restaurants_media_paths before insert or update on public.restaurants
  for each row execute function private.guard_restaurant_media_paths();

-- ---------------------------------------------------------------------------
-- Branches: contact, location, manual open/closed override, weekly hours.
-- ---------------------------------------------------------------------------
create type public.branch_status_override as enum ('auto', 'open', 'closed');

alter table public.branches
  add column whatsapp_e164 text check (whatsapp_e164 is null or private.is_e164(whatsapp_e164)),
  add column latitude numeric(9, 6) check (latitude between -90 and 90),
  add column longitude numeric(9, 6) check (longitude between -180 and 180),
  add column maps_url text check (maps_url is null or maps_url ~ '^https://'),
  add column status_override public.branch_status_override not null default 'auto',
  add column override_until timestamptz,
  add column sort integer not null default 0;

grant insert (whatsapp_e164, latitude, longitude, maps_url, status_override, override_until, sort) on public.branches to authenticated;
grant update (whatsapp_e164, latitude, longitude, maps_url, status_override, override_until, sort) on public.branches to authenticated;

create table public.branch_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  opens_at time not null,
  closes_at time not null,  -- if <= opens_at the period runs past midnight
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id) on delete cascade
);
create index branch_hours_branch_idx on public.branch_hours (branch_id, day_of_week);

create trigger tenant_write_guard before insert or update or delete on public.branch_hours
  for each row execute function private.guard_tenant_writable();

alter table public.branch_hours enable row level security;
alter table public.branch_hours force row level security;
revoke all on public.branch_hours from anon, authenticated;
grant select, insert, update, delete on public.branch_hours to authenticated;

create policy branch_hours_select on public.branch_hours for select to authenticated
  using ((select private.is_active_member(restaurant_id, branch_id)));
create policy branch_hours_write on public.branch_hours for all to authenticated
  using ((select private.has_permission(restaurant_id, 'branches.manage', branch_id)))
  with check ((select private.has_permission(restaurant_id, 'branches.manage', branch_id)));

-- Open/closed from hours in the restaurant's timezone, with a manual override (spec §7).
create or replace function private.branch_is_open(p_branch_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b public.branches;
  v_tz text;
  v_local timestamp;
  v_dow integer;
  v_time time;
begin
  select * into v_b from public.branches where id = p_branch_id;
  if v_b.id is null or not v_b.is_active or v_b.archived_at is not null then
    return false;
  end if;
  if v_b.status_override <> 'auto' and (v_b.override_until is null or v_b.override_until > p_at) then
    return v_b.status_override = 'open';
  end if;
  select timezone into v_tz from public.restaurants where id = v_b.restaurant_id;
  v_local := p_at at time zone v_tz;
  v_dow := extract(dow from v_local)::integer;
  v_time := v_local::time;
  return exists (
    select 1 from public.branch_hours h
     where h.branch_id = p_branch_id and (
       -- same-day period
       (h.day_of_week = v_dow and h.opens_at < h.closes_at and v_time >= h.opens_at and v_time < h.closes_at)
       -- overnight period that started today
       or (h.day_of_week = v_dow and h.closes_at <= h.opens_at and v_time >= h.opens_at)
       -- overnight period that started yesterday
       or (h.day_of_week = (v_dow + 6) % 7 and h.closes_at <= h.opens_at and v_time < h.closes_at)
     ));
end;
$$;

-- Replace a branch's whole weekly schedule atomically.
create or replace function public.set_branch_hours(p_branch_id uuid, p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.branches;
  v_h jsonb;
begin
  select * into v_b from public.branches where id = p_branch_id;
  if v_b.id is null or not private.has_permission(v_b.restaurant_id, 'branches.manage', v_b.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.restaurant_writable(v_b.restaurant_id) then
    raise exception 'this restaurant''s account is not active' using errcode = '42501';
  end if;
  delete from public.branch_hours where branch_id = p_branch_id;
  for v_h in select * from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) loop
    insert into public.branch_hours (restaurant_id, branch_id, day_of_week, opens_at, closes_at)
    values (v_b.restaurant_id, v_b.id, (v_h ->> 'day')::smallint, (v_h ->> 'opens')::time, (v_h ->> 'closes')::time);
  end loop;
  perform private.write_audit(v_b.restaurant_id, 'branch.hours_changed', 'branch', v_b.id, null, p_hours, v_b.id);
end;
$$;

-- Members see live open/closed state of their branches.
create or replace function public.branch_open_status(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(b.id, private.branch_is_open(b.id)), '{}'::jsonb)
    from public.branches b
   where b.restaurant_id = p_restaurant_id and private.is_active_member(p_restaurant_id, b.id);
$$;

-- ---------------------------------------------------------------------------
-- Languages (spec §8): the platform enables languages; restaurants activate theirs.
-- ---------------------------------------------------------------------------
create table public.platform_languages (
  code text primary key check (code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  name text not null,
  native_name text not null,
  dir text not null default 'ltr' check (dir in ('ltr', 'rtl')),
  is_enabled boolean not null default false,
  sort integer not null default 0
);
insert into public.platform_languages (code, name, native_name, dir, is_enabled, sort) values
  ('en', 'English', 'English', 'ltr', true, 10),
  ('ar', 'Arabic', 'العربية', 'rtl', true, 20),
  ('ur', 'Urdu', 'اردو', 'rtl', false, 30),
  ('hi', 'Hindi', 'हिन्दी', 'ltr', false, 40),
  ('fr', 'French', 'Français', 'ltr', false, 50),
  ('fa', 'Persian', 'فارسی', 'rtl', false, 60);

create table public.restaurant_languages (
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  locale text not null references public.platform_languages (code),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, locale)
);

create trigger tenant_write_guard before insert or update or delete on public.restaurant_languages
  for each row execute function private.guard_tenant_writable();

-- The default language is always active.
insert into public.restaurant_languages (restaurant_id, locale) select id, default_locale from public.restaurants
on conflict do nothing;

create or replace function private.ensure_default_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.restaurant_languages (restaurant_id, locale) values (new.id, new.default_locale)
  on conflict do nothing;
  return new;
end;
$$;
create trigger restaurants_default_language after insert or update of default_locale on public.restaurants
  for each row execute function private.ensure_default_language();

create or replace function public.set_restaurant_languages(p_restaurant_id uuid, p_locales text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default text;
begin
  if not private.has_permission(p_restaurant_id, 'website.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select default_locale into v_default from public.restaurants where id = p_restaurant_id;
  if exists (select 1 from unnest(p_locales) l left join public.platform_languages pl on pl.code = l
              where pl.code is null or not pl.is_enabled) then
    raise exception 'language not available on GoMenu' using errcode = '22023';
  end if;
  delete from public.restaurant_languages where restaurant_id = p_restaurant_id and locale <> all (p_locales || v_default);
  insert into public.restaurant_languages (restaurant_id, locale)
  select p_restaurant_id, l from unnest(p_locales || v_default) l on conflict do nothing;
  perform private.write_audit(p_restaurant_id, 'website.languages_changed', 'restaurant', p_restaurant_id, null,
                              jsonb_build_object('locales', p_locales));
end;
$$;

alter table public.platform_languages enable row level security;
alter table public.platform_languages force row level security;
alter table public.restaurant_languages enable row level security;
alter table public.restaurant_languages force row level security;
revoke all on public.platform_languages, public.restaurant_languages from anon, authenticated;
grant select on public.platform_languages, public.restaurant_languages to authenticated;

create policy platform_languages_select on public.platform_languages for select to authenticated
  using ((select private.has_any_active_membership()) or (select private.is_platform_staff()));
create policy restaurant_languages_select on public.restaurant_languages for select to authenticated
  using ((select private.is_active_member(restaurant_id)));

create or replace function public.platform_set_language(p_code text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin', 'admin', 'content']::public.platform_role[]);
  update public.platform_languages set is_enabled = p_enabled where code = p_code;
  perform private.write_platform_audit('languages.platform_changed', 'language', null, null, null, null,
    jsonb_build_object('code', p_code, 'enabled', p_enabled));
end;
$$;

grant execute on function public.set_branch_hours(uuid, jsonb) to authenticated;
grant execute on function public.branch_open_status(uuid) to authenticated;
grant execute on function public.set_restaurant_languages(uuid, text[]) to authenticated;
grant execute on function public.platform_set_language(text, boolean) to authenticated;
