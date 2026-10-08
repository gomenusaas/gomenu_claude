-- Phase 3: website configuration, slug history (permanent redirects), custom domains
-- (decision P3-Q4: Vercel verifies DNS and issues SSL; the server records status here),
-- the restaurant dashboard summary, and storage delete rules for menu/gallery media.

-- ---------------------------------------------------------------------------
-- Website settings (templates themselves arrive in Phase 4; these are presentation choices)
-- ---------------------------------------------------------------------------
create type public.menu_display_style as enum ('list', 'grid', 'compact');

create table public.website_settings (
  restaurant_id uuid primary key references public.restaurants (id) on delete restrict,
  template_key text not null default 'classic' check (template_key ~ '^[a-z0-9_-]{2,40}$'),
  menu_style public.menu_display_style not null default 'list',
  show_gallery boolean not null default true,
  show_branches boolean not null default true,
  show_hours boolean not null default true,
  show_whatsapp boolean not null default true,
  -- spec §10: ordering and online payment are toggled independently; with ordering off the
  -- website and menu still work. (Ordering itself arrives in Phase 5.)
  ordering_enabled boolean not null default false,
  online_payment_enabled boolean not null default false,
  seo_title jsonb not null default '{}' check (private.is_i18n_text(seo_title, false)),
  seo_description jsonb not null default '{}' check (private.is_i18n_text(seo_description, false)),
  is_published boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger website_settings_set_updated_at before update on public.website_settings
  for each row execute function private.set_updated_at();
create trigger tenant_write_guard before insert or update or delete on public.website_settings
  for each row execute function private.guard_tenant_writable();

insert into public.website_settings (restaurant_id) select id from public.restaurants on conflict do nothing;

create or replace function private.create_website_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.website_settings (restaurant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger restaurants_website_settings after insert on public.restaurants
  for each row execute function private.create_website_settings();

alter table public.website_settings enable row level security;
alter table public.website_settings force row level security;
revoke all on public.website_settings from anon, authenticated;
grant select on public.website_settings to authenticated;
grant update (template_key, menu_style, show_gallery, show_branches, show_hours, show_whatsapp, ordering_enabled,
              online_payment_enabled, seo_title, seo_description, is_published, updated_by)
  on public.website_settings to authenticated;

create policy website_settings_select on public.website_settings for select to authenticated
  using ((select private.is_active_member(restaurant_id)));
create policy website_settings_update on public.website_settings for update to authenticated
  using ((select private.has_permission(restaurant_id, 'website.manage')))
  with check ((select private.has_permission(restaurant_id, 'website.manage')));

-- ---------------------------------------------------------------------------
-- Slug history (spec §7: kept with permanent redirects)
-- ---------------------------------------------------------------------------
create table public.restaurant_slug_history (
  old_slug text primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index restaurant_slug_history_restaurant_idx on public.restaurant_slug_history (restaurant_id);
create trigger tenant_write_guard before insert or update or delete on public.restaurant_slug_history
  for each row execute function private.guard_tenant_writable();

-- A slug that redirects to one restaurant can never be taken by another.
create or replace function private.guard_reserved_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reserved_slugs where slug = new.slug) then
    raise exception 'the web address "%" is reserved', new.slug using errcode = '23505';
  end if;
  if exists (select 1 from public.restaurant_slug_history where old_slug = new.slug and restaurant_id <> new.id) then
    raise exception 'the web address "%" is taken', new.slug using errcode = '23505';
  end if;
  return new;
end;
$$;

create or replace function public.change_restaurant_slug(p_restaurant_id uuid, p_new_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_new text := lower(btrim(p_new_slug));
begin
  if not private.has_permission(p_restaurant_id, 'website.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select slug into v_old from public.restaurants where id = p_restaurant_id;
  if v_old = v_new then
    return;
  end if;
  if v_new !~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$' then
    raise exception 'use 3–50 lowercase letters, numbers or dashes' using errcode = '22023';
  end if;
  -- Reclaiming one of our own old slugs removes it from history.
  delete from public.restaurant_slug_history where old_slug = v_new and restaurant_id = p_restaurant_id;
  insert into public.restaurant_slug_history (old_slug, restaurant_id, changed_by) values (v_old, p_restaurant_id, auth.uid())
  on conflict (old_slug) do nothing;
  update public.restaurants set slug = v_new where id = p_restaurant_id;
  perform private.write_audit(p_restaurant_id, 'website.slug_changed', 'restaurant', p_restaurant_id,
    jsonb_build_object('slug', v_old), jsonb_build_object('slug', v_new));
end;
$$;

-- Public resolver for gomenu.om/{slug} (used by the website in Phase 4).
create or replace function public.resolve_restaurant_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('restaurant_id', r.id, 'slug', r.slug, 'redirect', r.slug <> lower(p_slug),
                            'available', private.restaurant_publicly_available(r.id))
    from public.restaurants r
   where r.slug = lower(p_slug)
      or r.id = (select h.restaurant_id from public.restaurant_slug_history h where h.old_slug = lower(p_slug))
   limit 1;
$$;

alter table public.restaurant_slug_history enable row level security;
alter table public.restaurant_slug_history force row level security;
revoke all on public.restaurant_slug_history from anon, authenticated;
grant select on public.restaurant_slug_history to authenticated;
create policy restaurant_slug_history_select on public.restaurant_slug_history for select to authenticated
  using ((select private.has_permission(restaurant_id, 'website.manage')));

-- ---------------------------------------------------------------------------
-- Custom domains (spec §7)
-- ---------------------------------------------------------------------------
create type public.domain_status as enum ('not_connected', 'dns_required', 'verifying', 'connected', 'ssl_pending',
                                          'active', 'error', 'disconnected');

create table public.restaurant_domains (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  hostname text not null unique
    check (hostname = lower(hostname)
           and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
           and hostname !~ '(^|\.)gomenu\.om$'),
  kind text not null check (kind in ('root', 'www', 'subdomain')),
  status public.domain_status not null default 'not_connected',
  is_primary boolean not null default false,
  verification jsonb not null default '[]',  -- DNS records to show the owner
  error text,
  last_checked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index restaurant_domains_one_primary_uidx on public.restaurant_domains (restaurant_id) where is_primary;
create trigger restaurant_domains_set_updated_at before update on public.restaurant_domains
  for each row execute function private.set_updated_at();
create trigger tenant_write_guard before insert or update or delete on public.restaurant_domains
  for each row execute function private.guard_tenant_writable();

alter table public.restaurant_domains enable row level security;
alter table public.restaurant_domains force row level security;
revoke all on public.restaurant_domains from anon, authenticated;
grant select on public.restaurant_domains to authenticated;
create policy restaurant_domains_select on public.restaurant_domains for select to authenticated
  using ((select private.has_permission(restaurant_id, 'website.manage'))
         or (select private.has_platform_role(array['super_admin', 'admin', 'support']::public.platform_role[])));

create or replace function public.add_custom_domain(p_restaurant_id uuid, p_hostname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := lower(rtrim(btrim(p_hostname), '.'));
  v_labels integer;
  v_id uuid;
begin
  if not private.has_permission(p_restaurant_id, 'website.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.has_feature(p_restaurant_id, 'custom_domain') then
    raise exception 'custom domains are not included in your plan' using errcode = '23514';
  end if;
  if exists (select 1 from public.restaurant_domains where hostname = v_host) then
    raise exception 'this domain is already connected to a GoMenu restaurant' using errcode = '23505';
  end if;
  v_labels := array_length(string_to_array(v_host, '.'), 1);
  insert into public.restaurant_domains (restaurant_id, hostname, kind, created_by)
  values (p_restaurant_id, v_host,
          case when v_host like 'www.%' then 'www' when v_labels = 2 then 'root' else 'subdomain' end, auth.uid())
  returning id into v_id;
  perform private.write_audit(p_restaurant_id, 'website.domain_added', 'domain', v_id, null,
                              jsonb_build_object('hostname', v_host));
  return v_id;
end;
$$;

create or replace function public.remove_custom_domain(p_domain_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.restaurant_domains;
begin
  select * into v_d from public.restaurant_domains where id = p_domain_id;
  if v_d.id is null or not private.has_permission(v_d.restaurant_id, 'website.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.restaurant_domains where id = p_domain_id;
  perform private.write_audit(v_d.restaurant_id, 'website.domain_removed', 'domain', v_d.id,
                              jsonb_build_object('hostname', v_d.hostname), null);
  return v_d.hostname;
end;
$$;

create or replace function public.set_primary_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.restaurant_domains;
begin
  select * into v_d from public.restaurant_domains where id = p_domain_id;
  if v_d.id is null or not private.has_permission(v_d.restaurant_id, 'website.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_d.status <> 'active' then
    raise exception 'only an active domain can be the main address' using errcode = '22023';
  end if;
  update public.restaurant_domains set is_primary = false where restaurant_id = v_d.restaurant_id and is_primary;
  update public.restaurant_domains set is_primary = true where id = p_domain_id;
  perform private.write_audit(v_d.restaurant_id, 'website.domain_primary', 'domain', v_d.id, null,
                              jsonb_build_object('hostname', v_d.hostname));
end;
$$;

-- Server-only: status from the domain provider (Vercel).
create or replace function public.set_domain_status(p_domain_id uuid, p_status public.domain_status,
                                                    p_verification jsonb default null, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.restaurant_domains
     set status = p_status, verification = coalesce(p_verification, verification), error = p_error,
         last_checked_at = now(), is_primary = case when p_status = 'active' then is_primary else false end
   where id = p_domain_id;
$$;

-- Public resolver for custom hostnames: one restaurant, one data source, many addresses.
create or replace function public.resolve_host(p_hostname text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'restaurant_id', d.restaurant_id,
           'canonical_host', coalesce((select p.hostname from public.restaurant_domains p
                                        where p.restaurant_id = d.restaurant_id and p.is_primary and p.status = 'active'),
                                      d.hostname),
           'available', private.restaurant_publicly_available(d.restaurant_id))
    from public.restaurant_domains d
   where d.hostname = lower(p_hostname) and d.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Storage: menu editors may delete menu media, gallery managers gallery media.
-- ---------------------------------------------------------------------------
drop policy restaurant_public_delete on storage.objects;
create policy restaurant_public_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.restaurant_writable(private.path_restaurant_id(name)))
         and ((select private.has_permission(private.path_restaurant_id(name), 'website.manage'))
              or (split_part(name, '/', 2) = 'menu' and (select private.has_permission(private.path_restaurant_id(name), 'menu.edit')))
              or (split_part(name, '/', 2) = 'gallery' and (select private.has_permission(private.path_restaurant_id(name), 'gallery.manage')))));

-- Menu import files are private; menu editors upload them.
drop policy restaurant_private_insert on storage.objects;
create policy restaurant_private_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-private'
              and (select private.restaurant_writable(private.path_restaurant_id(name)))
              and ((select private.has_permission(private.path_restaurant_id(name), 'settings.manage'))
                   or (split_part(name, '/', 2) = 'imports'
                       and (select private.has_permission(private.path_restaurant_id(name), 'menu.edit')))));

-- ---------------------------------------------------------------------------
-- Dashboard: one call, real numbers, each part gated by the caller's permissions.
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_dashboard(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not private.is_active_member(p_restaurant_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_out := jsonb_build_object(
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name,
                    'is_open', private.branch_is_open(b.id)) order by b.sort, b.created_at), '[]'::jsonb)
                   from public.branches b
                  where b.restaurant_id = p_restaurant_id and b.archived_at is null
                    and private.is_active_member(p_restaurant_id, b.id)));
  if private.has_permission(p_restaurant_id, 'menu.view') then
    v_out := v_out || jsonb_build_object('menu', jsonb_build_object(
      'categories', (select count(*) from public.menu_categories where restaurant_id = p_restaurant_id and archived_at is null),
      'items', (select count(*) from public.menu_items where restaurant_id = p_restaurant_id and archived_at is null),
      'unavailable', (select count(*) from public.menu_items where restaurant_id = p_restaurant_id and archived_at is null
                                                              and not is_available),
      'untranslated_ai', (select count(*) from public.menu_items i, jsonb_each(i.i18n_meta) m
                           where i.restaurant_id = p_restaurant_id and i.archived_at is null
                             and (m.value ->> 'reviewed')::boolean is false)));
  end if;
  if private.has_permission(p_restaurant_id, 'staff.view') then
    v_out := v_out || jsonb_build_object('staff', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) n from public.memberships where restaurant_id = p_restaurant_id
             and status not in ('cancelled', 'removed', 'expired') group by status) s));
  end if;
  if private.has_permission(p_restaurant_id, 'menu.edit') or private.has_permission(p_restaurant_id, 'billing.manage') then
    v_out := v_out || jsonb_build_object('ai_credits', private.ai_credit_balance(p_restaurant_id));
  end if;
  if private.has_permission(p_restaurant_id, 'website.manage') then
    v_out := v_out || jsonb_build_object('website', (select jsonb_build_object('published', w.is_published,
        'slug', r.slug, 'domains_active', (select count(*) from public.restaurant_domains d
                                            where d.restaurant_id = r.id and d.status = 'active'))
        from public.website_settings w join public.restaurants r on r.id = w.restaurant_id
       where w.restaurant_id = p_restaurant_id));
  end if;
  return v_out;
end;
$$;

grant execute on function public.change_restaurant_slug(uuid, text) to authenticated;
grant execute on function public.resolve_restaurant_slug(text) to anon, authenticated;
grant execute on function public.add_custom_domain(uuid, text) to authenticated;
grant execute on function public.remove_custom_domain(uuid) to authenticated;
grant execute on function public.set_primary_domain(uuid) to authenticated;
grant execute on function public.set_domain_status(uuid, public.domain_status, jsonb, text) to service_role;
grant execute on function public.resolve_host(text) to anon, authenticated;
grant execute on function public.restaurant_dashboard(uuid) to authenticated;
