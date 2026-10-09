-- Phase 4: the public website data path, templates (tiers, purchases, fallback), Frames expiry,
-- promotions windows, tables and QR tokens, analytics events, diner favorites.
begin;
select no_plan();
select tests.build_fixtures();

-- ===== Public website =======================================================================
select tests.authenticate_as_anon();
select is(public.public_site(tests.id('restaurant_a')), null, 'an unpublished website returns nothing');
select is(tests.try_sql(format('select public.preview_site(%L)', tests.id('restaurant_a'))), '42501',
          'visitors cannot preview');
reset role;

select tests.authenticate_as('waiter_a1');
select is(tests.try_sql(format('select public.preview_site(%L)', tests.id('restaurant_a'))), '42501',
          'staff without website.manage cannot preview');
select tests.authenticate_as('owner_a');
select is(public.preview_site(tests.id('restaurant_a')) ->> 'status', 'ok', 'owners preview an unpublished website');
select is(public.preview_site(tests.id('restaurant_a'), 'magazine') -> 'website' ->> 'template', 'magazine',
          'owners preview any active template with their own content');
select is(tests.try_dml(format('update public.website_settings set is_published = true where restaurant_id = %L',
                               tests.id('restaurant_a'))), '1', 'owner publishes the website');
reset role;

-- Hidden content and unreviewed AI translations never reach visitors.
insert into public.menu_items (id, restaurant_id, category_id, name, price_minor, is_active)
values (tests.id('a:hidden_item'), tests.id('restaurant_a'), tests.id('restaurant_a:cat'), '{"en": "Secret"}', 100, false);
update public.menu_items set name = name || '{"ar": "شوا"}',
       i18n_meta = '{"ar": {"source": "ai", "reviewed": false}}' where id = tests.id('restaurant_a:item');

select tests.authenticate_as_anon();
create temp table site_a as select public.public_site(tests.id('restaurant_a')) as s;
select is((select s ->> 'status' from site_a), 'ok', 'a published website is public');
select is((select jsonb_array_length(s -> 'items') from site_a), 1, 'only active items are public');
select is((select s -> 'items' -> 0 -> 'name' from site_a), '{"en": "Shuwa"}'::jsonb,
          'unreviewed AI translations are not shown');
select ok((select (s -> 'items' -> 0) ? 'media' and (s -> 'items' -> 0 -> 'media' -> 0 ->> 'path') like '%/menu/%' from site_a),
          'item photos are included, cover first');
select is((select jsonb_array_length(s -> 'frames') from site_a), 1, 'live Frames are public (A is on the Gold trial)');
select is((select jsonb_array_length(s -> 'promotions') from site_a), 1, 'running promotions are public');
select ok((select not (s -> 'restaurant') ? 'created_by' and not (s ? 'staff') from site_a), 'no internal fields leak');
reset role;

-- Expired Frames and finished promotions disappear.
update public.frames set published_at = published_at where id = tests.id('restaurant_a:frame');  -- no-op allowed
alter table public.frames disable trigger frames_publish_time;
update public.frames set published_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
 where id = tests.id('restaurant_a:frame');
alter table public.frames enable trigger frames_publish_time;
update public.promotions set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'
 where id = tests.id('restaurant_a:promo');
select tests.authenticate_as_anon();
select is(jsonb_array_length(public.public_site(tests.id('restaurant_a')) -> 'frames'), 0, 'Frames expire after 24 hours');
select is(jsonb_array_length(public.public_site(tests.id('restaurant_a')) -> 'promotions'), 0, 'ended promotions are hidden');
reset role;

-- Silver (B): promotions via override, but no Frames even though a row exists.
update public.website_settings set is_published = true where restaurant_id = tests.id('restaurant_b');
select tests.authenticate_as_anon();
select is(jsonb_array_length(public.public_site(tests.id('restaurant_b')) -> 'frames'), 0, 'Frames need the Frames feature');
select is(jsonb_array_length(public.public_site(tests.id('restaurant_b')) -> 'promotions'), 1,
          'promotions follow the entitlement (B has an override)');
reset role;

-- Suspended: the site is offline.
update public.restaurants set status = 'suspended' where id = tests.id('restaurant_b');
select tests.authenticate_as_anon();
select is(public.public_site(tests.id('restaurant_b')) ->> 'status', 'unavailable', 'a suspended website is offline');
select ok(not (public.public_site(tests.id('restaurant_b')) ? 'items'), 'an offline website exposes no menu');
reset role;
update public.restaurants set status = 'active' where id = tests.id('restaurant_b');

-- ===== Frames ===============================================================================
select tests.authenticate_as('owner_a');
select is(tests.try_sql(format($s$update public.frames set published_at = now() + interval '1 day' where id = %L$s$,
                               tests.id('restaurant_a:frame'))), '23514', 'a Frame cannot be re-dated to live longer');
select is(tests.try_sql(format($s$insert into public.frames (restaurant_id, kind, media_path, published_at)
                                  values (%L, 'image', %L, now() - interval '30 days')$s$,
                               tests.id('restaurant_a'), tests.id('restaurant_a') || '/frames/new.webp')), 'ok',
          'owners publish Frames');
select ok((select bool_and(expires_at = published_at + interval '24 hours' and published_at > now() - interval '1 minute')
             from public.frames where media_path like '%/frames/new.webp'),
          'publishing time is set by the server, expiry is exactly 24 hours later');
select tests.authenticate_as('owner_b');
select is(tests.try_sql(format($s$insert into public.frames (restaurant_id, kind, media_path) values (%L, 'image', %L)$s$,
                               tests.id('restaurant_b'), tests.id('restaurant_b') || '/frames/x.webp')), '23514',
          'Silver restaurants cannot publish Frames');
reset role;

-- ===== Templates ============================================================================
select tests.authenticate_as_anon();
select is(jsonb_array_length(public.list_templates()), 9, 'nine launch templates are listed publicly');
select is((select count(*) from jsonb_array_elements(public.list_templates()) t group by t ->> 'tier' having t ->> 'tier' = 'paid'),
          3::bigint, 'three of them are paid');
select is(tests.try_sql('select public.list_templates(null, true)'), '42501', 'only platform staff list inactive templates');
reset role;

select tests.authenticate_as('owner_a');
select is(tests.try_dml(format($s$update public.website_settings set template_key = 'showcase' where restaurant_id = %L$s$,
                               tests.id('restaurant_a'))), '1', 'Gold (trial) restaurants use Gold templates');
select is(tests.try_sql(format($s$update public.website_settings set template_key = 'cafe' where restaurant_id = %L$s$,
                               tests.id('restaurant_a'))), '23514', 'paid templates need a purchase');
select tests.authenticate_as('owner_b');
select is(tests.try_sql(format($s$update public.website_settings set template_key = 'bold' where restaurant_id = %L$s$,
                               tests.id('restaurant_b'))), '23514', 'Silver restaurants cannot use Gold templates');
select is(tests.try_sql(format($s$update public.website_settings set template_key = 'elegant' where restaurant_id = %L$s$,
                               tests.id('restaurant_b'))), '23514', 'an unpaid purchase does not unlock a template');
select is(tests.try_sql(format($s$select public.buy_template(%L, 'elegant')$s$, tests.id('restaurant_b'))), '23505',
          'a template cannot be bought twice');
select is(tests.try_sql(format($s$select public.buy_template(%L, 'classic')$s$, tests.id('restaurant_b'))), '22023',
          'free templates are not sold');
select is((select (t ->> 'usable')::boolean from jsonb_array_elements(public.list_templates(tests.id('restaurant_b'))) t
            where t ->> 'key' = 'elegant'), false, 'the catalogue shows the template as not yet usable');
select tests.authenticate_as('waiter_b1');
select is(tests.try_sql(format($s$select public.buy_template(%L, 'magazine')$s$, tests.id('restaurant_b'))), '42501',
          'only owners buy templates');
reset role;

-- Paying the invoice unlocks the template.
select private.apply_paid_invoice(tests.id('invoice_b_template'));
select is((select status::text from public.template_purchases where invoice_id = tests.id('invoice_b_template')), 'paid',
          'paying the invoice marks the purchase paid');
select tests.authenticate_as('owner_b');
select is(tests.try_dml(format($s$update public.website_settings set template_key = 'elegant' where restaurant_id = %L$s$,
                               tests.id('restaurant_b'))), '1', 'a bought template can be used');
reset role;

-- After a downgrade the website falls back to Classic without touching the stored choice.
alter table public.website_settings disable trigger website_settings_template_guard;  -- simulate a past choice
update public.website_settings set template_key = 'showcase' where restaurant_id = tests.id('restaurant_b');
alter table public.website_settings enable trigger website_settings_template_guard;
select tests.authenticate_as_anon();
select is(public.public_site(tests.id('restaurant_b')) -> 'website' ->> 'template', 'classic',
          'a template the plan no longer includes falls back to Classic');
reset role;

-- ===== Tables and QR ========================================================================
select tests.authenticate_as('waiter_a1');
select is(tests.try_sql(format($s$select public.create_table(%L, 'T9')$s$, tests.id('a1'))), '42501',
          'waiters cannot create tables (no qr.manage)');
select is(tests.count_rows('public.qr_codes'), 0::bigint, 'waiters cannot see QR codes');
select tests.authenticate_as('owner_a');
create temp table t9 as select public.create_table(tests.id('a1'), 'T9', 'Terrace') as id;
grant select on t9 to anon, authenticated;
select is((select count(*) from public.qr_codes where table_id = (select id from t9) and is_active), 1::bigint,
          'a new table gets its QR code');
select is(tests.try_sql(format($s$select public.create_table(%L, 't9')$s$, tests.id('a1'))), '23505',
          'table labels are unique per branch');
create temp table tok1 as select token from public.qr_codes where table_id = (select id from t9) and revoked_at is null;
grant select on tok1 to anon, authenticated;
select tests.authenticate_as_anon();
select is(public.resolve_qr((select token from tok1)) ->> 'table_label', 'T9', 'scanning a table QR gives table context');
select is(public.resolve_qr('not-a-real-token-xxxxxxxxxxxxxx'), null, 'unknown tokens resolve to nothing');
select tests.authenticate_as('owner_a');
select public.regenerate_table_qr((select id from t9));
select tests.authenticate_as_anon();
select is(public.resolve_qr((select token from tok1)), null, 'regenerating invalidates the old QR code');
select tests.authenticate_as('owner_a');
select public.set_table_active((select id from t9), false);
reset role;
create temp table tok2 as select token from public.qr_codes where table_id = (select id from t9) and revoked_at is null;
grant select on tok2 to anon;
select tests.authenticate_as_anon();
select is(public.resolve_qr((select token from tok2)), null, 'a deactivated table''s QR code does not resolve');
reset role;
select ok((select count(*) from public.analytics_events where event_type = 'qr_scan' and restaurant_id = tests.id('restaurant_a')) >= 1,
          'QR scans are recorded');
select tests.authenticate_as('owner_b');
select is(tests.try_sql(format($s$select public.create_table(%L, 'X')$s$, tests.id('a1'))), '42501',
          'Restaurant B cannot add tables to Restaurant A');
select is(tests.try_sql(format($s$select public.regenerate_table_qr(%L)$s$, tests.id('restaurant_a:table'))), '42501',
          'Restaurant B cannot regenerate Restaurant A''s QR codes');
reset role;

-- ===== Analytics events =====================================================================
select tests.authenticate_as_anon();
select public.track_event(tests.id('restaurant_a'), 'go_click', 'session-anon-0001', null, tests.id('a1'));
select public.track_event(tests.id('restaurant_a'), 'item_view', 'session-anon-0001', null, tests.id('b1'));
select tests.authenticate_as('owner_a');
select public.track_event(tests.id('restaurant_a'), 'website_view', 'session-owner-001');
reset role;
select is((select is_internal from public.analytics_events where session_id = 'session-anon-0001' and event_type = 'go_click'),
          false, 'visitor events count');
select is((select is_internal from public.analytics_events where session_id = 'session-owner-001'), true,
          'staff activity is marked internal (excluded from analytics)');
select is((select branch_id from public.analytics_events where session_id = 'session-anon-0001' and event_type = 'item_view'),
          null, 'another restaurant''s branch is not recorded');
select tests.authenticate_as_anon();
select public.track_event(tests.id('restaurant_a'), 'menu_view', 'session-flood-0001') from generate_series(1, 130);
reset role;
select is((select count(*) from public.analytics_events where session_id = 'session-flood-0001'), 120::bigint,
          'at most 120 events per session per minute');
select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.analytics_events'), 0::bigint, 'staff without analytics.view cannot read events');
select tests.authenticate_as('owner_a');
select ok(tests.count_rows('public.analytics_events') > 0, 'owners read their events');
select is(tests.count_rows('public.analytics_events', format('restaurant_id = %L', tests.id('restaurant_b'))), 0::bigint,
          'owners never read another restaurant''s events');
reset role;

-- ===== Diner favorites ======================================================================
select tests.authenticate_as('diner');
select is(tests.count_rows('public.diner_favorites'), 1::bigint, 'diners see their own favorites');
select is(tests.try_dml(format($s$insert into public.diner_favorites (user_id, restaurant_id) values (%L, %L)$s$,
                               tests.id('diner'), tests.id('restaurant_a'))), '1', 'diners favorite a restaurant');
select is(tests.try_sql(format($s$insert into public.diner_favorites (user_id, restaurant_id) values (%L, %L)$s$,
                               tests.id('outsider'), tests.id('restaurant_a'))), '42501',
          'nobody can add favorites for someone else');
select is(jsonb_array_length(public.my_favorites()), 2, 'the diner''s favorites list shows names from published websites');
reset role;
update public.website_settings set is_published = false where restaurant_id = tests.id('restaurant_a');
select tests.authenticate_as('diner');
select is(jsonb_array_length(public.my_favorites()), 1, 'favorites of unpublished websites are not listed');
reset role;
update public.website_settings set is_published = true where restaurant_id = tests.id('restaurant_a');
select tests.authenticate_as('diner');
select is(jsonb_array_length(public.my_favorites()), 2, 'the diner''s favorites list shows names from published websites');
select tests.authenticate_as('owner_b');
select is(tests.count_rows('public.diner_favorites'), 0::bigint, 'restaurants cannot read diners'' favorites');
select is(jsonb_array_length(public.my_favorites()), 0, 'my_favorites only ever returns the caller''s own');
select tests.authenticate_as('diner');
select public.delete_my_diner_data();
select is(tests.count_rows('public.diner_favorites'), 0::bigint, 'diners delete their own data');
reset role;

select * from finish();
rollback;
