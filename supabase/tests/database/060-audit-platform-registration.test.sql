-- Audit immutability (spec §15), audited Super Admin access (decision Q11) and owner
-- registration (decision Q2: minimal owner sign-up in Phase 1).
begin;
select plan(20);
select tests.build_fixtures();

-- Audit is append-only for EVERYONE, including postgres and service_role.
select throws_ok('update public.audit_events set action = ''x.y''', '42501', null, 'postgres cannot edit audit history');
select throws_ok('delete from public.audit_events', '42501', null, 'postgres cannot delete audit history');
select throws_ok('truncate public.audit_events', '42501', null, 'postgres cannot truncate audit history');
select throws_ok('delete from public.platform_audit_events', '42501', null, 'platform audit is append-only too');
select tests.authenticate_as_service_role();
select throws_ok('delete from public.audit_events', '42501', null, 'service_role cannot delete audit history');
reset role;

-- Full snapshot of the actor (decision: keep forever, full snapshot).
select ok(exists (select 1 from public.audit_events
                   where action = 'staff.invited' and actor_user_id = tests.id('owner_a')
                     and actor_phone_e164 = '+96890000001' and actor_email = 'owner.a@example.test'
                     and actor_name = 'Owner A' and actor_role_key = 'owner'),
          'audit rows snapshot actor name, phone, email and role');

-- Reading audit requires audit.view
select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.audit_events'), 0::bigint, 'waiter (no audit.view) reads no audit rows');
select tests.authenticate_as('manager_a');
select ok(tests.count_rows('public.audit_events') > 0, 'manager (audit.view) reads A audit rows');
reset role;

-- Platform staff get NO tenant access through RLS — not even Super Admin.
select tests.authenticate_as('super_admin', 'aal2');
select is(tests.count_rows('public.restaurants'), 0::bigint, 'Super Admin cannot read restaurants directly');
select is(tests.count_rows('public.memberships'), 0::bigint, 'Super Admin cannot read memberships directly');
select throws_ok(format($s$select public.platform_get_restaurant_overview(%L, '')$s$, tests.id('restaurant_a')),
                 '22023', null, 'audited access requires a reason');
select is((public.platform_get_restaurant_overview(tests.id('restaurant_a'), 'Support ticket #42')) -> 'restaurant' ->> 'name',
          'Restaurant A', 'Super Admin (MFA) reads tenant data through the audited RPC');
reset role;
select ok(exists (select 1 from public.platform_audit_events
                   where action = 'platform.tenant_read' and actor_user_id = tests.id('super_admin')
                     and restaurant_id = tests.id('restaurant_a') and reason = 'Support ticket #42'),
          'every Super Admin tenant read is written to the platform audit log');
select tests.authenticate_as('super_admin', 'aal1');
select throws_ok(format($s$select public.platform_get_restaurant_overview(%L, 'Support ticket #42')$s$, tests.id('restaurant_a')),
                 '42501', null, 'Super Admin without MFA (aal1) is refused');
select tests.authenticate_as('support', 'aal2');
select throws_ok(format($s$select public.platform_get_restaurant_overview(%L, 'Support ticket #42')$s$, tests.id('restaurant_a')),
                 '42501', null, 'Support has no tenant data access');
reset role;

-- Owner registration
select tests.authenticate_as('unverified');
select throws_ok($s$select public.create_restaurant('No Phone Cafe', 'no-phone-cafe')$s$, '42501', null,
                 'a user without a verified phone cannot create a restaurant');
select tests.authenticate_as('outsider');
select lives_ok($s$select public.create_restaurant('Outsider Grill', 'outsider-grill', 'Muscat')$s$,
                'a verified user creates a restaurant');
select is((public.get_my_context()) ->> 'next', 'restaurant', 'routing sends the new owner to their restaurant');
select is(tests.count_rows('public.restaurants', format('id = %L', tests.id('restaurant_a'))), 0::bigint,
          'owning a new restaurant grants nothing in Restaurant A');
reset role;
select throws_ok($s$insert into public.restaurants (name, slug) values ('Dup', 'restaurant-a')$s$, '23505', null,
                 'restaurant slugs are unique');

select * from finish();
rollback;
