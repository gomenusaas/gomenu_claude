-- Test helpers and fixtures. This file is NOT wrapped in a transaction: it (re)creates the
-- `tests` schema in the LOCAL/CI database only. It is never part of a migration.
-- Every other test file runs inside BEGIN ... ROLLBACK and calls tests.build_fixtures().

create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Deterministic ids so test files can refer to fixtures by name.
create function tests.id(p_name text) returns uuid
language sql immutable as $$ select md5('gomenu-test:' || p_name)::uuid $$;

-- Act as a signed-in user for the rest of the transaction.
create function tests.authenticate_as(p_name text, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(p_name), 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.authenticate_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function tests.authenticate_as_service_role() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

-- Run SQL as the CURRENT role; return 'ok' or the SQLSTATE it failed with.
create function tests.try_sql(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- Run a DML statement as the current role; return affected row count or 'denied'.
create function tests.try_dml(p_sql text) returns text
language plpgsql as $$
declare v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count::text;
exception when insufficient_privilege then
  return 'denied';
end $$;

create function tests.count_rows(p_table text, p_where text default 'true') returns bigint
language plpgsql as $$
declare v_count bigint;
begin
  execute format('select count(*) from %s where %s', p_table, p_where) into v_count;
  return v_count;
end $$;

-- Every table in the API-exposed schema.
create function tests.public_tables() returns setof text
language sql stable as $$
  select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'public' order by 1
$$;

-- Tenant-owned tables and the column holding the restaurant id.
create function tests.tenant_tables() returns table (table_name text, tenant_column text)
language sql stable as $$
  select 'public.restaurants', 'id'
  union all
  select format('%I.%I', c.table_schema, c.table_name), 'restaurant_id'
    from information_schema.columns c
    join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
   where c.table_schema = 'public' and c.column_name = 'restaurant_id'
  order by 1
$$;

create function tests.create_user(p_name text, p_phone text default null, p_email text default null)
returns uuid
language plpgsql as $$
declare v_id uuid := tests.id(p_name);
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          p_email, case when p_email is not null then now() end,
          ltrim(p_phone, '+'), case when p_phone is not null then now() end,
          '{"provider":"phone","providers":["phone"]}', jsonb_build_object('full_name', initcap(replace(p_name, '_', ' '))),
          now(), now());
  return v_id;
end $$;

create function tests.add_member(
  p_restaurant text, p_user text, p_role_key text, p_status public.membership_status default 'active',
  p_scope public.branch_scope default 'all', p_branches text[] default '{}'
) returns uuid
language plpgsql as $$
declare
  v_id uuid := tests.id('membership:' || p_restaurant || ':' || p_user);
  v_role uuid;
  b text;
begin
  select id into v_role from public.roles
   where key = p_role_key and (restaurant_id is null or restaurant_id = tests.id(p_restaurant))
   order by restaurant_id nulls last limit 1;
  insert into public.memberships (id, restaurant_id, user_id, role_id, status, branch_scope, invited_name,
                                  verified_at)
  values (v_id, tests.id(p_restaurant), tests.id(p_user), v_role, p_status, p_scope, p_user, now());
  foreach b in array p_branches loop
    insert into public.membership_branches (membership_id, branch_id, restaurant_id)
    values (v_id, tests.id(b), tests.id(p_restaurant));
  end loop;
  return v_id;
end $$;

-- Two complete tenants, every persona, and at least one row in every public table.
create function tests.build_fixtures() returns void
language plpgsql as $$
begin
  -- people
  perform tests.create_user('owner_a',      '+96890000001', 'owner.a@example.test');
  perform tests.create_user('manager_a',    '+96890000002');
  perform tests.create_user('waiter_a1',    '+96890000003');
  perform tests.create_user('new_staff_a',  '+96890000004');
  perform tests.create_user('pending_a',    '+96890000005');
  perform tests.create_user('owner_b',      '+96890000011', 'owner.b@example.test');
  perform tests.create_user('waiter_b1',    '+96890000012');
  perform tests.create_user('outsider',     '+96890000021');
  perform tests.create_user('unverified');                     -- no phone at all
  perform tests.create_user('super_admin',  '+96890000031', 'root@gomenu.test');
  perform tests.create_user('support',      '+96890000032');

  -- tenants
  insert into public.restaurants (id, name, slug, created_by) values
    (tests.id('restaurant_a'), 'Restaurant A', 'restaurant-a', tests.id('owner_a')),
    (tests.id('restaurant_b'), 'Restaurant B', 'restaurant-b', tests.id('owner_b'));
  insert into public.branches (id, restaurant_id, name) values
    (tests.id('a1'), tests.id('restaurant_a'), 'A1'),
    (tests.id('a2'), tests.id('restaurant_a'), 'A2'),
    (tests.id('b1'), tests.id('restaurant_b'), 'B1');

  perform tests.add_member('restaurant_a', 'owner_a', 'owner');
  perform tests.add_member('restaurant_a', 'manager_a', 'manager');
  perform tests.add_member('restaurant_a', 'waiter_a1', 'waiter', 'active', 'selected', array['a1']);
  perform tests.add_member('restaurant_a', 'new_staff_a', 'new_staff', 'new_staff', 'selected');
  perform tests.add_member('restaurant_a', 'pending_a', 'new_staff', 'verification_pending', 'selected');
  perform tests.add_member('restaurant_b', 'owner_b', 'owner');
  perform tests.add_member('restaurant_b', 'waiter_b1', 'waiter', 'active', 'selected', array['b1']);

  -- a custom role and a permission override in B (role_permissions / overrides rows exist)
  insert into public.roles (id, restaurant_id, key, name) values
    (tests.id('role_b_host'), tests.id('restaurant_b'), 'host', 'Host');
  insert into public.role_permissions (role_id, permission_key) values (tests.id('role_b_host'), 'menu.view');
  insert into public.membership_permission_overrides (membership_id, restaurant_id, permission_key, effect)
  values (tests.id('membership:restaurant_b:waiter_b1'), tests.id('restaurant_b'), 'menu.edit', 'grant');

  -- notifications (one branch-scoped in A2)
  insert into public.restaurant_notifications (id, restaurant_id, branch_id, kind, required_permission, title) values
    (tests.id('notif_a'),  tests.id('restaurant_a'), null,          'test', 'menu.view',   'A all'),
    (tests.id('notif_a2'), tests.id('restaurant_a'), tests.id('a2'), 'test', 'orders.view', 'A2 only'),
    (tests.id('notif_b'),  tests.id('restaurant_b'), null,          'test', 'menu.view',   'B all');

  -- invitations through the real RPC (creates invitations, outbox messages, audit rows)
  perform tests.authenticate_as('owner_a');
  perform public.invite_staff(tests.id('restaurant_a'), 'Invited A', '+96890000006', tests.id('a1'));
  perform tests.authenticate_as('owner_b');
  perform public.invite_staff(tests.id('restaurant_b'), 'Invited B', '+96890000013', null);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  -- platform staff and one platform audit row
  insert into public.platform_staff (user_id, role) values
    (tests.id('super_admin'), 'super_admin'), (tests.id('support'), 'support');
  perform private.write_platform_audit('platform.fixture', 'restaurant', tests.id('restaurant_b'),
                                       tests.id('restaurant_b'), 'fixture');

  -- billing (Phase 2): A is in its free trial; B is on a paid Silver plan with history
  update public.restaurants set status = 'active' where id = tests.id('restaurant_b');
  insert into public.subscription_periods (id, restaurant_id, kind, plan_id, starts_at, ends_at)
  values (tests.id('period_a_trial'), tests.id('restaurant_a'), 'trial', (select id from public.plans where key = 'gold'),
          now() - interval '10 days', now() + interval '50 days');
  insert into public.trial_grants (phone_e164, user_id, restaurant_id, source)
  values ('+96890000001', tests.id('owner_a'), tests.id('restaurant_a'), 'automatic'),
         ('+96890000011', tests.id('owner_b'), tests.id('restaurant_b'), 'automatic');
  insert into public.billing_invoices (id, number, restaurant_id, kind, status, plan_id, currency, lines,
                                       plan_amount_minor, branch_unit_amount_minor, subtotal_minor, tax_label,
                                       tax_rate_bp, tax_minor, total_minor, issued_at, due_at, paid_at)
  values (tests.id('invoice_b'), 'GM-TEST-B-1', tests.id('restaurant_b'), 'new_period', 'paid',
          (select id from public.plans where key = 'silver'), 'USD', '[]', 12000, 6000, 12000, 'VAT', 0, 0, 12000,
          now() - interval '31 days', now() - interval '17 days', now() - interval '30 days');
  insert into public.subscription_periods (id, restaurant_id, kind, plan_id, starts_at, ends_at, currency,
                                           plan_amount_minor, branch_unit_amount_minor, invoice_id)
  values (tests.id('period_b_paid'), tests.id('restaurant_b'), 'paid', (select id from public.plans where key = 'silver'),
          now() - interval '30 days', now() - interval '30 days' + interval '1 year', 'USD', 12000, 6000, tests.id('invoice_b'));
  insert into public.billing_payments (invoice_id, restaurant_id, amount_minor, currency, method, reference, received_at)
  values (tests.id('invoice_b'), tests.id('restaurant_b'), 12000, 'USD', 'bank_transfer', 'FIXTURE-B-1', now() - interval '30 days');
  insert into public.restaurant_entitlement_overrides (restaurant_id, feature_key, enabled, reason)
  values (tests.id('restaurant_b'), 'promotions', true, 'fixture: sales promise');

  -- storage objects in both tenants and both buckets
  insert into storage.objects (bucket_id, name) values
    ('restaurant-public',  tests.id('restaurant_a') || '/logo.png'),
    ('restaurant-private', tests.id('restaurant_a') || '/contract.pdf'),
    ('restaurant-public',  tests.id('restaurant_b') || '/logo.png'),
    ('restaurant-private', tests.id('restaurant_b') || '/contract.pdf');
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select plan(1);
select ok(true, 'test helpers installed');
select * from finish();
