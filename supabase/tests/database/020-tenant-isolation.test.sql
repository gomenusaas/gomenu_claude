-- Restaurant A can never read or write Restaurant B's data (spec §5).
-- Catalog-driven: every table with a restaurant_id column is checked automatically, for every
-- persona of Restaurant A, for SELECT / INSERT / UPDATE / DELETE.
begin;
select no_plan();
select tests.build_fixtures();

-- Snapshot one real row of B per tenant table (as postgres) to replay as an A user.
create temp table b_samples as
select t.table_name, t.tenant_column, null::jsonb as row_json
  from tests.tenant_tables() t;
do $$
declare r record; v jsonb;
begin
  for r in select * from b_samples loop
    execute format('select to_jsonb(x) from %s x where %I = %L limit 1',
                   r.table_name, r.tenant_column, tests.id('restaurant_b')) into v;
    update b_samples set row_json = v where table_name = r.table_name;
  end loop;
end $$;
grant select on b_samples to authenticated;

select is(
  (select array_agg(table_name order by table_name) from b_samples where row_json is null),
  null,
  'fixtures contain Restaurant B rows in every tenant table (so the checks below are meaningful)'
);

create function pg_temp.assert_no_access_to_b(p_persona text) returns setof text
language plpgsql as $$
declare
  r record;
  v_b uuid := tests.id('restaurant_b');
begin
  perform tests.authenticate_as(p_persona);
  for r in select * from b_samples order by table_name loop
    return next is(
      tests.count_rows(r.table_name, format('%I = %L', r.tenant_column, v_b)), 0::bigint,
      format('%s cannot SELECT B rows from %s', p_persona, r.table_name));
    return next is(
      tests.try_sql(format('insert into %s select * from jsonb_populate_record(null::%s, %L)',
                           r.table_name, r.table_name, r.row_json)),
      '42501',
      format('%s cannot INSERT B rows into %s', p_persona, r.table_name));
    return next ok(
      tests.try_dml(format('update %s set %I = %I where %I = %L',
                           r.table_name, r.tenant_column, r.tenant_column, r.tenant_column, v_b))
        in ('denied', '0'),
      format('%s cannot UPDATE B rows in %s', p_persona, r.table_name));
    return next ok(
      tests.try_dml(format('delete from %s where %I = %L', r.table_name, r.tenant_column, v_b))
        in ('denied', '0'),
      format('%s cannot DELETE B rows from %s', p_persona, r.table_name));
  end loop;

  return next is(
    tests.count_rows('storage.objects', format('name like %L', v_b || '/%')), 0::bigint,
    format('%s cannot list B storage objects', p_persona));
  return next is(
    tests.try_sql(format($s$insert into storage.objects (bucket_id, name) values ('restaurant-public', %L)$s$,
                         v_b || '/injected.png')),
    '42501',
    format('%s cannot upload into B storage', p_persona));
  return next is(
    tests.count_rows('public.role_permissions', format('role_id = %L', tests.id('role_b_host'))), 0::bigint,
    format('%s cannot see B custom role permissions', p_persona));
  return next is(
    tests.count_rows('public.profiles', format('id in (%L, %L)', tests.id('owner_b'), tests.id('waiter_b1'))), 0::bigint,
    format('%s cannot see profiles of B staff', p_persona));
  perform set_config('role', 'postgres', true);
end $$;

select pg_temp.assert_no_access_to_b('owner_a');
select pg_temp.assert_no_access_to_b('manager_a');
select pg_temp.assert_no_access_to_b('waiter_a1');
select pg_temp.assert_no_access_to_b('new_staff_a');
select pg_temp.assert_no_access_to_b('outsider');

-- Positive control: the same checks are not vacuous — B's owner does see B's data.
select tests.authenticate_as('owner_b');
select ok(tests.count_rows('public.restaurants', format('id = %L', tests.id('restaurant_b'))) = 1,
          'control: owner_b sees restaurant B');
select ok(tests.count_rows('public.memberships', format('restaurant_id = %L', tests.id('restaurant_b'))) >= 2,
          'control: owner_b sees B memberships');
select ok(tests.count_rows('storage.objects', format('name like %L', tests.id('restaurant_b') || '/%')) = 2,
          'control: owner_b lists B storage objects');
select ok(tests.count_rows('public.audit_events', format('restaurant_id = %L', tests.id('restaurant_b'))) >= 1,
          'control: owner_b reads B audit log');
reset role;

-- Cross-tenant RPC attempts by A's owner against B.
select tests.authenticate_as('owner_a');
select is(tests.try_sql(format($s$select public.invite_staff(%L, 'X', '+96899999999')$s$, tests.id('restaurant_b'))),
          '42501', 'owner_a cannot invite staff into B');
reset role;

create temp table b_ids as
  select (select id from public.memberships where restaurant_id = tests.id('restaurant_b') and status = 'invitation_sent') as invited_b,
         tests.id('membership:restaurant_b:waiter_b1') as waiter_b1;
grant select on b_ids to authenticated;

select tests.authenticate_as('owner_a');
select is(tests.try_sql(format('select public.resend_staff_invitation(%L)', (select invited_b from b_ids))),
          '42501', 'owner_a cannot resend B invitations');
select is(tests.try_sql(format('select public.cancel_staff_invitation(%L)', (select invited_b from b_ids))),
          '42501', 'owner_a cannot cancel B invitations');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key = 'manager' and restaurant_id is null), 'all')$s$,
                               (select waiter_b1 from b_ids))),
          '42501', 'owner_a cannot change roles of B staff');
select is(tests.try_sql(format($s$select public.create_custom_role(%L, 'spy', 'Spy', array['menu.view'])$s$, tests.id('restaurant_b'))),
          '42501', 'owner_a cannot create roles in B');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, %L, 'all')$s$,
                               tests.id('membership:restaurant_a:manager_a'), tests.id('role_b_host'))),
          '22023', 'owner_a cannot assign a B custom role inside A');
reset role;

select * from finish();
rollback;
