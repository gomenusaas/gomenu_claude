-- New Staff has zero operational permissions, immutably (spec §4.5).
-- Catalog-driven over EVERY public table (not only tenant tables): a New Staff member — and
-- anyone else without an active membership — reads nothing but their own profile row and
-- can write nothing. The same checks run for an invitee mid-verification and for outsiders.
begin;
select no_plan();
select tests.build_fixtures();

create temp table any_samples as
select t as table_name, null::jsonb as row_json from tests.public_tables() t;
do $$
declare r record; v jsonb;
begin
  for r in select * from any_samples loop
    execute format('select to_jsonb(x) from %s x limit 1', r.table_name) into v;
    update any_samples set row_json = v where table_name = r.table_name;
  end loop;
end $$;
grant select on any_samples to authenticated;

select is(
  (select array_agg(table_name order by table_name) from any_samples where row_json is null),
  null,
  'fixtures contain rows in every public table (so zero-row results are meaningful)'
);

create function pg_temp.assert_zero_access(p_persona text) returns setof text
language plpgsql as $$
declare r record;
begin
  perform tests.authenticate_as(p_persona);
  for r in select * from any_samples order by table_name loop
    if r.table_name = 'public.profiles' then
      return next is(tests.count_rows(r.table_name), 1::bigint,
                     format('%s reads only their own row from %s', p_persona, r.table_name));
      return next is(tests.count_rows(r.table_name, format('id = %L', tests.id(p_persona))), 1::bigint,
                     format('%s: the visible profile is their own', p_persona));
    else
      return next is(tests.count_rows(r.table_name), 0::bigint,
                     format('%s reads zero rows from %s', p_persona, r.table_name));
    end if;
    return next is(
      tests.try_sql(format('insert into %s select * from jsonb_populate_record(null::%s, %L)',
                           r.table_name, r.table_name, r.row_json)),
      '42501', format('%s cannot INSERT into %s', p_persona, r.table_name));
    if r.table_name <> 'public.profiles' then
      return next ok(tests.try_dml(format('delete from %s', r.table_name)) in ('denied', '0'),
                     format('%s cannot DELETE from %s', p_persona, r.table_name));
    end if;
  end loop;
  return next is(tests.count_rows('storage.objects'), 0::bigint,
                 format('%s lists zero storage objects', p_persona));
  return next is(
    tests.try_sql(format($s$insert into storage.objects (bucket_id, name) values ('restaurant-public', %L)$s$,
                         tests.id('restaurant_a') || '/x.png')),
    '42501', format('%s cannot upload to restaurant storage', p_persona));
  perform set_config('role', 'postgres', true);
end $$;

select pg_temp.assert_zero_access('new_staff_a');
select pg_temp.assert_zero_access('pending_a');
select pg_temp.assert_zero_access('outsider');
select pg_temp.assert_zero_access('unverified');

-- has_permission is false for EVERY permission and EVERY branch of the restaurant.
select tests.authenticate_as('new_staff_a');
select is(
  (select count(*) from public.permissions), 0::bigint, 'New Staff cannot even list permission names');
reset role;
create temp table perm_matrix as
  select p.key, b.id as branch_id from public.permissions p
  cross join (select id from public.branches where restaurant_id = tests.id('restaurant_a')
              union all select null) b;
grant select on perm_matrix to authenticated;
select tests.authenticate_as('new_staff_a');
select is(
  (select count(*) from perm_matrix where private.has_permission(tests.id('restaurant_a'), key, branch_id)),
  0::bigint,
  'New Staff holds none of the permissions, on any branch');
select ok(not private.is_active_member(tests.id('restaurant_a')), 'New Staff is not an active member');
select is(public.my_permissions(tests.id('restaurant_a')), '{}'::text[], 'my_permissions() is empty for New Staff');
select ok(not private.realtime_topic_allowed('restaurant:' || tests.id('restaurant_a')),
          'New Staff cannot join the restaurant realtime channel');

-- Every privileged RPC refuses New Staff.
select is(tests.try_sql(format($s$select public.invite_staff(%L, 'X', '+96899999999')$s$, tests.id('restaurant_a'))),
          '42501', 'New Staff cannot invite staff');
select is(tests.try_sql(format($s$select public.create_custom_role(%L, 'k', 'K', array[]::text[])$s$, tests.id('restaurant_a'))),
          '42501', 'New Staff cannot create roles');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where false), 'all')$s$,
                               tests.id('membership:restaurant_a:waiter_a1'))),
          '42501', 'New Staff cannot assign roles');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, %L, 'all')$s$,
                               tests.id('membership:restaurant_a:new_staff_a'), tests.id('membership:restaurant_a:new_staff_a'))),
          '42501', 'New Staff cannot activate themselves');
select is(tests.try_sql(format($s$select public.complete_staff_verification(%L, '583920')$s$,
                               tests.id('membership:restaurant_a:new_staff_a'))),
          '42501', 'New Staff cannot re-run verification to change state');
select is(tests.try_sql(format($s$select public.platform_get_restaurant_overview(%L, 'curious about it')$s$, tests.id('restaurant_a'))),
          '42501', 'New Staff cannot use platform access');
select is(tests.try_sql($s$update public.memberships set status = 'active'$s$), '42501',
          'New Staff cannot update memberships directly');

-- The routing context tells them only: pending, restaurant name, status.
select is((public.get_my_context()) ->> 'next', 'pending', 'routing sends New Staff to the pending screen');
select is(jsonb_array_length((public.get_my_context()) -> 'active_memberships'), 0, 'no active memberships reported');
select is(
  (select array_agg(k order by k) from jsonb_object_keys((public.get_my_context()) -> 'pending_memberships' -> 0) k),
  array['membership_id', 'restaurant_name', 'status'],
  'pending context exposes only membership id, restaurant name and status');
reset role;

-- Immutability: even privileged (postgres / SECURITY DEFINER) writes cannot break the rule.
select is(tests.try_sql($s$insert into public.role_permissions (role_id, permission_key)
                         select id, 'menu.view' from public.roles where is_new_staff$s$),
          '42501', 'the New Staff role can never be given a permission');
select is(tests.try_sql(format($s$update public.memberships set status = 'active' where id = %L$s$,
                               tests.id('membership:restaurant_a:new_staff_a'))),
          '23514', 'a New Staff membership can never become active without a real role');
select is(tests.try_sql(format($s$insert into public.membership_permission_overrides
                                  (membership_id, restaurant_id, permission_key, effect) values (%L, %L, 'menu.view', 'grant')$s$,
                               tests.id('membership:restaurant_a:new_staff_a'), tests.id('restaurant_a'))),
          '42501', 'New Staff cannot receive a permission override');
select is(tests.try_sql(format($s$insert into public.membership_branches (membership_id, branch_id, restaurant_id)
                                  values (%L, %L, %L)$s$,
                               tests.id('membership:restaurant_a:new_staff_a'), tests.id('a1'), tests.id('restaurant_a'))),
          '42501', 'New Staff cannot be given branch access');
select is(tests.try_sql(format($s$update public.memberships set role_id = (select id from public.roles where key = 'manager' and restaurant_id is null)
                                  where id = %L$s$, tests.id('membership:restaurant_a:new_staff_a'))),
          '23514', 'a New Staff membership cannot hold a real role while still New Staff');

select * from finish();
rollback;
