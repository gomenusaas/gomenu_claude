-- Branch scope (spec §3: a waiter at Branch A cannot read Branch B) and role assignment
-- guards (no self-promotion, no granting what you don't hold, Owner role owner-only).
begin;
select plan(26);
select tests.build_fixtures();

-- waiter_a1 is scoped to branch A1 only
select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.branches', format('id = %L', tests.id('a1'))), 1::bigint, 'waiter sees their branch A1');
select is(tests.count_rows('public.branches', format('id = %L', tests.id('a2'))), 0::bigint, 'waiter cannot see branch A2');
select is(tests.count_rows('public.restaurant_notifications', format('id = %L', tests.id('notif_a2'))), 0::bigint,
          'waiter cannot read A2-scoped data');
select is(tests.count_rows('public.restaurant_notifications', format('id = %L', tests.id('notif_a'))), 1::bigint,
          'waiter reads restaurant-wide data their role allows (menu.view)');
select ok(private.has_permission(tests.id('restaurant_a'), 'orders.view', tests.id('a1')), 'orders.view on A1');
select ok(not private.has_permission(tests.id('restaurant_a'), 'orders.view', tests.id('a2')), 'no orders.view on A2');
select ok(not private.has_permission(tests.id('restaurant_a'), 'menu.edit'), 'waiter role lacks menu.edit');
select ok(private.realtime_topic_allowed('restaurant:' || tests.id('restaurant_a') || ':branch:' || tests.id('a1')),
          'waiter can join the A1 realtime channel');
select ok(not private.realtime_topic_allowed('restaurant:' || tests.id('restaurant_a') || ':branch:' || tests.id('a2')),
          'waiter cannot join the A2 realtime channel');
select ok(not private.realtime_topic_allowed('restaurant:' || tests.id('restaurant_b')),
          'waiter cannot join restaurant B channel');
select is(tests.count_rows('public.memberships'), 1::bigint, 'without staff.view a waiter sees only their own membership');
select is(tests.try_dml(format($s$update public.branches set name = 'hacked' where id = %L$s$, tests.id('a1'))), '0',
          'waiter cannot rename branches');
reset role;

-- manager_a has scope 'all'
select tests.authenticate_as('manager_a');
select is(tests.count_rows('public.restaurant_notifications', format('restaurant_id = %L', tests.id('restaurant_a'))), 2::bigint,
          'all-branch manager reads both A1-wide and A2 data');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key='owner'), 'all')$s$,
                               tests.id('membership:restaurant_a:new_staff_a'))),
          '42501', 'a manager cannot grant the Owner role');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key='admin'), 'all')$s$,
                               tests.id('membership:restaurant_a:new_staff_a'))),
          '42501', 'a manager cannot assign a role with permissions they lack (admin)');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key='admin'), 'all')$s$,
                               tests.id('membership:restaurant_a:manager_a'))),
          '42501', 'nobody can change their own role');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key='waiter' and restaurant_id is null), 'selected', array[%L]::uuid[])$s$,
                               tests.id('membership:restaurant_a:new_staff_a'), tests.id('a2'))),
          'ok', 'a manager can activate New Staff as a waiter on A2');
reset role;
select tests.authenticate_as('owner_a');
select is(tests.try_sql(format($s$select public.create_custom_role(%L, 'cashier', 'Cashier', array['payments.manage'])$s$, tests.id('restaurant_a'))),
          '22023', 'owner-only permissions cannot be put into custom roles, even by the owner');
reset role;

select is((select status::text from public.memberships where id = tests.id('membership:restaurant_a:new_staff_a')), 'active',
          'assigned membership is now active');
select ok(exists (select 1 from public.audit_events where action = 'staff.role_assigned'
                   and object_id = tests.id('membership:restaurant_a:new_staff_a')
                   and before ->> 'status' = 'new_staff' and after ->> 'status' = 'active'),
          'role assignment is audited with before/after');

select tests.authenticate_as('new_staff_a');
select ok(private.has_permission(tests.id('restaurant_a'), 'orders.view', tests.id('a2')), 'after assignment: orders.view on A2');
select ok(not private.has_permission(tests.id('restaurant_a'), 'orders.view', tests.id('a1')), 'after assignment: still nothing on A1');
select is((public.get_my_context()) ->> 'next', 'restaurant', 'routing now sends them to the restaurant');
reset role;

-- permission overrides: deny wins over role grant
insert into public.membership_permission_overrides (membership_id, restaurant_id, permission_key, effect)
values (tests.id('membership:restaurant_a:waiter_a1'), tests.id('restaurant_a'), 'orders.view', 'deny');
select tests.authenticate_as('waiter_a1');
select ok(not private.has_permission(tests.id('restaurant_a'), 'orders.view', tests.id('a1')), 'deny override removes a role permission');
reset role;
-- owner-only permission can never be granted by override
select is(tests.try_sql(format($s$insert into public.membership_permission_overrides (membership_id, restaurant_id, permission_key, effect)
                                  values (%L, %L, 'billing.manage', 'grant')$s$,
                               tests.id('membership:restaurant_a:manager_a'), tests.id('restaurant_a'))),
          '42501', 'owner-only permissions cannot be granted by override');

-- last owner protection
select is(tests.try_sql(format($s$update public.memberships set status = 'removed' where id = %L$s$,
                               tests.id('membership:restaurant_a:owner_a'))),
          '23514', 'the last active owner cannot be removed');

select * from finish();
rollback;
