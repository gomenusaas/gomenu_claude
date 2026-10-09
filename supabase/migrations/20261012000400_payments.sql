-- Phase 5: payments (spec §11). Decision P5: the launch gateway is decided later, so the engine
-- ships with a built-in test gateway; real gateways plug in as adapters. Each restaurant connects
-- its own merchant account (funds settle to the restaurant). Online payment success is accepted
-- ONLY from a verified, idempotent webhook (apply_payment_event, service role), never from the
-- browser. Offline payments (cash, card at the restaurant) are recorded by staff.

create type public.gateway_status as enum ('draft', 'testing', 'active', 'disabled', 'retired');
create type public.gateway_environment as enum ('sandbox', 'production');
create type public.connection_status as enum ('not_connected', 'connected', 'verification_required', 'error', 'disabled');
create type public.order_payment_method as enum ('online', 'cash', 'card_at_restaurant');
create type public.payment_record_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.refund_status as enum ('pending', 'succeeded', 'failed');

insert into public.platform_settings (key, value, description) values
  ('testing_gateways_visible', 'false',
   'Restaurants may connect gateways in Testing status (development and demo environments only)');

-- --- Platform gateway catalogue (global) ----------------------------------------------------------
create table public.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- The adapter that talks to the provider (app code). 'test' is GoMenu's built-in simulator.
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,40}$'),
  environment public.gateway_environment not null default 'sandbox',
  countries text[] not null default '{}',   -- empty = every market
  currencies text[] not null default '{}',
  methods text[] not null default '{card}',
  status public.gateway_status not null default 'draft',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_gateways_set_updated_at before update on public.payment_gateways
  for each row execute function private.set_updated_at();
alter table public.payment_gateways enable row level security;
alter table public.payment_gateways force row level security;
revoke all on public.payment_gateways from anon, authenticated;
-- No client grants: restaurants see eligible gateways through list_payment_gateways().

insert into public.payment_gateways (key, name, provider, environment, countries, currencies, methods, status, sort) values
  ('test', 'GoMenu test gateway', 'test', 'sandbox', '{OM}', '{OMR}', '{card,apple_pay,google_pay}', 'testing', 0);

-- Commercial terms GoMenu negotiated with a gateway: platform-private (spec §11).
create table private.gateway_terms (
  gateway_id uuid primary key references public.payment_gateways (id) on delete cascade,
  terms jsonb not null default '{}',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- --- Restaurant connections --------------------------------------------------------------------
create table public.payment_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  gateway_id uuid not null references public.payment_gateways (id),
  status public.connection_status not null default 'not_connected',
  -- Non-secret settings shown back to the owner (e.g. merchant id, last 4 of the key).
  public_config jsonb not null default '{}',
  last_error text check (last_error is null or length(last_error) <= 300),
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, gateway_id),
  unique (id, restaurant_id)
);
create trigger payment_connections_set_updated_at before update on public.payment_connections
  for each row execute function private.set_updated_at();

-- Credentials (API keys, webhook signing secret) encrypted by the app (AES-256-GCM, key held only
-- by the server). Clients can never read this table.
create table private.payment_connection_secrets (
  connection_id uuid primary key references public.payment_connections (id) on delete cascade,
  secret_ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- --- Payments, refunds, webhook log -------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  order_id uuid not null,
  connection_id uuid,
  method public.order_payment_method not null,
  status public.payment_record_status not null default 'pending',
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0 and refunded_minor <= amount_minor),
  provider_reference text check (provider_reference is null or length(provider_reference) <= 120),
  reference text check (reference is null or length(reference) <= 120),   -- staff note / receipt no.
  failure_reason text check (failure_reason is null or length(failure_reason) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id),
  foreign key (connection_id, restaurant_id) references public.payment_connections (id, restaurant_id),
  check ((method = 'online') = (connection_id is not null))
);
create index payments_order_idx on public.payments (order_id, created_at);
create trigger payments_set_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  order_id uuid not null,
  payment_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  status public.refund_status not null default 'pending',
  provider_reference text check (provider_reference is null or length(provider_reference) <= 120),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (payment_id, restaurant_id) references public.payments (id, restaurant_id)
);
create index payment_refunds_payment_idx on public.payment_refunds (payment_id);

-- Every verified webhook, once (unique per gateway + provider event id): replays are no-ops.
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  gateway_id uuid not null references public.payment_gateways (id),
  event_id text not null check (length(event_id) between 1 and 200),
  type text not null check (length(type) between 1 and 60),
  payload jsonb not null,
  result text not null,
  received_at timestamptz not null default now(),
  unique (gateway_id, event_id)
);

do $$
declare t text;
begin
  foreach t in array array['payment_connections', 'payments', 'payment_refunds'] loop
    execute format('create trigger tenant_write_guard before insert or update or delete on public.%I
                    for each row execute function private.guard_tenant_writable()', t);
  end loop;
  foreach t in array array['payment_connections', 'payments', 'payment_refunds', 'payment_webhook_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
create trigger payments_immutable_tenant before update on public.payments
  for each row execute function private.guard_tenant_immutable();

-- Owners (payments.manage) see connections and the webhook log; order staff see payments and
-- refunds of their branches. All writes go through the functions below.
create policy payment_connections_select on public.payment_connections for select to authenticated
  using ((select private.has_permission(restaurant_id, 'payments.manage')));
create policy payment_webhook_events_select on public.payment_webhook_events for select to authenticated
  using ((select private.has_permission(restaurant_id, 'payments.manage')));
create policy payments_select on public.payments for select to authenticated
  using ((select private.has_permission(restaurant_id, 'orders.view', branch_id))
         or (select private.has_permission(restaurant_id, 'payments.manage')));
create policy payment_refunds_select on public.payment_refunds for select to authenticated
  using ((select private.has_permission(restaurant_id, 'orders.view', branch_id))
         or (select private.has_permission(restaurant_id, 'payments.manage')));

-- --- Eligibility ---------------------------------------------------------------------------------

/** A gateway this restaurant may connect: its market, plan (gateway feature) and status. */
create or replace function private.gateway_eligible(p_restaurant_id uuid, p_gateway public.payment_gateways)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_feature(r.id, 'gateway')
     and (p_gateway.status = 'active'
          or (p_gateway.status = 'testing' and coalesce((private.setting('testing_gateways_visible'))::boolean, false)))
     and (cardinality(p_gateway.countries) = 0 or r.country_code = any (p_gateway.countries))
     and (cardinality(p_gateway.currencies) = 0 or r.currency = any (p_gateway.currencies))
    from public.restaurants r where r.id = p_restaurant_id;
$$;

/** The connection that takes online payments now, if any. */
create or replace function private.active_connection(p_restaurant_id uuid)
returns public.payment_connections
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.payment_connections c
    join public.payment_gateways g on g.id = c.gateway_id
   where c.restaurant_id = p_restaurant_id and c.status = 'connected'
     and private.gateway_eligible(p_restaurant_id, g)
   order by c.connected_at desc nulls last
   limit 1;
$$;

create or replace function private.online_payment_ready(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select online_payment_enabled from public.website_settings where restaurant_id = p_restaurant_id), false)
     and (private.active_connection(p_restaurant_id)).id is not null;
$$;

-- Online payment is possible now: the restaurant takes online payments, and (spec §10) when
-- confirmation is required, only after confirmation. Replaces the Phase 5 order-only version.
create or replace function private.order_payable(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select o.status not in ('rejected', 'cancelled', 'refunded', 'completed')
     and o.payment_status in ('unpaid', 'failed', 'pending')
     and (not o.needs_confirmation or o.confirmed_at is not null)
     and o.total_minor > 0
     and private.online_payment_ready(o.restaurant_id)
    from public.orders o where o.id = p_order_id;
$$;

-- --- Owner: connect a gateway -------------------------------------------------------------------

/** Gateways this restaurant can use, with its connection status. Owners (payments.manage). */
create or replace function public.list_payment_gateways(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_restaurant_id, 'payments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'key', g.key, 'name', g.name, 'provider', g.provider, 'environment', g.environment, 'methods', g.methods,
            'status', g.status, 'connection_status', coalesce(c.status, 'not_connected'),
            'public_config', coalesce(c.public_config, '{}'), 'connected_at', c.connected_at, 'last_error', c.last_error)
            order by g.sort, g.name), '[]'::jsonb)
            from public.payment_gateways g
            left join public.payment_connections c on c.gateway_id = g.id and c.restaurant_id = p_restaurant_id
           where private.gateway_eligible(p_restaurant_id, g) or c.status = 'connected');
end;
$$;

/**
 * Connect (or update) this restaurant's merchant account. The server action validates the
 * credentials with the provider, then stores them encrypted. Owners only, fresh re-auth.
 */
create or replace function public.connect_gateway(p_restaurant_id uuid, p_gateway_key text, p_public_config jsonb,
                                                  p_secret_ciphertext text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.payment_gateways;
  v_c public.payment_connections;
begin
  if not private.has_permission(p_restaurant_id, 'payments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  select * into v_g from public.payment_gateways where key = p_gateway_key;
  if v_g.id is null or not private.gateway_eligible(p_restaurant_id, v_g) then
    raise exception 'this gateway is not available for your restaurant' using errcode = '22023', hint = 'GATEWAY_UNAVAILABLE';
  end if;
  if coalesce(length(p_secret_ciphertext), 0) not between 16 and 4000 then
    raise exception 'credentials are missing' using errcode = '22023', hint = 'CREDENTIALS_REQUIRED';
  end if;
  insert into public.payment_connections (restaurant_id, gateway_id, status, public_config, connected_by, connected_at, last_error)
  values (p_restaurant_id, v_g.id, 'connected', coalesce(p_public_config, '{}'), auth.uid(), now(), null)
  on conflict (restaurant_id, gateway_id) do update
     set status = 'connected', public_config = excluded.public_config, connected_by = excluded.connected_by,
         connected_at = now(), last_error = null
  returning * into v_c;
  insert into private.payment_connection_secrets (connection_id, secret_ciphertext) values (v_c.id, p_secret_ciphertext)
  on conflict (connection_id) do update set secret_ciphertext = excluded.secret_ciphertext, updated_at = now();
  perform private.write_audit(p_restaurant_id, 'payments.gateway_connected', 'payment_connection', v_c.id, null,
                              jsonb_build_object('gateway', v_g.key, 'public_config', v_c.public_config));
  return v_c.id;
end;
$$;

create or replace function public.disconnect_gateway(p_restaurant_id uuid, p_gateway_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.payment_connections;
begin
  if not private.has_permission(p_restaurant_id, 'payments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  update public.payment_connections c set status = 'not_connected', connected_at = null
    from public.payment_gateways g
   where g.id = c.gateway_id and g.key = p_gateway_key and c.restaurant_id = p_restaurant_id
  returning c.* into v_c;
  if v_c.id is not null then
    delete from private.payment_connection_secrets where connection_id = v_c.id;
    perform private.write_audit(p_restaurant_id, 'payments.gateway_disconnected', 'payment_connection', v_c.id,
                                null, jsonb_build_object('gateway', p_gateway_key));
  end if;
end;
$$;

-- --- Diner: start an online payment --------------------------------------------------------------

/**
 * Called by the server for the diner's tracking link. Creates a pending payment for the amount
 * due; any earlier unfinished attempt is cancelled. Returns what the gateway adapter needs.
 */
create or replace function public.start_online_payment(p_public_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_c public.payment_connections;
  v_p public.payments;
begin
  select * into v_o from public.orders where public_key = p_public_key for update;
  if v_o.id is null or not private.order_payable(v_o.id) then
    raise exception 'this order cannot be paid online now' using errcode = '22023', hint = 'NOT_PAYABLE';
  end if;
  v_c := private.active_connection(v_o.restaurant_id);
  update public.payments set status = 'cancelled' where order_id = v_o.id and status = 'pending';
  insert into public.payments (restaurant_id, branch_id, order_id, connection_id, method, status, amount_minor, currency)
  values (v_o.restaurant_id, v_o.branch_id, v_o.id, v_c.id, 'online', 'pending', v_o.total_minor, v_o.currency)
  returning * into v_p;
  perform private.add_order_event(v_o, 'payment_started', jsonb_build_object('payment_id', v_p.id));
  perform public.track_event(v_o.restaurant_id, 'checkout_started', null, v_o.id, v_o.branch_id, v_o.qr_code_id);
  return jsonb_build_object('payment_id', v_p.id, 'amount_minor', v_p.amount_minor, 'currency', v_p.currency,
                            'gateway', (select g.key from public.payment_gateways g where g.id = v_c.gateway_id),
                            'provider', (select g.provider from public.payment_gateways g where g.id = v_c.gateway_id),
                            'connection_id', v_c.id, 'order_number', v_o.number);
end;
$$;

/** The payment page shows only what the diner needs (no personal data). Unguessable id. */
create or replace function public.payment_checkout(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('payment_id', p.id, 'status', p.status, 'amount_minor', p.amount_minor, 'currency', p.currency,
                            'restaurant_name', r.name, 'order_number', o.number, 'public_key', o.public_key, 'slug', r.slug,
                            'gateway', g.key, 'provider', g.provider)
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.restaurants r on r.id = p.restaurant_id
    join public.payment_connections c on c.id = p.connection_id
    join public.payment_gateways g on g.id = c.gateway_id
   where p.id = p_payment_id and p.method = 'online';
$$;

-- --- Server only: credentials and webhooks --------------------------------------------------------

/** The encrypted credentials for a payment's connection (webhook verification, refunds). */
create or replace function public.payment_connection_secret(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('connection_id', c.id, 'gateway', g.key, 'provider', g.provider,
                            'secret_ciphertext', s.secret_ciphertext, 'public_config', c.public_config)
    from public.payments p
    join public.payment_connections c on c.id = p.connection_id
    join public.payment_gateways g on g.id = c.gateway_id
    join private.payment_connection_secrets s on s.connection_id = c.id
   where p.id = p_payment_id;
$$;

/** Money came in: mark the order paid and release it to the kitchen if it was waiting. */
create or replace function private.settle_order_payment(p_payment public.payments)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_payment.order_id for update;
  if v_o.payment_status = 'paid' then
    -- Paid twice (e.g. an abandoned attempt that completed later): staff should refund one.
    perform private.add_order_event(v_o, 'duplicate_payment', jsonb_build_object('payment_id', p_payment.id));
    return 'duplicate_payment';
  end if;
  perform set_config('gomenu.system_action', 'on', true);
  update public.orders set payment_status = 'paid' where id = v_o.id returning * into v_o;
  perform set_config('gomenu.system_action', 'off', true);
  perform private.add_order_event(v_o, 'paid', jsonb_build_object('payment_id', p_payment.id, 'method', p_payment.method,
                                                                  'amount_minor', p_payment.amount_minor));
  perform private.release_if_ready(v_o.id);
  insert into public.analytics_events (restaurant_id, branch_id, event_type, entity_id, qr_code_id, is_internal)
  values (v_o.restaurant_id, v_o.branch_id, 'payment_completed', v_o.id, v_o.qr_code_id, false);
  return 'paid';
end;
$$;

/** Money went back: payment, order, totals and timeline (spec §11). */
create or replace function private.apply_refund(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.payment_refunds;
  v_p public.payments;
  v_o public.orders;
  v_refunded bigint;
begin
  update public.payment_refunds set status = 'succeeded', completed_at = now()
   where id = p_refund_id and status = 'pending' returning * into v_r;
  if v_r.id is null then
    return;
  end if;
  update public.payments set refunded_minor = refunded_minor + v_r.amount_minor where id = v_r.payment_id returning * into v_p;
  select coalesce(sum(refunded_minor), 0) into v_refunded from public.payments where order_id = v_r.order_id and status = 'succeeded';
  perform set_config('gomenu.system_action', 'on', true);
  update public.orders
     set refunded_minor = least(v_refunded, total_minor),
         payment_status = case when v_refunded >= total_minor then 'refunded' else 'partially_refunded' end::public.order_payment_status,
         status = case when v_refunded >= total_minor then 'refunded' else status end,
         closed_at = case when v_refunded >= total_minor then now() else closed_at end
   where id = v_r.order_id returning * into v_o;
  perform set_config('gomenu.system_action', 'off', true);
  perform private.add_order_event(v_o, 'refunded', jsonb_build_object('refund_id', v_r.id, 'amount_minor', v_r.amount_minor,
                                                                      'full', v_o.payment_status = 'refunded'));
end;
$$;

/**
 * A webhook the server already verified (signature checked with the connection's secret).
 * Idempotent: an event id is processed once; replays return 'duplicate'. Amount and currency
 * must match what GoMenu asked for. Event: {id, type, payment_id, refund_id?, amount_minor,
 * currency, provider_reference?, reason?}. Types: payment.succeeded, payment.failed,
 * refund.succeeded, refund.failed.
 */
create or replace function public.apply_payment_event(p_gateway_key text, p_event jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.payment_gateways;
  v_p public.payments;
  v_r public.payment_refunds;
  v_type text := p_event ->> 'type';
  v_result text;
  v_event_row uuid;
begin
  select * into v_g from public.payment_gateways where key = p_gateway_key;
  select * into v_p from public.payments where id = (p_event ->> 'payment_id')::uuid and method = 'online' for update;
  if v_g.id is null or v_p.id is null
     or not exists (select 1 from public.payment_connections c where c.id = v_p.connection_id and c.gateway_id = v_g.id) then
    return 'unknown_payment';
  end if;
  insert into public.payment_webhook_events (restaurant_id, gateway_id, event_id, type, payload, result)
  values (v_p.restaurant_id, v_g.id, p_event ->> 'id', coalesce(v_type, '?'), p_event, 'processing')
  on conflict (gateway_id, event_id) do nothing
  returning id into v_event_row;
  if v_event_row is null then
    return 'duplicate';
  end if;

  if v_type in ('payment.succeeded', 'payment.failed')
     and ((p_event ->> 'amount_minor')::bigint is distinct from v_p.amount_minor or p_event ->> 'currency' is distinct from v_p.currency) then
    v_result := 'amount_mismatch';
  elsif v_type = 'payment.succeeded' then
    if v_p.status = 'succeeded' then
      v_result := 'already_succeeded';
    else
      update public.payments set status = 'succeeded', succeeded_at = now(),
             provider_reference = coalesce(left(p_event ->> 'provider_reference', 120), provider_reference)
       where id = v_p.id returning * into v_p;
      v_result := private.settle_order_payment(v_p);
    end if;
  elsif v_type = 'payment.failed' then
    if v_p.status <> 'pending' then
      v_result := 'ignored';
    else
      update public.payments set status = 'failed', failure_reason = left(p_event ->> 'reason', 300) where id = v_p.id;
      perform set_config('gomenu.system_action', 'on', true);
      update public.orders set payment_status = 'failed' where id = v_p.order_id and payment_status in ('unpaid', 'pending');
      perform set_config('gomenu.system_action', 'off', true);
      perform private.add_order_event((select o from public.orders o where o.id = v_p.order_id), 'payment_failed',
                                      jsonb_build_object('payment_id', v_p.id, 'reason', left(p_event ->> 'reason', 300)));
      v_result := 'failed';
    end if;
  elsif v_type in ('refund.succeeded', 'refund.failed') then
    select * into v_r from public.payment_refunds where id = (p_event ->> 'refund_id')::uuid and payment_id = v_p.id;
    if v_r.id is null then
      v_result := 'unknown_refund';
    elsif v_type = 'refund.succeeded' then
      update public.payment_refunds set provider_reference = left(p_event ->> 'provider_reference', 120) where id = v_r.id;
      perform private.apply_refund(v_r.id);
      v_result := 'refunded';
    else
      update public.payment_refunds set status = 'failed', completed_at = now() where id = v_r.id and status = 'pending';
      v_result := 'refund_failed';
    end if;
  else
    v_result := 'ignored';
  end if;
  update public.payment_webhook_events set result = v_result where id = v_event_row;
  return v_result;
end;
$$;

-- --- Staff: offline payments and refunds -----------------------------------------------------------

/** Cash or card at the restaurant, for the amount due. Managers or the responsible waiter. */
create or replace function public.record_offline_payment(p_order_id uuid, p_method public.order_payment_method, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders := private.order_for_update(p_order_id);
  v_p public.payments;
begin
  if v_o.assigned_waiter_id = auth.uid() or v_o.created_by = auth.uid() then
    perform private.require_order_permission(v_o, 'orders.view');
  else
    perform private.require_order_permission(v_o, 'orders.manage');
  end if;
  if p_method not in ('cash', 'card_at_restaurant') then
    raise exception 'record cash or card at the restaurant' using errcode = '22023', hint = 'BAD_METHOD';
  end if;
  if v_o.status in ('rejected', 'cancelled', 'refunded') or v_o.payment_status not in ('unpaid', 'failed', 'pending') then
    raise exception 'this order is not waiting for payment' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  if v_o.needs_confirmation and v_o.confirmed_at is null then
    raise exception 'confirm the order first' using errcode = '22023', hint = 'NOT_CONFIRMED';
  end if;
  update public.payments set status = 'cancelled' where order_id = v_o.id and status = 'pending';
  insert into public.payments (restaurant_id, branch_id, order_id, method, status, amount_minor, currency, reference,
                               recorded_by, succeeded_at)
  values (v_o.restaurant_id, v_o.branch_id, v_o.id, p_method, 'succeeded', v_o.total_minor, v_o.currency,
          nullif(left(btrim(coalesce(p_reference, '')), 120), ''), auth.uid(), now())
  returning * into v_p;
  perform private.settle_order_payment(v_p);
  perform private.write_audit(v_o.restaurant_id, 'payments.offline_recorded', 'payment', v_p.id, null,
    jsonb_build_object('order_number', v_o.number, 'method', p_method, 'amount_minor', v_p.amount_minor), v_o.branch_id);
  return v_p.id;
end;
$$;

/**
 * Full or partial refund (spec §11). Owners (payments.manage) with a fresh re-auth. Offline
 * payments are refunded at once (money handed back); online refunds stay pending until the
 * gateway's webhook confirms them. Returns {refund_id, status, provider?}.
 */
create or replace function public.request_refund(p_payment_id uuid, p_amount_minor bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payments;
  v_r public.payment_refunds;
  v_pending bigint;
begin
  select * into v_p from public.payments where id = p_payment_id for update;
  if v_p.id is null or not private.has_permission(v_p.restaurant_id, 'payments.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.restaurant_writable(v_p.restaurant_id) then
    raise exception 'this restaurant''s account is not active' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  if v_p.status <> 'succeeded' then
    raise exception 'only completed payments can be refunded' using errcode = '22023', hint = 'WRONG_STATUS';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'give a reason' using errcode = '22023', hint = 'REASON_REQUIRED';
  end if;
  select coalesce(sum(amount_minor), 0) into v_pending from public.payment_refunds where payment_id = v_p.id and status = 'pending';
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > v_p.amount_minor - v_p.refunded_minor - v_pending then
    raise exception 'the refund is more than what is left on this payment' using errcode = '22023', hint = 'BAD_AMOUNT';
  end if;
  insert into public.payment_refunds (restaurant_id, branch_id, order_id, payment_id, amount_minor, reason, requested_by)
  values (v_p.restaurant_id, v_p.branch_id, v_p.order_id, v_p.id, p_amount_minor, left(btrim(p_reason), 300), auth.uid())
  returning * into v_r;
  perform private.write_audit(v_p.restaurant_id, 'payments.refund_requested', 'payment', v_p.id, null,
    jsonb_build_object('refund_id', v_r.id, 'amount_minor', p_amount_minor, 'reason', v_r.reason, 'method', v_p.method),
    v_p.branch_id);
  if v_p.method <> 'online' then
    perform private.apply_refund(v_r.id);
    return jsonb_build_object('refund_id', v_r.id, 'status', 'succeeded');
  end if;
  return jsonb_build_object('refund_id', v_r.id, 'status', 'pending', 'payment_id', v_p.id,
                            'provider', (select g.provider from public.payment_connections c join public.payment_gateways g
                                           on g.id = c.gateway_id where c.id = v_p.connection_id));
end;
$$;

-- --- Platform: gateways and commercial terms ---------------------------------------------------------

create or replace function public.platform_list_gateways()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin', 'admin', 'finance']::public.platform_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', g.id, 'key', g.key, 'name', g.name, 'provider', g.provider, 'environment', g.environment,
            'countries', g.countries, 'currencies', g.currencies, 'methods', g.methods, 'status', g.status, 'sort', g.sort,
            'terms', coalesce(t.terms, '{}'),
            'connections', (select count(*) from public.payment_connections c where c.gateway_id = g.id and c.status = 'connected'))
            order by g.sort, g.name), '[]'::jsonb)
            from public.payment_gateways g left join private.gateway_terms t on t.gateway_id = g.id);
end;
$$;

create or replace function public.platform_upsert_gateway(p_key text, p_name text, p_provider text,
  p_environment public.gateway_environment, p_countries text[], p_currencies text[], p_methods text[],
  p_status public.gateway_status, p_sort integer default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform private.require_platform(array['super_admin', 'admin']::public.platform_role[]);
  if exists (select 1 from unnest(coalesce(p_countries, '{}')) c where c !~ '^[A-Z]{2}$')
     or exists (select 1 from unnest(coalesce(p_currencies, '{}')) c where c !~ '^[A-Z]{3}$')
     or exists (select 1 from unnest(coalesce(p_methods, '{}')) m where m !~ '^[a-z_]{2,30}$') then
    raise exception 'invalid countries, currencies or methods' using errcode = '22023';
  end if;
  select to_jsonb(g) into v_before from public.payment_gateways g where key = p_key;
  insert into public.payment_gateways (key, name, provider, environment, countries, currencies, methods, status, sort)
  values (p_key, p_name, p_provider, p_environment, coalesce(p_countries, '{}'), coalesce(p_currencies, '{}'),
          coalesce(p_methods, '{card}'), p_status, coalesce(p_sort, 0))
  on conflict (key) do update
     set name = excluded.name, provider = excluded.provider, environment = excluded.environment,
         countries = excluded.countries, currencies = excluded.currencies, methods = excluded.methods,
         status = excluded.status, sort = excluded.sort;
  perform private.write_platform_audit('payments.gateway_upserted', 'payment_gateway',
    (select id from public.payment_gateways where key = p_key), null, null, v_before,
    (select to_jsonb(g) from public.payment_gateways g where key = p_key));
end;
$$;

/** Private commercial terms (fees, contract notes). Never shown to restaurants. */
create or replace function public.platform_set_gateway_terms(p_gateway_key text, p_terms jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_before jsonb;
begin
  perform private.require_platform(array['super_admin', 'admin', 'finance']::public.platform_role[]);
  select id into v_id from public.payment_gateways where key = p_gateway_key;
  if v_id is null or jsonb_typeof(p_terms) <> 'object' then
    raise exception 'unknown gateway or invalid terms' using errcode = '22023';
  end if;
  select terms into v_before from private.gateway_terms where gateway_id = v_id;
  insert into private.gateway_terms (gateway_id, terms, updated_by) values (v_id, p_terms, auth.uid())
  on conflict (gateway_id) do update set terms = excluded.terms, updated_by = excluded.updated_by, updated_at = now();
  perform private.write_platform_audit('payments.gateway_terms_set', 'payment_gateway', v_id, null, null, v_before, p_terms);
end;
$$;

grant execute on function public.list_payment_gateways(uuid) to authenticated;
grant execute on function public.connect_gateway(uuid, text, jsonb, text) to authenticated;
grant execute on function public.disconnect_gateway(uuid, text) to authenticated;
grant execute on function public.start_online_payment(text) to service_role;
grant execute on function public.payment_checkout(uuid) to anon, authenticated;
grant execute on function public.payment_connection_secret(uuid) to service_role;
grant execute on function public.apply_payment_event(text, jsonb) to service_role;
grant execute on function public.record_offline_payment(uuid, public.order_payment_method, text) to authenticated;
grant execute on function public.request_refund(uuid, bigint, text) to authenticated;
grant execute on function public.platform_list_gateways() to authenticated;
grant execute on function public.platform_upsert_gateway(text, text, text, public.gateway_environment, text[], text[], text[],
                                                         public.gateway_status, integer) to authenticated;
grant execute on function public.platform_set_gateway_terms(text, jsonb) to authenticated;
