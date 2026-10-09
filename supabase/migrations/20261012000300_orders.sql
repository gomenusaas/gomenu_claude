-- Phase 5: one order engine for every source (website, general QR, table QR, waiter) and service
-- type (table, car, pickup) — spec §10. Prices, availability and totals are always computed here
-- from the current menu; the order keeps snapshots so later menu changes never rewrite it (§2).
-- Status and payment status are separate fields. Every change is recorded in order_events (the
-- order timeline / responsibility history) and broadcast for live screens.

create type public.order_status as enum ('new', 'confirmed', 'preparing', 'ready', 'served', 'completed',
                                         'rejected', 'cancelled', 'refunded');
create type public.order_payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded');
create type public.order_source as enum ('website', 'general_qr', 'table_qr', 'waiter');
create type public.reject_reason as enum ('not_at_table', 'invalid_qr', 'duplicate', 'customer_cancelled', 'other');

create table public.restaurant_counters (
  restaurant_id uuid primary key references public.restaurants (id) on delete restrict,
  last_order_number integer not null default 0
);
alter table public.restaurant_counters enable row level security;
alter table public.restaurant_counters force row level security;
revoke all on public.restaurant_counters from anon, authenticated;
create trigger tenant_write_guard before insert or update or delete on public.restaurant_counters
  for each row execute function private.guard_tenant_writable();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  branch_id uuid not null,
  number integer not null,
  -- Unguessable key: the diner's tracking link and live-status channel (no personal data exposed).
  public_key text not null unique check (public_key ~ '^[A-Za-z0-9_-]{22,64}$'),
  source public.order_source not null,
  service_type public.service_type not null,
  status public.order_status not null default 'new',
  payment_status public.order_payment_status not null default 'unpaid',
  payment_timing public.payment_timing not null,
  needs_confirmation boolean not null,
  table_id uuid,
  qr_code_id uuid references public.qr_codes (id),
  car_plate text check (car_plate is null or length(btrim(car_plate)) between 1 and 20),
  car_description text check (car_description is null or length(car_description) <= 120),
  customer_user_id uuid references auth.users (id) on delete set null,
  customer_name text check (customer_name is null or length(customer_name) <= 80),
  customer_phone text check (customer_phone is null or private.is_e164(customer_phone)),
  notes text check (notes is null or length(notes) <= 500),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  vat_rate_bp integer not null,
  prices_include_vat boolean not null,
  vat_minor bigint not null check (vat_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0 and refunded_minor <= total_minor),
  created_by uuid references auth.users (id) on delete set null,
  assigned_waiter_id uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  kitchen_released_at timestamptz,
  kitchen_alert boolean not null default false,   -- edited after preparation started
  preparing_at timestamptz,
  ready_at timestamptz,
  served_by uuid references auth.users (id) on delete set null,
  served_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  rejected_reason public.reject_reason,
  closed_note text check (closed_note is null or length(closed_note) <= 300),
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  unique (restaurant_id, number),
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id),
  foreign key (table_id, restaurant_id) references public.restaurant_tables (id, restaurant_id),
  check (service_type <> 'car' or car_plate is not null),
  check (service_type <> 'table' or table_id is not null),
  check ((status = 'rejected') = (rejected_reason is not null))
);
create index orders_branch_status_idx on public.orders (branch_id, status, created_at);
create index orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index orders_customer_idx on public.orders (customer_user_id, created_at desc) where customer_user_id is not null;
create trigger orders_set_updated_at before update on public.orders for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  item_id uuid,
  variant_id uuid,
  -- Snapshots (spec §2): what the diner ordered, at the price of the moment.
  name jsonb not null,
  variant_name jsonb,
  options jsonb not null default '[]',   -- [{group, name, price_delta_minor}]
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity between 1 and 50),
  line_total_minor bigint not null check (line_total_minor >= 0),
  notes text check (notes is null or length(notes) <= 200),
  sort integer not null default 0,
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id) on delete cascade,
  foreign key (item_id, restaurant_id) references public.menu_items (id, restaurant_id)
);
create index order_items_order_idx on public.order_items (order_id, sort);

create table public.order_events (
  id bigint generated by default as identity primary key,
  order_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  type text not null check (type ~ '^[a-z_]+$'),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id) on delete cascade
);
create index order_events_order_idx on public.order_events (order_id, id);

-- The timeline is append-only.
create or replace function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger order_events_append_only before update or delete on public.order_events
  for each row when (current_setting('gomenu.allow_cascade', true) is distinct from 'on')
  execute function private.forbid_change();

do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'order_events'] loop
    execute format('create trigger tenant_write_guard before insert or update or delete on public.%I
                    for each row execute function private.guard_tenant_writable()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
create trigger orders_immutable_tenant before update on public.orders
  for each row execute function private.guard_tenant_immutable();

-- Staff read orders of their branches; kitchen staff only once released to the kitchen (unconfirmed
-- orders never reach it, spec §10); a signed-in diner reads their own orders. All writes go
-- through the functions below.
create policy orders_select on public.orders for select to authenticated
  using ((select private.has_permission(restaurant_id, 'orders.view', branch_id))
         or (kitchen_released_at is not null and (select private.has_permission(restaurant_id, 'kitchen.access', branch_id)))
         or customer_user_id = (select auth.uid()));
create policy order_items_select on public.order_items for select to authenticated
  using ((select private.has_permission(restaurant_id, 'orders.view', branch_id))
         or exists (select 1 from public.orders o where o.id = order_id
                     and (o.customer_user_id = (select auth.uid())
                          or (o.kitchen_released_at is not null
                              and (select private.has_permission(o.restaurant_id, 'kitchen.access', o.branch_id))))));
create policy order_events_select on public.order_events for select to authenticated
  using ((select private.has_permission(restaurant_id, 'orders.view', branch_id)));

-- --- Helpers ---------------------------------------------------------------------------------

create or replace function private.actor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select full_name from public.profiles where id = auth.uid();
$$;

create or replace function private.add_order_event(p_order public.orders, p_type text, p_data jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_events (order_id, restaurant_id, branch_id, type, actor_user_id, actor_name, data)
  values (p_order.id, p_order.restaurant_id, p_order.branch_id, p_type, auth.uid(), private.actor_name(), coalesce(p_data, '{}'));
$$;

/**
 * Validate requested lines against the CURRENT menu and price them. Input:
 * [{item_id, variant_id?, option_ids?: [], quantity, notes?}]. Returns
 * {lines: [...snapshot rows...], subtotal_minor}. Raises 22023 with a hint the UI can show.
 */
create or replace function private.price_lines(p_restaurant_id uuid, p_branch_id uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_item public.menu_items;
  v_variant public.menu_item_variants;
  v_group record;
  v_option public.menu_options;
  v_option_ids uuid[];
  v_qty integer;
  v_unit bigint;
  v_opts jsonb;
  v_lines jsonb := '[]';
  v_subtotal bigint := 0;
  v_sort integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'the order is empty' using errcode = '22023', hint = 'EMPTY_ORDER';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'too many lines' using errcode = '22023', hint = 'TOO_MANY_LINES';
  end if;
  for v_line in select * from jsonb_array_elements(p_items) loop
    select i.* into v_item from public.menu_items i
      join public.menu_categories c on c.id = i.category_id
     where i.id = (v_line ->> 'item_id')::uuid and i.restaurant_id = p_restaurant_id
       and i.is_active and i.archived_at is null and c.is_active and c.archived_at is null;
    if v_item.id is null then
      raise exception 'an item is no longer on the menu' using errcode = '22023', hint = 'ITEM_UNAVAILABLE';
    end if;
    if not v_item.is_available or exists (
         select 1 from public.branch_menu_overrides o
          where o.branch_id = p_branch_id and (o.item_id = v_item.id or o.category_id = v_item.category_id)
            and (o.is_hidden or not o.is_available)) then
      raise exception '% is sold out', v_item.name ->> 'en' using errcode = '22023', hint = 'ITEM_UNAVAILABLE';
    end if;
    v_qty := coalesce((v_line ->> 'quantity')::integer, 1);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'quantity must be 1–50' using errcode = '22023', hint = 'BAD_QUANTITY';
    end if;

    v_variant := null;
    if v_line ? 'variant_id' and v_line ->> 'variant_id' is not null then
      select * into v_variant from public.menu_item_variants
       where id = (v_line ->> 'variant_id')::uuid and item_id = v_item.id and archived_at is null;
      if v_variant.id is null then
        raise exception 'that size is not available' using errcode = '22023', hint = 'VARIANT_UNAVAILABLE';
      end if;
    elsif exists (select 1 from public.menu_item_variants where item_id = v_item.id and archived_at is null) then
      select * into v_variant from public.menu_item_variants where item_id = v_item.id and archived_at is null
       order by is_default desc, sort limit 1;
    end if;
    v_unit := coalesce(v_variant.price_minor, v_item.price_minor);

    v_option_ids := coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(coalesce(v_line -> 'option_ids', '[]'))), '{}');
    v_opts := '[]';
    for v_group in select g.* from public.menu_option_groups g where g.item_id = v_item.id and g.archived_at is null loop
      declare
        v_count integer := 0;
      begin
        for v_option in select o.* from public.menu_options o
                         where o.group_id = v_group.id and o.archived_at is null and o.id = any (v_option_ids) loop
          if not v_option.is_available then
            raise exception 'an option is not available' using errcode = '22023', hint = 'OPTION_UNAVAILABLE';
          end if;
          v_count := v_count + 1;
          v_unit := v_unit + v_option.price_delta_minor;
          v_opts := v_opts || jsonb_build_object('group', v_group.name, 'name', v_option.name,
                                                 'price_delta_minor', v_option.price_delta_minor);
        end loop;
        if v_count < v_group.min_select or (v_group.max_select is not null and v_count > v_group.max_select) then
          raise exception 'choose the required options' using errcode = '22023', hint = 'OPTIONS_REQUIRED';
        end if;
      end;
    end loop;
    if jsonb_array_length(v_opts) <> coalesce(array_length(v_option_ids, 1), 0) then
      raise exception 'an option does not belong to this item' using errcode = '22023', hint = 'OPTION_UNAVAILABLE';
    end if;

    v_sort := v_sort + 1;
    v_lines := v_lines || jsonb_build_object(
      'item_id', v_item.id, 'variant_id', v_variant.id, 'name', v_item.name, 'variant_name', v_variant.name,
      'options', v_opts, 'unit_price_minor', v_unit, 'quantity', v_qty, 'line_total_minor', v_unit * v_qty,
      'notes', nullif(left(btrim(coalesce(v_line ->> 'notes', '')), 200), ''), 'sort', v_sort);
    v_subtotal := v_subtotal + v_unit * v_qty;
  end loop;
  return jsonb_build_object('lines', v_lines, 'subtotal_minor', v_subtotal);
end;
$$;

-- VAT per restaurant (decision P5): included in prices by default.
create or replace function private.order_totals(p_subtotal bigint, p_rate_bp integer, p_inclusive boolean)
returns table (vat_minor bigint, total_minor bigint)
language sql
immutable
set search_path = ''
as $$
  select case when p_inclusive then round(p_subtotal * p_rate_bp::numeric / (10000 + p_rate_bp))::bigint
              else round(p_subtotal * p_rate_bp::numeric / 10000)::bigint end,
         case when p_inclusive then p_subtotal else p_subtotal + round(p_subtotal * p_rate_bp::numeric / 10000)::bigint end;
$$;

create or replace function private.write_order_lines(p_order public.orders, p_lines jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_items (order_id, restaurant_id, branch_id, item_id, variant_id, name, variant_name, options,
                                  unit_price_minor, quantity, line_total_minor, notes, sort)
  select p_order.id, p_order.restaurant_id, p_order.branch_id, (l ->> 'item_id')::uuid, (l ->> 'variant_id')::uuid,
         l -> 'name', nullif(l -> 'variant_name', 'null'::jsonb), l -> 'options', (l ->> 'unit_price_minor')::bigint,
         (l ->> 'quantity')::integer, (l ->> 'line_total_minor')::bigint, l ->> 'notes', (l ->> 'sort')::integer
    from jsonb_array_elements(p_lines) l;
$$;

/** Confirmed and (pays after, or paid) → the kitchen gets it. Idempotent. */
create or replace function private.release_if_ready(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.status = 'confirmed' and v_o.kitchen_released_at is null
     and (v_o.payment_timing = 'after' or v_o.payment_status = 'paid') then
    update public.orders set kitchen_released_at = now() where id = v_o.id;
    perform private.add_order_event(v_o, 'sent_to_kitchen');
  end if;
end;
$$;

create or replace function private.next_order_number(p_restaurant_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.restaurant_counters (restaurant_id, last_order_number) values (p_restaurant_id, 1)
  on conflict (restaurant_id) do update set last_order_number = public.restaurant_counters.last_order_number + 1
  returning last_order_number;
$$;

create or replace function private.order_for_update(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then
    raise exception 'order not found' using errcode = '42501';
  end if;
  return v_o;
end;
$$;

-- --- Placing orders ---------------------------------------------------------------------------

/**
 * Diners (guests or signed in) place orders from the website or a QR code. Table context comes
 * only from a QR token resolved here, never from ids sent by the browser.
 * Payload: {branch_id, service_type, qr_token?, car_plate?, car_description?, customer_name?,
 *           customer_phone?, notes?, items: [...]}
 */
create or replace function public.place_order(p_restaurant_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.ordering_settings;
  v_w public.website_settings;
  v_r public.restaurants;
  v_qr public.qr_codes;
  v_table public.restaurant_tables;
  v_branch uuid := (p_payload ->> 'branch_id')::uuid;
  v_service public.service_type := (p_payload ->> 'service_type')::public.service_type;
  v_source public.order_source := 'website';
  v_priced jsonb;
  v_totals record;
  v_needs boolean;
  v_o public.orders;
  v_waiter uuid;
begin
  select * into v_r from public.restaurants where id = p_restaurant_id;
  select * into v_w from public.website_settings where restaurant_id = p_restaurant_id;
  select * into v_s from public.ordering_settings where restaurant_id = p_restaurant_id;
  if v_r.id is null or not private.restaurant_publicly_available(v_r.id) or not coalesce(v_w.is_published, false)
     or not coalesce(v_w.ordering_enabled, false) or not private.has_feature(v_r.id, 'ordering') then
    raise exception 'this restaurant is not taking online orders' using errcode = '22023', hint = 'ORDERING_OFF';
  end if;

  if p_payload ? 'qr_token' and p_payload ->> 'qr_token' is not null then
    select * into v_qr from public.qr_codes where token = p_payload ->> 'qr_token' and restaurant_id = v_r.id
      and is_active and revoked_at is null;
    if v_qr.id is null then
      raise exception 'this QR code is no longer active' using errcode = '22023', hint = 'QR_INVALID';
    end if;
    if v_qr.kind = 'table' then
      select * into v_table from public.restaurant_tables where id = v_qr.table_id and is_active and archived_at is null;
      if v_table.id is null then
        raise exception 'this table is not active' using errcode = '22023', hint = 'QR_INVALID';
      end if;
      v_source := 'table_qr';
      v_branch := v_table.branch_id;
    else
      v_source := 'general_qr';
    end if;
  end if;

  if v_service = 'table' and v_table.id is null then
    raise exception 'scan the QR code on your table to order to it' using errcode = '22023', hint = 'TABLE_NEEDS_QR';
  end if;
  if (v_service = 'table' and not v_s.service_table) or (v_service = 'car' and not v_s.service_car)
     or (v_service = 'pickup' and not v_s.service_pickup) then
    raise exception 'this service is not offered' using errcode = '22023', hint = 'SERVICE_OFF';
  end if;
  if not exists (select 1 from public.branches where id = v_branch and restaurant_id = v_r.id and is_active and archived_at is null) then
    raise exception 'choose a branch' using errcode = '22023', hint = 'BRANCH_REQUIRED';
  end if;
  if not private.branch_is_open(v_branch) then
    raise exception 'this branch is closed right now' using errcode = '22023', hint = 'BRANCH_CLOSED';
  end if;
  if v_service = 'car' and coalesce(btrim(p_payload ->> 'car_plate'), '') = '' then
    raise exception 'enter your car plate' using errcode = '22023', hint = 'PLATE_REQUIRED';
  end if;

  v_priced := private.price_lines(v_r.id, v_branch, p_payload -> 'items');
  select * into v_totals from private.order_totals((v_priced ->> 'subtotal_minor')::bigint, v_s.vat_rate_bp, v_s.prices_include_vat);

  v_needs := case when v_service = 'table' then v_s.waiter_confirmation and v_s.assignment_mode <> 'none'
                  else not v_s.auto_accept_online end;
  v_waiter := case when v_service = 'table' and v_s.assignment_mode = 'table' then v_table.assigned_waiter_id end;

  insert into public.orders (restaurant_id, branch_id, number, public_key, source, service_type, status, payment_timing,
                             needs_confirmation, table_id, qr_code_id, car_plate, car_description, customer_user_id,
                             customer_name, customer_phone, notes, currency, subtotal_minor, vat_rate_bp, prices_include_vat,
                             vat_minor, total_minor, created_by, assigned_waiter_id, confirmed_at)
  values (v_r.id, v_branch, private.next_order_number(v_r.id), private.new_qr_token(), v_source, v_service,
          (case when v_needs then 'new' else 'confirmed' end)::public.order_status,
          case v_service when 'table' then v_s.timing_table when 'car' then v_s.timing_car else v_s.timing_pickup end,
          v_needs, v_table.id, v_qr.id, nullif(upper(btrim(p_payload ->> 'car_plate')), ''),
          nullif(btrim(p_payload ->> 'car_description'), ''), auth.uid(),
          nullif(left(btrim(coalesce(p_payload ->> 'customer_name', '')), 80), ''),
          nullif(btrim(coalesce(p_payload ->> 'customer_phone', '')), ''),
          nullif(left(btrim(coalesce(p_payload ->> 'notes', '')), 500), ''), v_r.currency,
          (v_priced ->> 'subtotal_minor')::bigint, v_s.vat_rate_bp, v_s.prices_include_vat, v_totals.vat_minor,
          v_totals.total_minor, auth.uid(), v_waiter, case when not v_needs then now() end)
  returning * into v_o;
  perform private.write_order_lines(v_o, v_priced -> 'lines');
  perform private.add_order_event(v_o, 'placed', jsonb_build_object('source', v_source, 'service_type', v_service,
                                                                    'qr_code_id', v_qr.id, 'table', v_table.label));
  if v_waiter is not null then
    perform private.add_order_event(v_o, 'assigned', jsonb_build_object('waiter_id', v_waiter, 'by', 'table'));
  end if;
  perform private.release_if_ready(v_o.id);
  perform public.track_event(v_r.id, 'order_created', null, v_o.id, v_branch, v_qr.id);
  return jsonb_build_object('order_id', v_o.id, 'public_key', v_o.public_key, 'number', v_o.number);
end;
$$;

/** Waiter-created orders (spec §10): table or car (plate required); the creator is responsible. */
create or replace function public.create_waiter_order(p_branch_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.branches;
  v_s public.ordering_settings;
  v_service public.service_type := (p_payload ->> 'service_type')::public.service_type;
  v_table public.restaurant_tables;
  v_priced jsonb;
  v_totals record;
  v_o public.orders;
begin
  select * into v_b from public.branches where id = p_branch_id and archived_at is null;
  if v_b.id is null or not private.has_permission(v_b.restaurant_id, 'orders.create_waiter', v_b.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.restaurant_writable(v_b.restaurant_id) then
    raise exception 'this restaurant''s account is not active' using errcode = '42501';
  end if;
  select * into v_s from public.ordering_settings where restaurant_id = v_b.restaurant_id;
  if v_service not in ('table', 'car') then
    raise exception 'waiter orders are for a table or a car' using errcode = '22023', hint = 'SERVICE_OFF';
  end if;
  if v_service = 'table' then
    select * into v_table from public.restaurant_tables
     where id = (p_payload ->> 'table_id')::uuid and branch_id = v_b.id and archived_at is null;
    if v_table.id is null then
      raise exception 'choose a table' using errcode = '22023', hint = 'TABLE_REQUIRED';
    end if;
  elsif coalesce(btrim(p_payload ->> 'car_plate'), '') = '' then
    raise exception 'enter the car plate' using errcode = '22023', hint = 'PLATE_REQUIRED';
  end if;
  v_priced := private.price_lines(v_b.restaurant_id, v_b.id, p_payload -> 'items');
  select * into v_totals from private.order_totals((v_priced ->> 'subtotal_minor')::bigint, v_s.vat_rate_bp, v_s.prices_include_vat);
  insert into public.orders (restaurant_id, branch_id, number, public_key, source, service_type, status, payment_timing,
                             needs_confirmation, table_id, car_plate, car_description, customer_name, notes, currency,
                             subtotal_minor, vat_rate_bp, prices_include_vat, vat_minor, total_minor, created_by,
                             assigned_waiter_id, confirmed_by, confirmed_at)
  values (v_b.restaurant_id, v_b.id, private.next_order_number(v_b.restaurant_id), private.new_qr_token(), 'waiter', v_service,
          'confirmed', case v_service when 'table' then v_s.timing_table else v_s.timing_car end, false, v_table.id,
          nullif(upper(btrim(p_payload ->> 'car_plate')), ''), nullif(btrim(p_payload ->> 'car_description'), ''),
          nullif(left(btrim(coalesce(p_payload ->> 'customer_name', '')), 80), ''),
          nullif(left(btrim(coalesce(p_payload ->> 'notes', '')), 500), ''),
          (select currency from public.restaurants where id = v_b.restaurant_id),
          (v_priced ->> 'subtotal_minor')::bigint, v_s.vat_rate_bp, v_s.prices_include_vat, v_totals.vat_minor,
          v_totals.total_minor, auth.uid(), auth.uid(), auth.uid(), now())
  returning * into v_o;
  perform private.write_order_lines(v_o, v_priced -> 'lines');
  perform private.add_order_event(v_o, 'placed', jsonb_build_object('source', 'waiter', 'service_type', v_service,
                                                                    'table', v_table.label, 'car_plate', v_o.car_plate));
  perform private.release_if_ready(v_o.id);
  perform private.write_audit(v_o.restaurant_id, 'order.created_by_waiter', 'order', v_o.id, null,
                              jsonb_build_object('number', v_o.number, 'total_minor', v_o.total_minor), v_o.branch_id);
  return jsonb_build_object('order_id', v_o.id, 'public_key', v_o.public_key, 'number', v_o.number);
end;
$$;

-- --- Diner tracking (guest or signed in) -------------------------------------------------------

/** Online payment is possible now (spec §10: only after confirmation when confirmation is required). */
create or replace function private.order_payable(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select o.status not in ('rejected', 'cancelled', 'refunded', 'completed')
     and o.payment_status in ('unpaid', 'failed')
     and (not o.needs_confirmation or o.confirmed_at is not null)
     and o.total_minor > 0
    from public.orders o where o.id = p_order_id;
$$;

/** Status, items and totals for the tracking page. No phone numbers or staff details. */
create or replace function public.track_order(p_public_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'restaurant_id', o.restaurant_id, 'restaurant_name', r.name, 'slug', r.slug,
    'branch_name', b.name, 'service_type', o.service_type, 'table_label', t.label, 'car_plate', o.car_plate,
    'status', o.status, 'payment_status', o.payment_status, 'payment_timing', o.payment_timing,
    'needs_confirmation', o.needs_confirmation, 'confirmed', o.confirmed_at is not null,
    'sent_to_kitchen', o.kitchen_released_at is not null, 'currency', o.currency, 'subtotal_minor', o.subtotal_minor,
    'vat_minor', o.vat_minor, 'vat_rate_bp', o.vat_rate_bp, 'prices_include_vat', o.prices_include_vat,
    'total_minor', o.total_minor, 'refunded_minor', o.refunded_minor, 'notes', o.notes, 'created_at', o.created_at,
    'rejected_reason', o.rejected_reason, 'default_locale', r.default_locale,
    'can_pay', private.order_payable(o.id), 'can_cancel', o.status = 'new' and o.payment_status in ('unpaid', 'failed'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'variant_name', i.variant_name, 'options', i.options,
                'quantity', i.quantity, 'line_total_minor', i.line_total_minor, 'notes', i.notes) order by i.sort), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('type', e.type, 'at', e.created_at) order by e.id), '[]'::jsonb)
                   from public.order_events e where e.order_id = o.id
                    and e.type in ('placed', 'confirmed', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'completed',
                                   'rejected', 'cancelled', 'paid', 'refunded')))
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    join public.branches b on b.id = o.branch_id
    left join public.restaurant_tables t on t.id = o.table_id
   where o.public_key = p_public_key;
$$;

/** A diner cancels before the restaurant confirmed and before paying. */
create or replace function public.cancel_my_order(p_public_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where public_key = p_public_key for update;
  if v_o.id is null or v_o.status <> 'new' or v_o.payment_status not in ('unpaid', 'failed') then
    raise exception 'this order can no longer be cancelled here; please ask the staff' using errcode = '22023', hint = 'TOO_LATE';
  end if;
  perform set_config('gomenu.system_action', 'on', true);
  update public.orders set status = 'cancelled', closed_at = now(), closed_note = 'cancelled by the customer' where id = v_o.id;
  perform set_config('gomenu.system_action', 'off', true);
  perform private.add_order_event(v_o, 'cancelled', jsonb_build_object('by', 'customer'));
end;
$$;

-- --- Staff actions -------------------------------------------------------------------------------

create or replace function private.require_order_permission(p_o public.orders, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_o.restaurant_id, p_permission, p_o.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.restaurant_writable(p_o.restaurant_id) then
    raise exception 'this restaurant''s account is not active' using errcode = '42501';
  end if;
end;
$$;

/**
 * A waiter may confirm or reject a table order when it is theirs, or (mode C) when it is still
 * open and they are on shift in its branch. Managers (orders.manage) may always.
 */
create or replace function private.may_handle_table_order(p_o public.orders)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_o.assigned_waiter_id = auth.uid()
      or private.has_permission(p_o.restaurant_id, 'orders.manage', p_o.branch_id)
      or (p_o.assigned_waiter_id is null and private.on_shift(auth.uid(), p_o.branch_id)
          and (select assignment_mode from public.ordering_settings where restaurant_id = p_o.restaurant_id) = 'open');
$$;

/** Mode C: a waiter on shift takes an open order. First to accept wins (atomic). */
create or replace function public.accept_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id;
  if v_o.id is null then raise exception 'order not found' using errcode = '42501'; end if;
  perform private.require_order_permission(v_o, 'orders.confirm_table');
  if not private.on_shift(auth.uid(), v_o.branch_id) then
    raise exception 'start your shift in this branch first' using errcode = '22023', hint = 'NOT_ON_SHIFT';
  end if;
  update public.orders set assigned_waiter_id = auth.uid()
   where id = p_order_id and assigned_waiter_id is null and status = 'new'
  returning * into v_o;
  if v_o.id is null then
    raise exception 'another waiter already accepted this order' using errcode = '22023', hint = 'ALREADY_ACCEPTED';
  end if;
  perform private.add_order_event(v_o, 'accepted', jsonb_build_object('waiter_id', auth.uid()));
end;
$$;

/** The waiter verified the table (table orders) or staff accepted an online order. */
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  if v_o.service_type = 'table' then
    perform private.require_order_permission(v_o, 'orders.confirm_table');
    if not private.may_handle_table_order(v_o) then
      raise exception 'accept the order before confirming it' using errcode = '22023', hint = 'NOT_ASSIGNED';
    end if;
  else
    perform private.require_order_permission(v_o, 'orders.manage');
  end if;
  if v_o.status <> 'new' then
    raise exception 'this order is already %', v_o.status using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  update public.orders set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
         assigned_waiter_id = coalesce(assigned_waiter_id, case when v_o.service_type = 'table' then auth.uid() end)
   where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, 'confirmed');
  perform private.release_if_ready(v_o.id);
end;
$$;

/** Rejected orders produce no kitchen ticket, sale, loyalty, incentive or income (spec §10). */
create or replace function public.reject_order(p_order_id uuid, p_reason public.reject_reason, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  if v_o.service_type = 'table' and private.may_handle_table_order(v_o) then
    perform private.require_order_permission(v_o, 'orders.confirm_table');
  else
    perform private.require_order_permission(v_o, 'orders.manage');
  end if;
  if v_o.status <> 'new' or v_o.payment_status not in ('unpaid', 'failed') then
    raise exception 'only unconfirmed, unpaid orders can be rejected; cancel instead' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  update public.orders set status = 'rejected', rejected_reason = p_reason, closed_note = nullif(left(btrim(p_note), 300), ''),
         closed_by = auth.uid(), closed_at = now() where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, 'rejected', jsonb_build_object('reason', p_reason, 'note', p_note));
  perform private.write_audit(v_o.restaurant_id, 'order.rejected', 'order', v_o.id, null,
                              jsonb_build_object('reason', p_reason, 'note', p_note), v_o.branch_id);
end;
$$;

/** Managers assign, reassign, unassign (null) or take over (themselves). History is kept. */
create or replace function public.assign_order(p_order_id uuid, p_waiter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
  v_before uuid := v_o.assigned_waiter_id;
begin
  perform private.require_order_permission(v_o, 'orders.manage');
  if v_o.status in ('completed', 'rejected', 'cancelled', 'refunded') then
    raise exception 'this order is closed' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  if p_waiter_id is not null and not exists (
       select 1 from public.memberships m where m.user_id = p_waiter_id and m.restaurant_id = v_o.restaurant_id
          and m.status = 'active' and (m.branch_scope = 'all' or exists (
            select 1 from public.membership_branches mb where mb.membership_id = m.id and mb.branch_id = v_o.branch_id))) then
    raise exception 'this person does not work in this branch' using errcode = '22023', hint = 'NOT_IN_BRANCH';
  end if;
  update public.orders set assigned_waiter_id = p_waiter_id where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, case when p_waiter_id is null then 'unassigned'
                                            when p_waiter_id = auth.uid() then 'taken_over' else 'assigned' end,
                                  jsonb_build_object('from', v_before, 'to', p_waiter_id));
  perform private.write_audit(v_o.restaurant_id, 'order.assigned', 'order', v_o.id,
                              jsonb_build_object('waiter_id', v_before), jsonb_build_object('waiter_id', p_waiter_id), v_o.branch_id);
end;
$$;

/** Kitchen display: New → Preparing → Ready (Ready notifies the waiter via the live channel). */
create or replace function public.kitchen_update(p_order_id uuid, p_status public.order_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  perform private.require_order_permission(v_o, 'kitchen.access');
  if v_o.kitchen_released_at is null then
    raise exception 'this order has not been sent to the kitchen' using errcode = '22023', hint = 'NOT_RELEASED';
  end if;
  if not ((p_status = 'preparing' and v_o.status = 'confirmed') or (p_status = 'ready' and v_o.status = 'preparing')) then
    raise exception 'cannot move from % to %', v_o.status, p_status using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  update public.orders set status = p_status, kitchen_alert = false,
         preparing_at = case when p_status = 'preparing' then now() else preparing_at end,
         ready_at = case when p_status = 'ready' then now() else ready_at end
   where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, p_status::text);
end;
$$;

create or replace function public.acknowledge_kitchen_alert(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  perform private.require_order_permission(v_o, 'kitchen.access');
  update public.orders set kitchen_alert = false where id = v_o.id;
  perform private.add_order_event(v_o, 'kitchen_acknowledged_edit');
end;
$$;

create or replace function public.mark_served(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  if v_o.assigned_waiter_id = auth.uid() then
    perform private.require_order_permission(v_o, 'orders.view');
  else
    perform private.require_order_permission(v_o, 'orders.manage');
  end if;
  if v_o.status <> 'ready' then
    raise exception 'the order is not ready yet' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  update public.orders set status = 'served', served_by = auth.uid(), served_at = now() where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, 'served');
end;
$$;

create or replace function public.complete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  if v_o.assigned_waiter_id = auth.uid() then
    perform private.require_order_permission(v_o, 'orders.view');
  else
    perform private.require_order_permission(v_o, 'orders.manage');
  end if;
  if v_o.status not in ('served', 'ready') then
    raise exception 'serve the order first' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  if v_o.payment_status <> 'paid' then
    raise exception 'record the payment before completing' using errcode = '22023', hint = 'UNPAID';
  end if;
  update public.orders set status = 'completed', completed_by = auth.uid(), completed_at = now(),
         served_by = coalesce(served_by, auth.uid()), served_at = coalesce(served_at, now())
   where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, 'completed');
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  perform private.require_order_permission(v_o, 'orders.manage');
  if v_o.status in ('completed', 'rejected', 'cancelled', 'refunded') then
    raise exception 'this order is closed' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'give a reason' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;
  update public.orders set status = 'cancelled', closed_by = auth.uid(), closed_at = now(), closed_note = left(btrim(p_note), 300)
   where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, 'cancelled', jsonb_build_object('note', p_note));
  perform private.write_audit(v_o.restaurant_id, 'order.cancelled', 'order', v_o.id, null,
                              jsonb_build_object('note', p_note, 'payment_status', v_o.payment_status), v_o.branch_id);
end;
$$;

/**
 * Change the lines of an unpaid order. Before preparation: a normal edit. After preparation
 * started: controlled — managers or the responsible waiter only, audited before/after, and the
 * kitchen gets an alert (spec §10).
 */
create or replace function public.edit_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
  v_s public.ordering_settings;
  v_before jsonb;
  v_priced jsonb;
  v_totals record;
  v_after_start boolean;
begin
  if v_o.assigned_waiter_id = auth.uid() or v_o.created_by = auth.uid() then
    perform private.require_order_permission(v_o, 'orders.create_waiter');
  else
    perform private.require_order_permission(v_o, 'orders.manage');
  end if;
  if v_o.status not in ('new', 'confirmed', 'preparing', 'ready') or v_o.payment_status not in ('unpaid', 'failed') then
    raise exception 'paid or closed orders cannot be edited' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  v_after_start := v_o.status in ('preparing', 'ready');
  select * into v_s from public.ordering_settings where restaurant_id = v_o.restaurant_id;
  select jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'line_total_minor', line_total_minor) order by sort)
    into v_before from public.order_items where order_id = v_o.id;
  v_priced := private.price_lines(v_o.restaurant_id, v_o.branch_id, p_items);
  select * into v_totals from private.order_totals((v_priced ->> 'subtotal_minor')::bigint, v_o.vat_rate_bp, v_o.prices_include_vat);
  delete from public.order_items where order_id = v_o.id;
  perform private.write_order_lines(v_o, v_priced -> 'lines');
  update public.orders set subtotal_minor = (v_priced ->> 'subtotal_minor')::bigint, vat_minor = v_totals.vat_minor,
         total_minor = v_totals.total_minor, kitchen_alert = v_after_start or kitchen_alert
   where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, case when v_after_start then 'edited_after_start' else 'edited' end,
    jsonb_build_object('before', v_before, 'after', (select jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity,
      'line_total_minor', line_total_minor) order by sort) from public.order_items where order_id = v_o.id)));
  if v_after_start then
    perform private.write_audit(v_o.restaurant_id, 'order.edited_after_start', 'order', v_o.id,
                                jsonb_build_object('items', v_before), jsonb_build_object('total_minor', v_o.total_minor), v_o.branch_id);
  end if;
end;
$$;

create or replace function public.mark_test_order(p_order_id uuid, p_is_test boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
begin
  perform private.require_order_permission(v_o, 'orders.manage');
  update public.orders set is_test = p_is_test where id = v_o.id returning * into v_o;
  perform private.add_order_event(v_o, 'marked_test', jsonb_build_object('is_test', p_is_test));
end;
$$;

-- --- Live updates (spec §2: Realtime only where live sync matters) ------------------------------
-- Staff screens: a private per-branch channel (membership checked by realtime_topic_allowed).
-- Diners: a public channel named after the order's unguessable key, carrying the status only.
-- Both carry no personal data; screens re-read the order through RLS / track_order.
create or replace function private.broadcast_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('order_id', new.id, 'status', new.status, 'payment_status', new.payment_status),
                        'order', 'restaurant:' || new.restaurant_id || ':branch:' || new.branch_id, true);
  perform realtime.send(jsonb_build_object('status', new.status, 'payment_status', new.payment_status),
                        'status', 'order:' || new.public_key, false);
  return new;
exception when others then
  return new;  -- live updates must never block an order
end;
$$;
create trigger orders_broadcast after insert or update on public.orders
  for each row execute function private.broadcast_order();

grant execute on function public.place_order(uuid, jsonb) to anon, authenticated;
grant execute on function public.track_order(text) to anon, authenticated;
grant execute on function public.cancel_my_order(text) to anon, authenticated;
grant execute on function public.create_waiter_order(uuid, jsonb) to authenticated;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.reject_order(uuid, public.reject_reason, text) to authenticated;
grant execute on function public.assign_order(uuid, uuid) to authenticated;
grant execute on function public.kitchen_update(uuid, public.order_status) to authenticated;
grant execute on function public.acknowledge_kitchen_alert(uuid) to authenticated;
grant execute on function public.mark_served(uuid) to authenticated;
grant execute on function public.complete_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.edit_order_items(uuid, jsonb) to authenticated;
grant execute on function public.mark_test_order(uuid, boolean) to authenticated;
