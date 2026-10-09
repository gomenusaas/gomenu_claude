-- Phase 5: the order engine and payments. Server-side pricing, availability, confirmation and
-- the kitchen release rule, atomic accept (mode C), reject/cancel, branch scope, tenant isolation,
-- New Staff zero access, waiter orders and controlled edits, online payment only through verified
-- idempotent webhooks, offline payments, refunds, gateway eligibility and private terms.
begin;
select no_plan();
select tests.build_fixtures();

-- Scratch values shared across roles.
create temp table t (k text primary key, v text);
grant all on t to anon, authenticated, service_role;
create function pg_temp.v(p_k text) returns text language sql as $$ select v from t where k = p_k $$;
grant execute on function pg_temp.v(text) to anon, authenticated, service_role;

-- Restaurant A takes orders and online payments; both branches are open; a kitchen user in A1.
update public.website_settings set is_published = true, ordering_enabled = true, online_payment_enabled = true
 where restaurant_id = tests.id('restaurant_a');
update public.branches set status_override = 'open' where restaurant_id = tests.id('restaurant_a');
update public.platform_settings set value = 'true' where key = 'testing_gateways_visible';
select tests.create_user('kitchen_a1', '+96890000007');
select tests.add_member('restaurant_a', 'kitchen_a1', 'kitchen', 'active', 'selected', array['a1']);
insert into t values
  ('item', tests.id('restaurant_a:item')::text),
  ('rice', (select id::text from public.menu_options where group_id = tests.id('restaurant_a:group'))),
  ('qr_a', replace(tests.id('restaurant_a:qr_table')::text, '-', '')),
  ('qr_b', replace(tests.id('restaurant_b:qr_table')::text, '-', ''));

-- ===== Placing orders: the server prices and validates ==========================================
select tests.authenticate_as_anon();
-- The fixture item is sold out in A1 (branch override).
select is(tests.try_sql(format($q$select public.place_order(%L, %L)$q$, tests.id('restaurant_a'),
  jsonb_build_object('branch_id', tests.id('a1'), 'service_type', 'pickup',
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))),
  '22023', 'sold-out items cannot be ordered in that branch');
-- In A2 it is available. The browser's price is ignored: Large (60.00) + rice (5.00) from the menu.
insert into t select 'pickup', public.place_order(tests.id('restaurant_a'),
  jsonb_build_object('branch_id', tests.id('a2'), 'service_type', 'pickup', 'customer_name', 'Guest',
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item'), 'price_minor', 1,
                                                                   'option_ids', jsonb_build_array(pg_temp.v('rice')),
                                                                   'quantity', 2))))::text;
select is(tests.try_sql('select count(*) from public.orders'), '42501', 'visitors cannot read the orders table');
select is(tests.try_sql(format($q$select public.place_order(%L, %L)$q$, tests.id('restaurant_b'),
  jsonb_build_object('branch_id', tests.id('b1'), 'service_type', 'pickup',
                     'items', jsonb_build_array(jsonb_build_object('item_id', tests.id('restaurant_b:item')))))),
  '22023', 'a restaurant that does not take online orders refuses them');
select is(tests.try_sql(format($q$select public.place_order(%L, %L)$q$, tests.id('restaurant_a'),
  jsonb_build_object('branch_id', tests.id('a2'), 'service_type', 'table',
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))),
  '22023', 'table service needs the table''s QR code, not a table id from the browser');
select is(tests.try_sql(format($q$select public.place_order(%L, %L)$q$, tests.id('restaurant_a'),
  jsonb_build_object('branch_id', tests.id('a2'), 'service_type', 'pickup', 'qr_token', pg_temp.v('qr_b'),
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))),
  '22023', 'another restaurant''s QR code is refused');
reset role;

insert into t select 'pickup_id', (pg_temp.v('pickup')::jsonb ->> 'order_id');
insert into t select 'pickup_key', (pg_temp.v('pickup')::jsonb ->> 'public_key');
select results_eq(
  format($q$select subtotal_minor, vat_minor, total_minor, status::text, needs_confirmation, kitchen_released_at is null
              from public.orders where id = %L$q$, pg_temp.v('pickup_id')),
  $$values (13000::bigint, 619::bigint, 13000::bigint, 'confirmed', false, true)$$,
  'totals come from the menu (5% VAT included); pickup is auto-accepted but waits for payment before the kitchen');
select is((select options -> 0 -> 'name' from public.order_items where order_id = pg_temp.v('pickup_id')::uuid),
          '{"en": "Rice"}'::jsonb, 'order lines keep snapshots of the chosen options');
update public.menu_items set price_minor = 9999 where id = tests.id('restaurant_a:item');
update public.menu_item_variants set price_minor = 9999 where item_id = tests.id('restaurant_a:item');
select is((select unit_price_minor from public.order_items where order_id = pg_temp.v('pickup_id')::uuid), 6500::bigint,
          'later menu changes never rewrite an order');
update public.menu_item_variants set price_minor = 6000 where item_id = tests.id('restaurant_a:item');
update public.menu_option_groups set min_select = 1 where id = tests.id('restaurant_a:group');

select tests.authenticate_as_anon();
select is(tests.try_sql(format($q$select public.place_order(%L, %L)$q$, tests.id('restaurant_a'),
  jsonb_build_object('branch_id', tests.id('a2'), 'service_type', 'pickup',
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))),
  '22023', 'required option groups are enforced');
reset role;
update public.menu_option_groups set min_select = 0 where id = tests.id('restaurant_a:group');
delete from public.branch_menu_overrides where branch_id = tests.id('a1');

-- ===== Table QR order: waiter confirmation, mode C, kitchen release ===============================
select tests.authenticate_as_anon();
insert into t select 'table', public.place_order(tests.id('restaurant_a'),
  jsonb_build_object('branch_id', tests.id('a2'), 'service_type', 'table', 'qr_token', pg_temp.v('qr_a'),
                     'customer_phone', '+96899999999',
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))::text;
insert into t select 'table_key', pg_temp.v('table')::jsonb ->> 'public_key';
select is(public.track_order(pg_temp.v('table_key')) ->> 'status', 'new', 'the diner tracks the order by its key');
select ok(not (public.track_order(pg_temp.v('table_key'))::text like '%99999999%'),
          'tracking never shows the phone number');
select is((public.track_order(pg_temp.v('table_key')) ->> 'can_pay')::boolean, false,
          'no online payment before the waiter confirms');
reset role;
insert into t select 'table_id', pg_temp.v('table')::jsonb ->> 'order_id';
select results_eq(format($q$select branch_id, source::text, table_id from public.orders where id = %L$q$, pg_temp.v('table_id')),
  format($q$values (%L::uuid, 'table_qr', %L::uuid)$q$, tests.id('a1'), tests.id('restaurant_a:table')),
  'the table and branch come from the QR code (A1), not from the browser (A2)');

select tests.authenticate_as('kitchen_a1');
select is(tests.count_rows('public.orders', format('id = %L', pg_temp.v('table_id'))), 0::bigint,
          'unconfirmed orders never reach the kitchen');
select is(tests.try_sql(format($q$select public.kitchen_update(%L, 'preparing')$q$, pg_temp.v('table_id'))), '22023',
          'the kitchen cannot start an unconfirmed order');

select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.orders', format('id = %L', pg_temp.v('table_id'))), 1::bigint, 'the A1 waiter sees it');
select public.set_shift(tests.id('a1'), false);
select is(tests.try_sql(format('select public.accept_order(%L)', pg_temp.v('table_id'))), '22023',
          'only waiters on shift can accept (mode C)');
select public.set_shift(tests.id('a1'), true);
select lives_ok(format('select public.accept_order(%L)', pg_temp.v('table_id')), 'a waiter on shift accepts');

select tests.authenticate_as('manager_a');
select public.set_shift(tests.id('a1'), true);
select throws_ok(format('select public.accept_order(%L)', pg_temp.v('table_id')), '22023',
                 'another waiter already accepted this order', 'the second waiter sees "already accepted"');

select tests.authenticate_as('waiter_a1');
select public.confirm_order(pg_temp.v('table_id')::uuid);
select tests.authenticate_as('kitchen_a1');
select is(tests.count_rows('public.orders', format('id = %L and kitchen_released_at is not null', pg_temp.v('table_id'))),
          1::bigint, 'confirmed + pays after → the kitchen has it');
select lives_ok(format($q$select public.kitchen_update(%L, 'preparing')$q$, pg_temp.v('table_id')), 'kitchen: preparing');
select is(tests.try_sql(format($q$select public.kitchen_update(%L, 'served')$q$, pg_temp.v('table_id'))), '22023',
          'the kitchen only moves New → Preparing → Ready');
select lives_ok(format($q$select public.kitchen_update(%L, 'ready')$q$, pg_temp.v('table_id')), 'kitchen: ready');
select is(tests.try_sql(format('select public.complete_order(%L)', pg_temp.v('table_id'))), '42501',
          'kitchen staff cannot complete orders');

select tests.authenticate_as('waiter_a1');
select public.mark_served(pg_temp.v('table_id')::uuid);
select is(tests.try_sql(format('select public.complete_order(%L)', pg_temp.v('table_id'))), '22023',
          'an unpaid order cannot be completed');
select lives_ok(format($q$select public.record_offline_payment(%L, 'cash', 'R-1')$q$, pg_temp.v('table_id')),
                'the responsible waiter records cash');
select lives_ok(format('select public.complete_order(%L)', pg_temp.v('table_id')), 'then completes the order');
reset role;
select results_eq(
  format($q$select array_agg(type order by id) from public.order_events where order_id = %L$q$, pg_temp.v('table_id')),
  $$values (array['placed', 'accepted', 'confirmed', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'paid', 'completed'])$$,
  'the timeline records every step');
select results_eq(
  format($q$select assigned_waiter_id, confirmed_by, served_by, completed_by from public.orders where id = %L$q$, pg_temp.v('table_id')),
  format($q$values (%1$L::uuid, %1$L::uuid, %1$L::uuid, %1$L::uuid)$q$, tests.id('waiter_a1')),
  'responsibility history: accepted, confirmed, served and completed by');
select is(tests.try_sql(format($q$update public.order_events set type = 'x' where order_id = %L$q$, pg_temp.v('table_id'))),
          '42501', 'the timeline is append-only, even for the database owner');

-- ===== Reject, diner cancel ======================================================================
select tests.authenticate_as_anon();
insert into t select 'rej', public.place_order(tests.id('restaurant_a'),
  jsonb_build_object('service_type', 'table', 'qr_token', pg_temp.v('qr_a'),
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))::text;
insert into t select 'cxl', public.place_order(tests.id('restaurant_a'),
  jsonb_build_object('service_type', 'table', 'qr_token', pg_temp.v('qr_a'),
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))::text;
select lives_ok(format('select public.cancel_my_order(%L)', pg_temp.v('cxl')::jsonb ->> 'public_key'),
                'the diner cancels before confirmation');
select is(public.track_order(pg_temp.v('cxl')::jsonb ->> 'public_key') ->> 'status', 'cancelled', 'and sees it cancelled');
select is(tests.try_sql(format('select public.cancel_my_order(%L)', pg_temp.v('table_key'))), '22023',
          'a confirmed order cannot be cancelled by the diner');
select tests.authenticate_as('waiter_a1');
select lives_ok(format($q$select public.reject_order(%L, 'not_at_table', 'nobody at T1')$q$,
                       pg_temp.v('rej')::jsonb ->> 'order_id'), 'the waiter rejects: not at table');
reset role;
select results_eq(format($q$select status::text, rejected_reason::text, kitchen_released_at is null from public.orders where id = %L$q$,
                         pg_temp.v('rej')::jsonb ->> 'order_id'),
                  $$values ('rejected', 'not_at_table', true)$$, 'rejected orders never reach the kitchen');

-- ===== Branch scope, tenant isolation, New Staff ==================================================
select tests.authenticate_as('waiter_a1');
select is(tests.count_rows('public.orders', format('id = %L', pg_temp.v('pickup_id'))), 0::bigint,
          'an A1 waiter cannot see A2 orders');
select is(tests.try_sql(format('select public.mark_test_order(%L, true)', pg_temp.v('pickup_id'))), '42501',
          'nor act on them');
select tests.authenticate_as('owner_b');
select is(tests.count_rows('public.orders', format('restaurant_id = %L', tests.id('restaurant_a'))), 0::bigint,
          'restaurant B sees none of A''s orders');
select is(tests.count_rows('public.payments', format('restaurant_id = %L', tests.id('restaurant_a'))), 0::bigint,
          'or payments');
select is(tests.try_sql(format($q$select public.cancel_order(%L, 'x')$q$, pg_temp.v('pickup_id'))), '42501',
          'and cannot cancel them');
select tests.authenticate_as('new_staff_a');
select is(tests.count_rows('public.orders'), 0::bigint, 'New Staff see no orders');
select is(tests.count_rows('public.payments'), 0::bigint, 'New Staff see no payments');
select is(tests.count_rows('public.order_events'), 0::bigint, 'New Staff see no order timeline');
select is(tests.try_sql(format('select public.confirm_order(%L)', pg_temp.v('pickup_id'))), '42501',
          'New Staff cannot act on orders');
select is(tests.try_sql(format('select public.set_shift(%L, true)', tests.id('a1'))), '42501',
          'New Staff cannot start a shift');
select tests.authenticate_as('diner');
select is(tests.count_rows('public.orders'), 0::bigint, 'a diner sees none of the restaurant''s orders');
reset role;

-- ===== Online payment: only a verified, idempotent webhook marks it paid ===========================
select tests.authenticate_as_anon();
select is(tests.try_sql(format('select public.start_online_payment(%L)', pg_temp.v('pickup_key'))), '42501',
          'payments are started by the server, not the browser');
select is(tests.try_sql($$select public.apply_payment_event('test', '{}')$$), '42501',
          'visitors cannot send payment events');
select tests.authenticate_as('owner_a');
select is(tests.try_sql($$select public.apply_payment_event('test', '{}')$$), '42501', 'nor can staff');
select tests.authenticate_as_service_role();
insert into t select 'pay', public.start_online_payment(pg_temp.v('pickup_key'))::text;
select is(pg_temp.v('pay')::jsonb ->> 'gateway', 'test', 'the restaurant''s connected gateway takes the payment');
select is(public.apply_payment_event('test', jsonb_build_object('id', 'evt-1', 'type', 'payment.succeeded',
            'payment_id', pg_temp.v('pay')::jsonb ->> 'payment_id', 'amount_minor', 100, 'currency', 'OMR')),
          'amount_mismatch', 'a webhook for the wrong amount is refused');
select is(public.apply_payment_event('test', jsonb_build_object('id', 'evt-2', 'type', 'payment.succeeded',
            'payment_id', pg_temp.v('pay')::jsonb ->> 'payment_id', 'amount_minor', 13000, 'currency', 'OMR',
            'provider_reference', 'tx_1')),
          'paid', 'a verified webhook marks the order paid');
select is(public.apply_payment_event('test', jsonb_build_object('id', 'evt-2', 'type', 'payment.succeeded',
            'payment_id', pg_temp.v('pay')::jsonb ->> 'payment_id', 'amount_minor', 13000, 'currency', 'OMR')),
          'duplicate', 'replayed webhooks are ignored');
reset role;
select results_eq(format($q$select payment_status::text, kitchen_released_at is not null from public.orders where id = %L$q$,
                         pg_temp.v('pickup_id')),
                  $$values ('paid', true)$$, 'paid → released to the kitchen (pay-before order)');
select is((select count(*)::int from public.order_events where order_id = pg_temp.v('pickup_id')::uuid and type = 'paid'), 1,
          'paid exactly once');

-- ===== Refunds ======================================================================================
insert into t select 'cash_payment', (select id::text from public.payments where order_id = pg_temp.v('table_id')::uuid);
insert into t select 'online_payment', pg_temp.v('pay')::jsonb ->> 'payment_id';
select tests.authenticate_as('manager_a', 'aal1', 60);
select is(tests.try_sql(format($q$select public.request_refund(%L, 100, 'cold')$q$, pg_temp.v('cash_payment'))), '42501',
          'managers cannot refund (owner-only payments.manage)');
select tests.authenticate_as('owner_a');
select throws_ok(format($q$select public.request_refund(%L, 100, 'cold')$q$, pg_temp.v('cash_payment')), '42501', null,
                 'refunds need a fresh re-authentication');
select tests.authenticate_as('owner_a', 'aal1', 60);
select is(tests.try_sql(format($q$select public.request_refund(%L, 999999, 'cold')$q$, pg_temp.v('cash_payment'))), '22023',
          'cannot refund more than was paid');
select is(public.request_refund(pg_temp.v('cash_payment')::uuid, 1000, 'cold dish') ->> 'status', 'succeeded',
          'a partial cash refund is immediate');
reset role;
select results_eq(format($q$select payment_status::text, status::text, refunded_minor from public.orders where id = %L$q$,
                         pg_temp.v('table_id')),
                  $$values ('partially_refunded', 'completed', 1000::bigint)$$, 'partial refund: order keeps its status');
select tests.authenticate_as('owner_a', 'aal1', 60);
insert into t select 'online_refund', public.request_refund(pg_temp.v('online_payment')::uuid, 13000, 'branch closed')::text;
select is(pg_temp.v('online_refund')::jsonb ->> 'status', 'pending', 'online refunds wait for the gateway');
select tests.authenticate_as_service_role();
select is(public.apply_payment_event('test', jsonb_build_object('id', 'evt-3', 'type', 'refund.succeeded',
            'payment_id', pg_temp.v('online_payment'), 'refund_id', pg_temp.v('online_refund')::jsonb ->> 'refund_id')),
          'refunded', 'the gateway confirms the refund');
reset role;
select results_eq(format($q$select payment_status::text, status::text, refunded_minor from public.orders where id = %L$q$,
                         pg_temp.v('pickup_id')),
                  $$values ('refunded', 'refunded', 13000::bigint)$$, 'full refund: order and payment are refunded');
select ok(exists (select 1 from public.audit_events where restaurant_id = tests.id('restaurant_a')
                   and action = 'payments.refund_requested'), 'refunds are audited');

-- ===== Waiter orders and controlled edits ==========================================================
select tests.authenticate_as('waiter_a1');
select is(tests.try_sql(format($q$select public.create_waiter_order(%L, %L)$q$, tests.id('a1'),
  jsonb_build_object('service_type', 'car', 'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))),
  '22023', 'car orders need a plate');
insert into t select 'w', public.create_waiter_order(tests.id('a1'),
  jsonb_build_object('service_type', 'car', 'car_plate', ' 12345 ab ',
                     'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))::text;
select is(tests.try_sql(format($q$select public.create_waiter_order(%L, %L)$q$, tests.id('a2'),
  jsonb_build_object('service_type', 'car', 'car_plate', 'X1', 'items', jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item')))))),
  '42501', 'waiters create orders only in their branches');
select tests.authenticate_as('kitchen_a1');
select is(tests.count_rows('public.orders', format('id = %L', pg_temp.v('w')::jsonb ->> 'order_id')), 0::bigint,
          'a car order paid before is not in the kitchen yet');
select tests.authenticate_as('waiter_a1');
select public.record_offline_payment((pg_temp.v('w')::jsonb ->> 'order_id')::uuid, 'card_at_restaurant');
reset role;
update public.orders set payment_status = 'unpaid' where id = (pg_temp.v('w')::jsonb ->> 'order_id')::uuid;  -- allow an edit
select tests.authenticate_as('kitchen_a1');
select public.kitchen_update((pg_temp.v('w')::jsonb ->> 'order_id')::uuid, 'preparing');
select tests.authenticate_as('waiter_a1');
select lives_ok(format($q$select public.edit_order_items(%L, %L)$q$, pg_temp.v('w')::jsonb ->> 'order_id',
                       jsonb_build_array(jsonb_build_object('item_id', pg_temp.v('item'), 'quantity', 3))),
                'the creator edits after preparation started');
reset role;
select results_eq(format($q$select car_plate, kitchen_alert, total_minor, created_by, assigned_waiter_id from public.orders where id = %L$q$,
                         pg_temp.v('w')::jsonb ->> 'order_id'),
                  format($q$values ('12345 AB', true, 18000::bigint, %1$L::uuid, %1$L::uuid)$q$, tests.id('waiter_a1')),
                  'the kitchen is alerted, totals repriced, the creator is responsible');
select ok(exists (select 1 from public.audit_events where action = 'order.edited_after_start'
                   and object_id = (pg_temp.v('w')::jsonb ->> 'order_id')::uuid), 'edits after start are audited');

-- ===== Gateways: eligibility, connection, private terms ==============================================
update public.platform_settings set value = 'false' where key = 'testing_gateways_visible';
select tests.authenticate_as('owner_a', 'aal1', 60);
select is((select count(*)::int from jsonb_array_elements(public.list_payment_gateways(tests.id('restaurant_a'))) g
            where g ->> 'connection_status' <> 'connected'), 0,
          'gateways in Testing are hidden unless the platform allows them');
reset role;
update public.platform_settings set value = 'true' where key = 'testing_gateways_visible';
select tests.authenticate_as('owner_a');
select is(tests.try_sql(format($q$select public.connect_gateway(%L, 'test', '{}', 'x123456789012345678')$q$,
                               tests.id('restaurant_a'))), '42501', 'connecting a gateway needs a fresh re-authentication');
select tests.authenticate_as('manager_a', 'aal1', 60);
select is(tests.try_sql(format($q$select public.list_payment_gateways(%L)$q$, tests.id('restaurant_a'))), '42501',
          'only owners manage payment gateways');
select tests.authenticate_as('owner_a', 'aal1', 60);
select lives_ok(format($q$select public.connect_gateway(%L, 'test', '{"key_last4": "1234"}', 'sealed-credentials-0123456789')$q$,
                       tests.id('restaurant_a')), 'owners connect their own merchant account');
select ok(not (public.list_payment_gateways(tests.id('restaurant_a'))::text like '%fee_bp%'),
          'restaurants never see GoMenu''s commercial terms');
select is(tests.try_sql(format($q$select public.connect_gateway(%L, 'test', '{}', 'sealed-credentials-0123456789')$q$,
                               tests.id('restaurant_b'))), '42501', 'nor connect another restaurant''s');
select tests.authenticate_as('support', 'aal2');
select is(tests.try_sql('select public.platform_list_gateways()'), '42501', 'support cannot see gateway terms');
select tests.authenticate_as('super_admin', 'aal2');
select ok(public.platform_list_gateways()::text like '%fee_bp%', 'the platform sees its private terms');
select lives_ok($$select public.platform_set_gateway_terms('test', '{"fee_bp": 200}')$$, 'and updates them');
reset role;

select * from finish();
rollback;
