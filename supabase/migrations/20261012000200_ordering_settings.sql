-- Phase 5: per-restaurant ordering rules (spec §10). Decisions P5: VAT per restaurant, default
-- 5% included in prices; default assignment mode = open to waiters on shift (mode C).

create type public.assignment_mode as enum ('manager', 'table', 'open', 'none');  -- spec modes A, B, C, D
create type public.payment_timing as enum ('before', 'after');
create type public.service_type as enum ('table', 'car', 'pickup');

create table public.ordering_settings (
  restaurant_id uuid primary key references public.restaurants (id) on delete restrict,
  -- Table-QR orders wait for a waiter to verify the table (spec: default ON).
  waiter_confirmation boolean not null default true,
  assignment_mode public.assignment_mode not null default 'open',
  -- Website orders (pickup, car) are accepted automatically unless the restaurant reviews them.
  auto_accept_online boolean not null default true,
  service_table boolean not null default true,
  service_car boolean not null default true,
  service_pickup boolean not null default true,
  -- spec suggested defaults: table after, car before, pickup before preparation.
  timing_table public.payment_timing not null default 'after',
  timing_car public.payment_timing not null default 'before',
  timing_pickup public.payment_timing not null default 'before',
  vat_rate_bp integer not null default 500 check (vat_rate_bp between 0 and 5000),
  prices_include_vat boolean not null default true,
  kitchen_delay_minutes integer not null default 15 check (kitchen_delay_minutes between 1 and 240),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger ordering_settings_set_updated_at before update on public.ordering_settings
  for each row execute function private.set_updated_at();
create trigger tenant_write_guard before insert or update or delete on public.ordering_settings
  for each row execute function private.guard_tenant_writable();

insert into public.ordering_settings (restaurant_id) select id from public.restaurants on conflict do nothing;
create or replace function private.create_ordering_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ordering_settings (restaurant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger restaurants_ordering_settings after insert on public.restaurants
  for each row execute function private.create_ordering_settings();

alter table public.ordering_settings enable row level security;
alter table public.ordering_settings force row level security;
revoke all on public.ordering_settings from anon, authenticated;
grant select on public.ordering_settings to authenticated;
grant update (waiter_confirmation, assignment_mode, auto_accept_online, service_table, service_car, service_pickup,
              timing_table, timing_car, timing_pickup, vat_rate_bp, prices_include_vat, kitchen_delay_minutes, updated_by)
  on public.ordering_settings to authenticated;
create policy ordering_settings_select on public.ordering_settings for select to authenticated
  using ((select private.is_active_member(restaurant_id)));
create policy ordering_settings_update on public.ordering_settings for update to authenticated
  using ((select private.has_permission(restaurant_id, 'settings.manage')))
  with check ((select private.has_permission(restaurant_id, 'settings.manage')));

-- Mode B: a table (or its section) has a responsible waiter.
alter table public.restaurant_tables add column assigned_waiter_id uuid references auth.users (id) on delete set null;

-- Waiter shifts per branch (spec §10: shift on/off). Mode C offers orders to waiters on shift.
create table public.waiter_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index waiter_shifts_open_uidx on public.waiter_shifts (user_id, branch_id) where ended_at is null;
create trigger tenant_write_guard before insert or update or delete on public.waiter_shifts
  for each row execute function private.guard_tenant_writable();
alter table public.waiter_shifts enable row level security;
alter table public.waiter_shifts force row level security;
revoke all on public.waiter_shifts from anon, authenticated;
grant select on public.waiter_shifts to authenticated;
create policy waiter_shifts_select on public.waiter_shifts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission(restaurant_id, 'orders.manage', branch_id)));

create or replace function private.on_shift(p_user_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.waiter_shifts where user_id = p_user_id and branch_id = p_branch_id and ended_at is null);
$$;

create or replace function public.set_shift(p_branch_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.branches;
begin
  select * into v_b from public.branches where id = p_branch_id;
  if v_b.id is null or not (private.has_permission(v_b.restaurant_id, 'orders.confirm_table', v_b.id)
                            or private.has_permission(v_b.restaurant_id, 'orders.manage', v_b.id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_on then
    insert into public.waiter_shifts (restaurant_id, branch_id, user_id) values (v_b.restaurant_id, v_b.id, auth.uid())
    on conflict do nothing;
  else
    update public.waiter_shifts set ended_at = now() where user_id = auth.uid() and branch_id = v_b.id and ended_at is null;
  end if;
  perform private.write_audit(v_b.restaurant_id, case when p_on then 'shift.started' else 'shift.ended' end,
                              'branch', v_b.id, null, null, v_b.id);
end;
$$;

grant execute on function public.set_shift(uuid, boolean) to authenticated;
