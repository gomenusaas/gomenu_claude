-- Phase 2: trial rules, entitlements, invoices, payments, proration, lifecycle and suspension.
begin;
select no_plan();
select tests.build_fixtures();
select tests.create_user('finance', '+96890000033', 'finance@gomenu.test');
insert into public.platform_staff (user_id, role) values (tests.id('finance'), 'finance');

-- ===== Registration and trial ==============================================================
select tests.authenticate_as('outsider');
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'first', public.create_restaurant('Outsider One', 'outsider-one', 'Muscat', true);
select is((select status::text from public.restaurants where id = (select id from ids where name = 'first')), 'trial',
          'first restaurant of a new owner starts in Trial');
select is((public.restaurant_entitlements((select id from ids where name = 'first'))) ->> 'plan_key', 'gold',
          'trial unlocks Gold features (decision P2-Q4)');
insert into ids select 'second', public.create_restaurant('Outsider Two', 'outsider-two', null, true);
select is((select status::text from public.restaurants where id = (select id from ids where name = 'second')), 'past_due',
          'a second restaurant by the same owner phone gets no free trial (P2-Q5)');
select is(tests.try_sql($s$select public.create_restaurant('Pricing', 'pricing', null, true)$s$), '23505',
          'reserved web addresses cannot be used');
select is(tests.try_sql($s$select public.create_restaurant('No Terms', 'no-terms-cafe', null, false)$s$), '22023',
          'terms must be accepted');
reset role;
select is((select ends_at::date from public.subscription_periods
            where restaurant_id = (select id from ids where name = 'first') and kind = 'trial'),
          (now() + interval '2 months')::date, 'trial lasts 2 months (configurable)');
select is((select count(*) from public.trial_grants where phone_e164 = '+96890000021'), 1::bigint,
          'exactly one automatic trial grant for that phone');
select ok(exists (select 1 from public.restaurant_notifications
                   where restaurant_id = (select id from ids where name = 'second') and kind = 'billing.no_trial'),
          'owner is told to choose a plan for the no-trial restaurant');

-- ===== Entitlements =========================================================================
select ok(private.has_feature(tests.id('restaurant_a'), 'frames'), 'trial restaurant A has Gold-only Frames');
select ok(not private.has_feature(tests.id('restaurant_b'), 'frames'), 'Silver restaurant B lacks Frames');
select ok(private.has_feature(tests.id('restaurant_b'), 'promotions'), 'platform override grants B Promotions');
select is(private.branch_limit(tests.id('restaurant_b')), 1, 'Silver includes 1 branch');
select is(private.branch_limit(tests.id('restaurant_a')), null, 'Gold/trial: unlimited branches (P2-Q3)');
update public.restaurant_entitlement_overrides set expires_at = now() - interval '1 second'
 where restaurant_id = tests.id('restaurant_b');
select ok(not private.has_feature(tests.id('restaurant_b'), 'promotions'), 'expired overrides stop applying');
select tests.authenticate_as('owner_b');
select is(tests.try_sql(format($s$insert into public.branches (restaurant_id, name) values (%L, 'Second')$s$, tests.id('restaurant_b'))),
          '23514', 'Silver cannot exceed its branch limit');
select is(tests.count_rows('public.platform_settings'), 0::bigint, 'restaurants cannot read platform settings directly');
select is(tests.count_rows('public.billing_prices'), 0::bigint, 'restaurants cannot read the price table directly');
reset role;
select tests.authenticate_as_anon();
select is((public.get_public_pricing()) -> 'plans' -> 0 ->> 'amount_minor', '12000', 'public pricing: Silver $120/yr');
select is((public.get_public_pricing()) -> 'plans' -> 1 ->> 'amount_minor', '18000', 'public pricing: Gold $180/yr');
reset role;

-- ===== Choosing a plan (no-trial restaurant) ==================================================
select tests.authenticate_as('outsider');
insert into ids select 'inv1', public.choose_plan((select id from ids where name = 'second'), 'silver', 1);
select is((select total_minor from public.billing_invoices where id = (select id from ids where name = 'inv1')), 18000::bigint,
          'Silver + 1 extra branch = $180, tax 0% (P2-Q8)');
select is(tests.try_sql(format($s$select public.choose_plan(%L, 'gold', 2)$s$, (select id from ids where name = 'second'))),
          '22023', 'Gold already has unlimited branches: extras refused');
insert into ids select 'inv2', public.choose_plan((select id from ids where name = 'second'), 'silver', 0);
select is((select count(*) from public.billing_invoices where restaurant_id = (select id from ids where name = 'second')
             and status = 'open'), 1::bigint, 'a new invoice replaces the previous open one');
reset role;
select tests.authenticate_as('manager_a');
select is(tests.try_sql(format($s$select public.choose_plan(%L, 'silver', 0)$s$, tests.id('restaurant_a'))), '42501',
          'only billing.manage (owners) can buy');
select is(tests.count_rows('public.billing_invoices'), 0::bigint, 'managers cannot read invoices');
reset role;

-- Price snapshot: a later price change does not alter the issued invoice.
select tests.authenticate_as('super_admin', 'aal2');
select lives_ok($s$select public.platform_set_price('plan', 'silver', 15000)$s$, 'Super Admin changes the Silver price');
reset role;
select is((select total_minor from public.billing_invoices where id = (select id from ids where name = 'inv2')), 12000::bigint,
          'issued invoices keep the price at the time they were issued');
select is(private.current_price('plan', (select id from public.plans where key = 'silver')), 15000::bigint,
          'new invoices use the new price');
select ok(exists (select 1 from public.platform_audit_events where action = 'pricing.price_changed'),
          'price changes are platform-audited');

-- ===== Recording payments ===================================================================
select tests.authenticate_as('finance', 'aal1');
select is(tests.try_sql(format($s$select public.platform_record_payment(%L, 12000, 'bank_transfer', 'TRX-1')$s$,
                               (select id from ids where name = 'inv2'))), '42501', 'Finance without MFA is refused');
select tests.authenticate_as('support', 'aal2');
select is(tests.try_sql(format($s$select public.platform_record_payment(%L, 12000, 'bank_transfer', 'TRX-1')$s$,
                               (select id from ids where name = 'inv2'))), '42501', 'Support cannot record payments');
select tests.authenticate_as('finance', 'aal2');
select is(tests.try_sql(format($s$select public.platform_record_payment(%L, 999, 'bank_transfer', 'TRX-1')$s$,
                               (select id from ids where name = 'inv2'))), '22023', 'amount must match the invoice');
insert into ids select 'pay1', public.platform_record_payment((select id from ids where name = 'inv2'), 12000, 'bank_transfer', 'TRX-1');
select is(public.platform_record_payment((select id from ids where name = 'inv2'), 12000, 'bank_transfer', 'TRX-1'),
          (select id from ids where name = 'pay1'), 'replaying the same payment is idempotent');
reset role;
select is((select status::text from public.restaurants where id = (select id from ids where name = 'second')), 'active',
          'payment activates the restaurant');
select is((select count(*) from public.subscription_periods where restaurant_id = (select id from ids where name = 'second')),
          1::bigint, 'exactly one paid period (no double credit)');
select ok((select ends_at = starts_at + interval '1 year' from public.subscription_periods
            where restaurant_id = (select id from ids where name = 'second')), 'annual period');
select is(tests.try_sql($s$delete from public.billing_payments$s$), '42501', 'payments are append-only');

-- ===== Proration: extra branch and upgrade on B (30 days into a Silver year) ================
select tests.authenticate_as('owner_b');
insert into ids select 'inv_branch', public.buy_extra_branches(tests.id('restaurant_b'), 1);
reset role;
select ok((select total_minor between 5490 and 5520 from public.billing_invoices where id = (select id from ids where name = 'inv_branch')),
          'extra branch is prorated to the remaining ~335/365 of the year');
select tests.authenticate_as('finance', 'aal2');
select public.platform_record_payment((select id from ids where name = 'inv_branch'),
         (select total_minor from public.billing_invoices where id = (select id from ids where name = 'inv_branch')),
         'bank_transfer', 'TRX-B-BRANCH');
reset role;
select is(private.branch_limit(tests.id('restaurant_b')), 2, 'paid extra branch raises the limit to 2');
select is((select count(*) from public.subscription_periods where restaurant_id = tests.id('restaurant_b')), 2::bigint,
          'the period was split, keeping history');
select tests.authenticate_as('owner_b');
select lives_ok(format($s$insert into public.branches (restaurant_id, name) values (%L, 'Second')$s$, tests.id('restaurant_b')),
                'now a second branch can be added');
insert into ids select 'inv_up', public.upgrade_plan(tests.id('restaurant_b'), 'gold');
select is(tests.try_sql(format($s$select public.upgrade_plan(%L, 'silver')$s$, tests.id('restaurant_b'))), '22023',
          'downgrades are refused mid-term (they apply at renewal)');
reset role;
select ok((select total_minor between 5490 and 5520 from public.billing_invoices where id = (select id from ids where name = 'inv_up')),
          'upgrade charges the prorated difference ($60 x ~335/365), even after a period split');
select tests.authenticate_as('finance', 'aal2');
select public.platform_record_payment((select id from ids where name = 'inv_up'),
         (select total_minor from public.billing_invoices where id = (select id from ids where name = 'inv_up')),
         'bank_transfer', 'TRX-B-UP');
reset role;
select ok(private.has_feature(tests.id('restaurant_b'), 'frames'), 'after upgrade B has Gold features');
select is(private.branch_limit(tests.id('restaurant_b')), null, 'after upgrade B has unlimited branches');

-- ===== Lifecycle: B's paid year runs out ======================================================
create temp table b_end as select max(ends_at) as t from public.subscription_periods where restaurant_id = tests.id('restaurant_b');
select private.run_billing_lifecycle(now(), tests.id('restaurant_b'));
select is((select status::text from public.restaurants where id = tests.id('restaurant_b')), 'active', 'covered: stays Active');
select private.run_billing_lifecycle((select t from b_end) - interval '10 days', tests.id('restaurant_b'));
select ok(exists (select 1 from public.billing_invoices where restaurant_id = tests.id('restaurant_b') and status = 'open'
                   and kind = 'new_period'), 'a renewal invoice is issued inside the renewal window');

create function pg_temp.status_after(p_days numeric) returns text language plpgsql as $$
begin
  perform private.run_billing_lifecycle((select t from b_end) + make_interval(secs => p_days * 86400), tests.id('restaurant_b'));
  return (select status::text from public.restaurants where id = tests.id('restaurant_b'));
end $$;
select is(pg_temp.status_after(1), 'past_due', 'coverage ended: Past Due');
select tests.authenticate_as('owner_b');
select is((public.get_my_context()) -> 'active_memberships' -> 0 ->> 'writable', 'true', 'Past Due: still fully usable');
reset role;
select ok(private.restaurant_publicly_available(tests.id('restaurant_b')), 'Past Due: site still online');
select is(pg_temp.status_after(8), 'grace', 'after 7 days: Grace');
select ok(private.restaurant_publicly_available(tests.id('restaurant_b')), 'Grace: site still online');
select is(pg_temp.status_after(29), 'suspended', 'after 7+21 days: Suspended');
select ok(not private.restaurant_publicly_available(tests.id('restaurant_b')), 'Suspended: public site offline');

-- Suspended behaviour (P2-Q6): owner read-only, staff blocked, renewal still possible.
select tests.authenticate_as('owner_b');
select is(tests.count_rows('public.restaurants'), 1::bigint, 'Suspended: owner can still read');
select is(tests.try_sql(format($s$select public.invite_staff(%L, 'X', '+96899999998')$s$, tests.id('restaurant_b'))),
          '42501', 'Suspended: owner cannot invite staff');
select is(tests.try_dml(format($s$update public.branches set name = 'x' where restaurant_id = %L$s$, tests.id('restaurant_b'))),
          'denied', 'Suspended: owner cannot edit branches');
select is(tests.try_sql(format($s$insert into storage.objects (bucket_id, name) values ('restaurant-public', %L)$s$,
                               tests.id('restaurant_b') || '/new.png')), '42501', 'Suspended: owner cannot upload media');
select is((public.get_my_context()) -> 'active_memberships' -> 0 ->> 'writable', 'false', 'routing marks the restaurant read-only');
select tests.authenticate_as('waiter_b1');
select is(tests.count_rows('public.restaurants'), 0::bigint, 'Suspended: staff read nothing');
select is(tests.count_rows('public.branches'), 0::bigint, 'Suspended: staff see no branches');
select is((public.get_my_context()) ->> 'next', 'restaurant_unavailable', 'staff are told the restaurant is unavailable');
reset role;

select is(pg_temp.status_after(60), 'retention', 'after 30 days suspended: Retention');
select is(pg_temp.status_after(240), 'expiring', 'after 180 days retention: Expiring');
select tests.authenticate_as('owner_b');
select is(tests.count_rows('public.restaurants'), 1::bigint, 'Expiring: owner can still log in and renew');
reset role;
select is(pg_temp.status_after(270), 'deleted', 'after 30 days expiring: Deleted');
select tests.authenticate_as('owner_b');
select is(tests.count_rows('public.restaurants'), 0::bigint, 'Deleted: no access at all');
reset role;
select ok((select count(*) >= 6 from public.platform_audit_events
            where action = 'billing.status_changed' and object_id = tests.id('restaurant_b')),
          'every lifecycle transition is platform-audited');

-- ===== Reactivation from Suspended: no second trial, coverage starts at payment ==============
-- simulate: first restaurant's trial ended long ago
update public.subscription_periods set starts_at = now() - interval '100 days', ends_at = now() - interval '40 days'
 where restaurant_id = (select id from ids where name = 'first');
select private.run_billing_lifecycle(now(), (select id from ids where name = 'first'));
select is((select status::text from public.restaurants where id = (select id from ids where name = 'first')), 'suspended',
          'trial ended 40 days ago without a plan: Suspended');
select tests.authenticate_as('outsider');
insert into ids select 'inv_re', public.choose_plan((select id from ids where name = 'first'), 'gold', 0);
reset role;
select tests.authenticate_as('finance', 'aal2');
select public.platform_record_payment((select id from ids where name = 'inv_re'),
         (select total_minor from public.billing_invoices where id = (select id from ids where name = 'inv_re')),
         'bank_transfer', 'TRX-RE');
reset role;
select is((select status::text from public.restaurants where id = (select id from ids where name = 'first')), 'active',
          'paying reactivates a suspended restaurant');
select is((select count(*) from public.subscription_periods where restaurant_id = (select id from ids where name = 'first')
            and kind = 'trial'), 1::bigint, 'no second trial on return');

-- ===== Platform controls ========================================================================
select tests.authenticate_as('support', 'aal1');
select is(tests.try_sql('select public.platform_overview()'), '42501', 'every platform role needs MFA (P2-Q7)');
select tests.authenticate_as('finance', 'aal2');
select is(tests.try_sql($s$select public.platform_set_price('plan', 'gold', 1)$s$), '42501', 'Finance cannot change prices');
select is(tests.try_sql($s$select public.platform_set_setting('grace_days', '30')$s$), '42501', 'only Super Admin changes settings');
select tests.authenticate_as('super_admin', 'aal2');
select is(tests.try_sql($s$select public.platform_set_setting('grace_days', '"thirty"')$s$), '22023', 'setting types are validated');
select is(tests.try_sql($s$select public.platform_set_setting('nope', '1')$s$), '22023', 'unknown settings are refused');
select lives_ok($s$select public.platform_set_setting('grace_days', '30')$s$, 'Super Admin sets Grace to 30 days');
select is(tests.count_rows('public.platform_settings', $s$key = 'grace_days' and value = '30'$s$), 1::bigint,
          'platform staff can read settings');
select lives_ok(format($s$select public.platform_set_hold(%L, true, 'fraud review')$s$, tests.id('restaurant_a')),
                'Super Admin suspends a restaurant manually');
reset role;
select is((select status::text from public.restaurants where id = tests.id('restaurant_a')), 'suspended',
          'manual hold suspends immediately');
select tests.authenticate_as('super_admin', 'aal2');
select public.platform_set_hold(tests.id('restaurant_a'), false, 'cleared');
reset role;
select is((select status::text from public.restaurants where id = tests.id('restaurant_a')), 'trial', 'releasing the hold restores Trial');
select tests.authenticate_as('super_admin', 'aal2');
select ok(jsonb_array_length(public.platform_list_restaurants()) >= 3, 'platform can list restaurants');
reset role;
select ok(exists (select 1 from public.platform_audit_events where action = 'platform.restaurants_listed'),
          'listing restaurants is platform-audited');
select ok(exists (select 1 from public.platform_audit_events where action = 'restaurant.suspended_manually'
                   and reason = 'fraud review'), 'manual suspension is audited with its reason');

select * from finish();
rollback;
