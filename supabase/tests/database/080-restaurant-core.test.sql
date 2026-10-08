-- Phase 3: menu permissions and plan limits, AI credits and jobs, languages, branch hours,
-- slugs and domains, staff security (devices, PIN unlock, re-authentication, staff management).
begin;
select no_plan();
select tests.build_fixtures();

-- ===== Menu ================================================================================
select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.menu_items'), 1::bigint, 'waiters can read the menu (menu.view)');
select is(tests.try_dml(format($s$update public.menu_items set price_minor = 1 where id = %L$s$, tests.id('restaurant_a:item'))),
          '0', 'waiters cannot change the menu (no menu.edit)');
select is(tests.try_sql(format($s$insert into public.menu_categories (restaurant_id, name) values (%L, '{"en":"X"}')$s$,
                               tests.id('restaurant_a'))), '42501', 'waiters cannot add categories');
select tests.authenticate_as('manager_a');
select lives_ok(format($s$insert into public.menu_categories (restaurant_id, name) values (%L, '{"en":"Drinks","ar":"مشروبات"}')$s$,
                       tests.id('restaurant_a')), 'managers can add categories');
select is(tests.try_sql(format($s$insert into public.menu_categories (restaurant_id, name) values (%L, '{"en":""}')$s$,
                               tests.id('restaurant_a'))), '23514', 'names must not be empty');
select is(tests.try_sql(format($s$insert into public.menu_items (restaurant_id, category_id, name, price_minor) values (%L, %L, '{"en":"Spy"}', 1)$s$,
                               tests.id('restaurant_a'), tests.id('restaurant_b:cat'))), '23503',
          'an item cannot point at another restaurant''s category');
select is(tests.try_sql(format($s$delete from public.menu_items where id = %L$s$, tests.id('restaurant_a:item'))), '42501',
          'menu items are archived, never deleted');
select is(tests.try_sql(format($s$update public.menu_items set restaurant_id = %L where id = %L$s$,
                               tests.id('restaurant_b'), tests.id('restaurant_a:item'))), '23514',
          'rows cannot be moved to another restaurant');
reset role;

-- Plan limits: Silver/Gold allow 5 images and 1 video per item.
select tests.authenticate_as('owner_a');
select lives_ok(format($s$insert into public.menu_item_media (restaurant_id, item_id, kind, storage_path)
                         select %1$L, %2$L, 'image', %1$L || '/menu/extra-' || g || '.webp' from generate_series(1, 4) g$s$,
                       tests.id('restaurant_a'), tests.id('restaurant_a:item')), 'up to 5 images per item');
select is(tests.try_sql(format($s$insert into public.menu_item_media (restaurant_id, item_id, kind, storage_path)
                                 values (%1$L, %2$L, 'image', %1$L || '/menu/sixth.webp')$s$,
                               tests.id('restaurant_a'), tests.id('restaurant_a:item'))), '23514', 'the 6th image is refused');
select lives_ok(format($s$insert into public.menu_item_media (restaurant_id, item_id, kind, storage_path)
                         values (%1$L, %2$L, 'video', %1$L || '/menu/clip.mp4')$s$, tests.id('restaurant_a'), tests.id('restaurant_a:item')),
                'one video per item');
select is(tests.try_sql(format($s$insert into public.menu_item_media (restaurant_id, item_id, kind, storage_path)
                                 values (%1$L, %2$L, 'video', %1$L || '/menu/clip2.mp4')$s$,
                               tests.id('restaurant_a'), tests.id('restaurant_a:item'))), '23514', 'a second video is refused');
select is(tests.try_sql(format($s$insert into public.menu_item_media (restaurant_id, item_id, kind, storage_path)
                                 values (%1$L, %2$L, 'image', %3$L || '/menu/elsewhere.webp')$s$,
                               tests.id('restaurant_a'), tests.id('restaurant_a:item'), tests.id('restaurant_b'))), '23514',
          'media paths must be in the restaurant''s own folder');
reset role;

-- ===== Branch hours and open/closed ======================================================
-- Fixture: A1 open Sundays 09:00–23:00 (Muscat time).
select ok(private.branch_is_open(tests.id('a1'), '2026-10-11 10:00:00+04'), 'open on Sunday 10:00 Muscat');
select ok(not private.branch_is_open(tests.id('a1'), '2026-10-11 23:30:00+04'), 'closed on Sunday 23:30');
select ok(not private.branch_is_open(tests.id('a1'), '2026-10-12 10:00:00+04'), 'closed on Monday (no hours)');
insert into public.branch_hours (restaurant_id, branch_id, day_of_week, opens_at, closes_at)
values (tests.id('restaurant_a'), tests.id('a1'), 5, '18:00', '02:00');
select ok(private.branch_is_open(tests.id('a1'), '2026-10-17 01:00:00+04'), 'overnight hours: Friday 18:00 → Saturday 02:00');
update public.branches set status_override = 'closed', override_until = '2026-10-11 12:00:00+04' where id = tests.id('a1');
select ok(not private.branch_is_open(tests.id('a1'), '2026-10-11 10:00:00+04'), 'manual "closed" override wins');
select ok(private.branch_is_open(tests.id('a1'), '2026-10-11 13:00:00+04'), 'override expires');

-- ===== Languages ==============================================================================
select tests.authenticate_as('owner_a');
select lives_ok(format($s$select public.set_restaurant_languages(%L, array['ar'])$s$, tests.id('restaurant_a')), 'owner activates Arabic');
select is(tests.count_rows('public.restaurant_languages', format('restaurant_id = %L', tests.id('restaurant_a'))), 2::bigint,
          'default language stays active alongside Arabic');
select is(tests.try_sql(format($s$select public.set_restaurant_languages(%L, array['fr'])$s$, tests.id('restaurant_a'))), '22023',
          'languages the platform has not enabled are refused');
reset role;

-- ===== AI credits and jobs =================================================================
select is(private.ai_credit_balance(tests.id('restaurant_a')), 100, 'every restaurant starts with 100 free credits');
select is(tests.try_sql($s$update public.ai_credit_ledger set delta = 999$s$), '42501', 'the credit ledger is append-only');
select tests.authenticate_as('owner_a');
create temp table j (name text primary key, id uuid);
grant all on j to authenticated, service_role;
insert into j select 'import', public.start_menu_import(tests.id('restaurant_a'), tests.id('restaurant_a') || '/imports/menu.pdf');
select is(tests.try_sql(format($s$select public.complete_menu_import(%L, '{"categories":[]}')$s$, (select id from j where name = 'import'))),
          '42501', 'clients cannot record AI results (no free credits by faking a small result)');
reset role;
select tests.authenticate_as_service_role();
select is(public.complete_menu_import((select id from j where name = 'import'),
          '{"categories":[{"name":"Grills","items":[{"name":"Mixed grill","price_minor":5500},{"name":"Kebab","price_minor":3000}]}]}'),
          'needs_review', 'server records the extraction; 2 items → 2 credits');
reset role;
select is(private.ai_credit_balance(tests.id('restaurant_a')), 98, '2 credits charged');
select tests.authenticate_as('owner_a');
select is(public.apply_menu_import((select id from j where name = 'import'),
          '{"categories":[{"name":"Grills","items":[{"name":"Mixed grill","price_minor":5500},{"name":"Kebab (edited)","price_minor":3200}]}]}'),
          2, 'owner publishes the reviewed import');
select is(tests.count_rows('public.menu_items', $s$name ->> 'en' = 'Kebab (edited)'$s$), 1::bigint, 'edits made during review are kept');
select is(tests.try_sql(format($s$select public.apply_menu_import(%L, '{"categories":[]}')$s$, (select id from j where name = 'import'))),
          '22023', 'an import publishes only once');

-- Translation: Arabic is active (above); 3 items in A's menu now.
insert into j select 'tr', (public.start_translation(tests.id('restaurant_a'), 'ar', '{"type":"menu"}') ->> 'job_id')::uuid;
reset role;
select is((select item_count from public.ai_jobs where id = (select id from j where name = 'tr')), 3, 'translating the menu costs 1 credit per item');
select tests.authenticate_as_service_role();
select is(public.complete_translation((select id from j where name = 'tr'),
          jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', tests.id('restaurant_a:item'), 'name', 'شواء')))),
          'completed', 'translation recorded');
reset role;
select is((select name ->> 'ar' from public.menu_items where id = tests.id('restaurant_a:item')), 'شواء', 'Arabic name written');
select is((select (i18n_meta -> 'ar' ->> 'reviewed') from public.menu_items where id = tests.id('restaurant_a:item')), 'false',
          'AI translations are drafts until reviewed');
select is(private.ai_credit_balance(tests.id('restaurant_a')), 95, '3 more credits charged');
select tests.authenticate_as('owner_a');
select public.mark_translation_reviewed('menu_items', tests.id('restaurant_a:item'), 'ar');
reset role;
select is((select (i18n_meta -> 'ar' ->> 'reviewed') from public.menu_items where id = tests.id('restaurant_a:item')), 'true',
          'a person marks the translation reviewed');

-- Not enough credits: the result waits until credits are bought.
insert into public.ai_credit_ledger (restaurant_id, delta, reason, note) values (tests.id('restaurant_a'), -94, 'adjustment', 'test');
select tests.authenticate_as('owner_a');
insert into j select 'import2', public.start_menu_import(tests.id('restaurant_a'), tests.id('restaurant_a') || '/imports/menu2.pdf');
reset role;
select tests.authenticate_as_service_role();
select is(public.complete_menu_import((select id from j where name = 'import2'),
          '{"categories":[{"name":"Sweets","items":[{"name":"Halwa"},{"name":"Luqaimat"}]}]}'), 'needs_credits',
          'with 1 credit left, a 2-item import waits for credits');
reset role;
select tests.authenticate_as('owner_a');
insert into j select 'pack', public.buy_ai_credits(tests.id('restaurant_a'), 1);
reset role;
select is((select total_minor from public.billing_invoices where id = (select id from j where name = 'pack')), 500::bigint,
          'a 100-credit pack costs $5');
select tests.authenticate_as('finance_p3', 'aal2');
reset role;
insert into public.platform_staff (user_id, role) select tests.create_user('finance_p3', '+96890000099'), 'finance';
select tests.authenticate_as('finance_p3', 'aal2');
select public.platform_record_payment((select id from j where name = 'pack'), 500, 'bank_transfer', 'TRX-CREDITS');
reset role;
select is(private.ai_credit_balance(tests.id('restaurant_a')), 101, 'paid pack adds 100 credits');
select tests.authenticate_as('owner_a');
select lives_ok(format('select public.unlock_ai_job(%L)', (select id from j where name = 'import2')), 'the waiting import is unlocked');
reset role;
select is((select status::text from public.ai_jobs where id = (select id from j where name = 'import2')), 'needs_review', 'ready to review');

-- ===== Slugs and domains ===================================================================
select tests.authenticate_as('owner_a');
select public.change_restaurant_slug(tests.id('restaurant_a'), 'alpha-new');
reset role;
select tests.authenticate_as_anon();
select is((public.resolve_restaurant_slug('restaurant-a')) ->> 'slug', 'alpha-new', 'old slug resolves to the new one');
select is((public.resolve_restaurant_slug('restaurant-a')) ->> 'redirect', 'true', 'old slug is a permanent redirect');
reset role;
select tests.authenticate_as('owner_b');
select is(tests.try_sql(format($s$select public.change_restaurant_slug(%L, 'restaurant-a')$s$, tests.id('restaurant_b'))), '23505',
          'another restaurant cannot take a slug that still redirects');
select is(tests.try_sql(format($s$select public.add_custom_domain(%L, 'bravo-restaurant.test')$s$, tests.id('restaurant_b'))), '23505',
          'a hostname maps to one restaurant only');
select is(tests.try_sql(format($s$select public.add_custom_domain(%L, 'shop.gomenu.om')$s$, tests.id('restaurant_b'))), '23514',
          'GoMenu''s own domain cannot be claimed');
select is(tests.try_sql(format($s$select public.set_domain_status(%L, 'active')$s$, (select id from public.restaurant_domains limit 1))),
          '42501', 'only the server can set domain status');
reset role;
select tests.authenticate_as_anon();
select is((public.resolve_host('bravo-restaurant.test')) ->> 'restaurant_id', tests.id('restaurant_b')::text,
          'active custom domain resolves to its restaurant');
reset role;

-- ===== Staff security ===================================================================
-- Re-authentication: Owner/Admin role changes need an OTP from the last 10 minutes.
select tests.authenticate_as('owner_a');
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key = 'admin'), 'all')$s$,
                               tests.id('membership:restaurant_a:manager_a'))), '42501', 'promoting to Admin without a fresh OTP is refused');
select tests.authenticate_as('owner_a', 'aal1', 3600);
select is(tests.try_sql(format($s$select public.assign_staff_role(%L, (select id from public.roles where key = 'admin'), 'all')$s$,
                               tests.id('membership:restaurant_a:manager_a'))), '42501', 'an OTP from an hour ago is too old');
select tests.authenticate_as('owner_a', 'aal1', 60);
select lives_ok(format($s$select public.assign_staff_role(%L, (select id from public.roles where key = 'admin'), 'all')$s$,
                       tests.id('membership:restaurant_a:manager_a')), 'with a fresh OTP the owner promotes to Admin');
select is(tests.try_sql($s$select public.set_security_settings('00000000-0000-0000-0000-000000000000', 10)$s$), '42501',
          'security settings need permission');
select lives_ok(format('select public.set_security_settings(%L, 10)', tests.id('restaurant_a')), 'owner sets auto-lock with a fresh OTP');

-- Staff management
select lives_ok(format($s$select public.set_staff_status(%L, 'disabled', 'left for holiday')$s$, tests.id('membership:restaurant_a:waiter_a1')),
                'owner disables a waiter');
reset role;
select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.restaurants'), 0::bigint, 'a disabled waiter loses access immediately');
reset role;
select tests.authenticate_as('owner_a', 'aal1', 60);
select lives_ok(format($s$select public.change_staff_phone(%L, '+96891112222', 'new SIM')$s$, tests.id('membership:restaurant_a:waiter_a1')),
                'owner changes a staff member''s number (audited, fresh OTP)');
reset role;
select is((select phone_confirmed_at from auth.users where id = tests.id('waiter_a1')), null,
          'the new number must be verified by OTP at next login');
select ok(exists (select 1 from public.audit_events where action = 'staff.phone_changed'
                   and before ->> 'phone' = '+96890000003' and after ->> 'phone' = '+96891112222'), 'phone change audited with before/after');

-- Devices and PIN unlock (service-role server path)
select tests.authenticate_as('new_staff_a', 'aal1', 30);
select lives_ok($s$select public.register_trusted_device('device-shared-tablet-0123456789abcdef01234', 'Tablet', 'test')$s$,
                'device trusted right after an OTP login');
reset role;
select tests.authenticate_as('new_staff_a');
select is(tests.try_sql($s$select public.register_trusted_device('device-other-0123456789abcdef0123456789', 'x', 'y')$s$), '42501',
          'a device cannot be trusted without a fresh OTP');
reset role;
select tests.authenticate_as_service_role();
select public.park_device_session('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), 'ciphertext-1');
select is(jsonb_array_length(public.list_parked_sessions('device-shared-tablet-0123456789abcdef01234')), 1, 'staff switcher lists the parked person');
select is(public.pin_unlock('device-unknown-0123456789abcdef0123456789', tests.id('new_staff_a'), '583920') ->> 'reason',
          'device_not_trusted', 'PIN does nothing on an untrusted device');
select is(public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '000000') ->> 'reason',
          'no_pin', 'no PIN set yet');
reset role;
insert into private.staff_credentials (user_id, pin_hash) values (tests.id('new_staff_a'), extensions.crypt('583920', extensions.gen_salt('bf', 4)));
select tests.authenticate_as_service_role();
select is(public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '111111') ->> 'reason',
          'wrong_pin', 'wrong PIN refused');
select is(public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '583920') ->> 'ciphertext',
          'ciphertext-1', 'correct PIN releases the parked session');
select is(public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '583920') ->> 'reason',
          'no_parked_session', 'a parked session is released only once');
select public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '000001') from generate_series(1, 5);
select is(public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '583920') ->> 'reason',
          'locked', '5 wrong PINs lock the PIN, even against the right one');
reset role;
select tests.authenticate_as('new_staff_a');
select lives_ok('select public.logout_all_devices()', 'logout from all devices');
reset role;
select is((select count(*) from public.user_devices where user_id = tests.id('new_staff_a') and revoked_at is null), 0::bigint,
          'all devices untrusted');
select tests.authenticate_as_service_role();
select is(public.pin_unlock('device-shared-tablet-0123456789abcdef01234', tests.id('new_staff_a'), '583920') ->> 'reason',
          'device_not_trusted', 'after logout everywhere, PIN unlock is refused');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'auth.pin_failed'), 'failed PINs are audited');
select ok(not has_table_privilege('authenticated', 'private.device_sessions', 'select'), 'parked sessions are unreadable by clients');

-- ===== Dashboard ============================================================================
select tests.authenticate_as('owner_b');
select is((public.restaurant_dashboard(tests.id('restaurant_b')) -> 'menu' ->> 'items')::integer, 1, 'dashboard counts B''s menu');
select is(tests.try_sql(format('select public.restaurant_dashboard(%L)', tests.id('restaurant_a'))), '42501',
          'no dashboard for another restaurant');
reset role;

-- ===== Credit pack price ====================================================================
select tests.authenticate_as('owner_a');
select is(public.ai_credit_pack_info(), '{"size": 100, "amount_minor": 500, "currency": "USD"}'::jsonb,
          'owners see the credit pack size and price before buying');
reset role;

select * from finish();
rollback;
