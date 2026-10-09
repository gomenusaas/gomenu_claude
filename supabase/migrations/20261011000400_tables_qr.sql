-- Phase 4: tables and QR codes (spec §9). A QR code is a non-predictable token resolved
-- server-side at /q/{token}: it never encodes a slug, domain or table number, so changing
-- those never requires reprinting. Table QR establishes context, not physical presence.

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  section text check (section is null or length(btrim(section)) between 1 and 40),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id)
);
create unique index restaurant_tables_label_uidx on public.restaurant_tables (branch_id, lower(label)) where archived_at is null;
create trigger restaurant_tables_set_updated_at before update on public.restaurant_tables
  for each row execute function private.set_updated_at();

create type public.qr_kind as enum ('general', 'table');

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.qr_kind not null,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22,64}$'),
  label text,
  branch_id uuid,
  table_id uuid,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (table_id, restaurant_id) references public.restaurant_tables (id, restaurant_id),
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id),
  check ((kind = 'table') = (table_id is not null)),
  check (revoked_at is null or not is_active)
);
-- One live code per table; regenerating revokes the old one.
create unique index qr_codes_one_per_table_uidx on public.qr_codes (table_id) where revoked_at is null;
create index qr_codes_restaurant_idx on public.qr_codes (restaurant_id);

do $$
declare t text;
begin
  foreach t in array array['restaurant_tables', 'qr_codes'] loop
    execute format('create trigger tenant_write_guard before insert or update or delete on public.%I
                    for each row execute function private.guard_tenant_writable()', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.guard_tenant_immutable()',
                   t || '_immutable_tenant', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- qr.manage, scoped to the branch (a branch manager sees only their branches' tables).
create policy restaurant_tables_select on public.restaurant_tables for select to authenticated
  using ((select private.has_permission(restaurant_id, 'qr.manage', branch_id)));
create policy qr_codes_select on public.qr_codes for select to authenticated
  using ((select private.has_permission(restaurant_id, 'qr.manage', branch_id)));

create or replace function private.new_qr_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');
$$;

create or replace function public.create_table(p_branch_id uuid, p_label text, p_section text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.branches;
  v_id uuid;
begin
  select * into v_b from public.branches where id = p_branch_id;
  if v_b.id is null or not private.has_permission(v_b.restaurant_id, 'qr.manage', v_b.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.restaurant_tables (restaurant_id, branch_id, label, section, created_by)
  values (v_b.restaurant_id, v_b.id, btrim(p_label), nullif(btrim(p_section), ''), auth.uid())
  returning id into v_id;
  insert into public.qr_codes (restaurant_id, kind, token, branch_id, table_id, created_by)
  values (v_b.restaurant_id, 'table', private.new_qr_token(), v_b.id, v_id, auth.uid());
  perform private.write_audit(v_b.restaurant_id, 'qr.table_created', 'table', v_id, null,
                              jsonb_build_object('label', btrim(p_label)), v_b.id);
  return v_id;
end;
$$;

-- New token; the old one stops working immediately.
create or replace function public.regenerate_table_qr(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.restaurant_tables;
begin
  select * into v_t from public.restaurant_tables where id = p_table_id and archived_at is null;
  if v_t.id is null or not private.has_permission(v_t.restaurant_id, 'qr.manage', v_t.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.qr_codes set is_active = false, revoked_at = now() where table_id = v_t.id and revoked_at is null;
  insert into public.qr_codes (restaurant_id, kind, token, branch_id, table_id, is_active, created_by)
  values (v_t.restaurant_id, 'table', private.new_qr_token(), v_t.branch_id, v_t.id, v_t.is_active, auth.uid());
  perform private.write_audit(v_t.restaurant_id, 'qr.table_regenerated', 'table', v_t.id, null, null, v_t.branch_id);
end;
$$;

create or replace function public.set_table_active(p_table_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.restaurant_tables;
begin
  select * into v_t from public.restaurant_tables where id = p_table_id and archived_at is null;
  if v_t.id is null or not private.has_permission(v_t.restaurant_id, 'qr.manage', v_t.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.restaurant_tables set is_active = p_active where id = v_t.id;
  update public.qr_codes set is_active = p_active where table_id = v_t.id and revoked_at is null;
  perform private.write_audit(v_t.restaurant_id, case when p_active then 'qr.table_activated' else 'qr.table_deactivated' end,
                              'table', v_t.id, null, null, v_t.branch_id);
end;
$$;

create or replace function public.archive_table(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.restaurant_tables;
begin
  select * into v_t from public.restaurant_tables where id = p_table_id and archived_at is null;
  if v_t.id is null or not private.has_permission(v_t.restaurant_id, 'qr.manage', v_t.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.restaurant_tables set is_active = false, archived_at = now() where id = v_t.id;
  update public.qr_codes set is_active = false, revoked_at = now() where table_id = v_t.id and revoked_at is null;
  perform private.write_audit(v_t.restaurant_id, 'qr.table_archived', 'table', v_t.id, null, null, v_t.branch_id);
end;
$$;

-- General QR (posters, social, packaging): no table identity. Several can exist (one per campaign).
create or replace function public.create_general_qr(p_restaurant_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_permission(p_restaurant_id, 'qr.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.qr_codes (restaurant_id, kind, token, label, created_by)
  values (p_restaurant_id, 'general', private.new_qr_token(), nullif(btrim(p_label), ''), auth.uid())
  returning id into v_id;
  perform private.write_audit(p_restaurant_id, 'qr.general_created', 'qr_code', v_id, null,
                              jsonb_build_object('label', p_label));
  return v_id;
end;
$$;

create or replace function public.revoke_general_qr(p_qr_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.qr_codes;
begin
  select * into v_q from public.qr_codes where id = p_qr_id and kind = 'general';
  if v_q.id is null or not private.has_permission(v_q.restaurant_id, 'qr.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.qr_codes set is_active = false, revoked_at = coalesce(revoked_at, now()) where id = v_q.id;
  perform private.write_audit(v_q.restaurant_id, 'qr.general_revoked', 'qr_code', v_q.id, null, null);
end;
$$;

grant execute on function public.create_table(uuid, text, text) to authenticated;
grant execute on function public.regenerate_table_qr(uuid) to authenticated;
grant execute on function public.set_table_active(uuid, boolean) to authenticated;
grant execute on function public.archive_table(uuid) to authenticated;
grant execute on function public.create_general_qr(uuid, text) to authenticated;
grant execute on function public.revoke_general_qr(uuid) to authenticated;
