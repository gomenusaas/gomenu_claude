-- DEVELOPMENT / DEMO SEED — never run against production.
-- Runs automatically on `supabase db reset` (local) and can be applied to the dev project.
-- Demo data goes through the same tables (and the same RPCs where practical) as real data.

-- Enable the dev outbox viewer (/dev/outbox) in this environment only.
insert into private.app_settings (key, value) values ('dev_outbox_enabled', 'true')
on conflict (key) do update set value = excluded.value;

do $$
declare
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_password text := extensions.crypt('GoMenuDemo!2026', extensions.gen_salt('bf'));
  v_r1 uuid := 'd0000000-0000-4000-8000-000000000001';
  v_r2 uuid := 'd0000000-0000-4000-8000-000000000002';
  v_qurum uuid := 'd0000000-0000-4000-8000-000000000011';
  v_mouj uuid := 'd0000000-0000-4000-8000-000000000012';
  v_sohar uuid := 'd0000000-0000-4000-8000-000000000021';
  r record;
begin
  -- people: (id, name, phone, email)
  for r in
    select * from (values
      ('d1000000-0000-4000-8000-000000000001'::uuid, 'Aisha Al Balushi',  '96899000001', 'owner@demo.gomenu.test'),
      ('d1000000-0000-4000-8000-000000000002'::uuid, 'Khalid Al Harthy',  '96899000002', null),
      ('d1000000-0000-4000-8000-000000000003'::uuid, 'Fatma Al Rawahi',   '96899000003', null),
      ('d1000000-0000-4000-8000-000000000004'::uuid, 'Said Al Hinai',     '96899000004', null),
      ('d1000000-0000-4000-8000-000000000005'::uuid, 'Maryam Al Kindi',   '96899000005', null),
      ('d1000000-0000-4000-8000-000000000006'::uuid, 'Yousuf Al Abri',    '96899000006', 'owner2@demo.gomenu.test')
    ) as t(id, name, phone, email)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token,
                            email_change_token_new, email_change)
    values (v_instance, r.id, 'authenticated', 'authenticated', r.email,
            case when r.email is not null then v_password end,
            case when r.email is not null then now() end,
            r.phone, now(), '{"provider":"phone","providers":["phone","email"]}',
            jsonb_build_object('full_name', r.name), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), r.id, r.id::text, 'phone',
            jsonb_build_object('sub', r.id::text, 'phone', r.phone), now(), now(), now());
    if r.email is not null then
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
      values (gen_random_uuid(), r.id, r.id::text, 'email',
              jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true), now(), now(), now());
    end if;
  end loop;

  insert into public.restaurants (id, name, slug, created_by, status) values
    (v_r1, 'Muscat Grill (Demo)', 'demo-muscat-grill', 'd1000000-0000-4000-8000-000000000001', 'trial'),
    (v_r2, 'Sohar Café (Demo)',   'demo-sohar-cafe',   'd1000000-0000-4000-8000-000000000006', 'trial');
  insert into public.branches (id, restaurant_id, name) values
    (v_qurum, v_r1, 'Qurum'), (v_mouj, v_r1, 'Al Mouj'), (v_sohar, v_r2, 'Sohar Corniche');

  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, invited_name, verified_at)
  select v_r1, 'd1000000-0000-4000-8000-000000000001', id, 'active', 'all', 'Aisha Al Balushi', now() from public.roles where key = 'owner' and is_system;
  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, invited_name, verified_at)
  select v_r1, 'd1000000-0000-4000-8000-000000000002', id, 'active', 'all', 'Khalid Al Harthy', now() from public.roles where key = 'manager' and is_system;
  insert into public.memberships (id, restaurant_id, user_id, role_id, status, branch_scope, invited_name, verified_at)
  select 'd2000000-0000-4000-8000-000000000003', v_r1, 'd1000000-0000-4000-8000-000000000003', id, 'active', 'selected', 'Fatma Al Rawahi', now()
    from public.roles where key = 'waiter' and is_system;
  insert into public.membership_branches (membership_id, branch_id, restaurant_id)
  values ('d2000000-0000-4000-8000-000000000003', v_qurum, v_r1);
  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, invited_name, verified_at)
  select v_r1, 'd1000000-0000-4000-8000-000000000004', id, 'active', 'all', 'Said Al Hinai', now() from public.roles where key = 'kitchen' and is_system;
  -- New Staff awaiting a role (zero permissions)
  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, invited_name, invited_phone_e164, verified_at)
  select v_r1, 'd1000000-0000-4000-8000-000000000005', id, 'new_staff', 'selected', 'Maryam Al Kindi', '+96899000005', now()
    from public.roles where is_new_staff;
  insert into private.staff_credentials (user_id, pin_hash)
  values ('d1000000-0000-4000-8000-000000000005', extensions.crypt('583920', extensions.gen_salt('bf')));

  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, invited_name, verified_at)
  select v_r2, 'd1000000-0000-4000-8000-000000000006', id, 'active', 'all', 'Yousuf Al Abri', now() from public.roles where key = 'owner' and is_system;

  insert into public.restaurant_notifications (restaurant_id, kind, required_permission, title, object_type, data)
  values (v_r1, 'staff.verified', 'staff.manage', 'New Staff Verified', 'membership', '{"name": "Maryam Al Kindi"}');

  -- Billing (Phase 2): Muscat Grill is mid-trial; Sohar Café is on a paid Silver year.
  insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, note)
  select v_r1, 'trial', id, now() - interval '20 days', now() - interval '20 days' + interval '2 months', 'demo trial'
    from public.plans where key = 'gold';
  insert into public.trial_grants (phone_e164, user_id, restaurant_id, source)
  values ('+96899000001', 'd1000000-0000-4000-8000-000000000001', v_r1, 'automatic'),
         ('+96899000006', 'd1000000-0000-4000-8000-000000000006', v_r2, 'automatic');
  update public.restaurants set status = 'active' where id = v_r2;
  insert into public.billing_invoices (id, number, restaurant_id, kind, status, plan_id, currency, lines,
                                       plan_amount_minor, branch_unit_amount_minor, subtotal_minor, tax_label,
                                       tax_rate_bp, tax_minor, total_minor, issued_at, due_at, paid_at)
  select 'd3000000-0000-4000-8000-000000000001', 'GM-DEMO-000001', v_r2, 'new_period', 'paid', id, 'USD',
         '[{"description": "Silver plan, 12 months", "quantity": 1, "unit_amount_minor": 12000, "amount_minor": 12000}]',
         12000, 6000, 12000, 'VAT', 0, 0, 12000, now() - interval '95 days', now() - interval '81 days', now() - interval '90 days'
    from public.plans where key = 'silver';
  insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, currency, plan_amount_minor,
                                           branch_unit_amount_minor, invoice_id)
  select v_r2, 'paid', id, now() - interval '90 days', now() - interval '90 days' + interval '1 year', 'USD', 12000, 6000,
         'd3000000-0000-4000-8000-000000000001'
    from public.plans where key = 'silver';
  insert into public.billing_payments (invoice_id, restaurant_id, amount_minor, currency, method, reference, received_at)
  values ('d3000000-0000-4000-8000-000000000001', v_r2, 12000, 'USD', 'bank_transfer', 'DEMO-TRANSFER-1', now() - interval '90 days');

  -- Platform staff (demo). Email + password; an authenticator app is enrolled on first login.
  for r in
    select * from (values
      ('d1000000-0000-4000-8000-000000000091'::uuid, 'GoMenu Root (Demo)',    'root@demo.gomenu.test',    'super_admin'),
      ('d1000000-0000-4000-8000-000000000092'::uuid, 'GoMenu Finance (Demo)', 'finance@demo.gomenu.test', 'finance')
    ) as t(id, name, email, role)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
                            recovery_token, email_change_token_new, email_change)
    values (v_instance, r.id, 'authenticated', 'authenticated', r.email, v_password, now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.name), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), r.id, r.id::text, 'email',
            jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true), now(), now(), now());
    insert into public.platform_staff (user_id, role) values (r.id, r.role::public.platform_role);
  end loop;

  -- Phase 3 demo content for Muscat Grill: Arabic on, opening hours, a small bilingual menu.
  insert into public.restaurant_languages (restaurant_id, locale, sort) values (v_r1, 'ar', 10) on conflict do nothing;
  insert into public.branch_hours (restaurant_id, branch_id, day_of_week, opens_at, closes_at)
  select v_r1, b, d, '11:00', '01:00' from unnest(array[v_qurum, v_mouj]) b, generate_series(0, 6) d;
  insert into public.menu_categories (id, restaurant_id, name, sort) values
    ('d4000000-0000-4000-8000-000000000001', v_r1, '{"en": "Starters", "ar": "المقبلات"}', 10),
    ('d4000000-0000-4000-8000-000000000002', v_r1, '{"en": "Grills", "ar": "المشاوي"}', 20),
    ('d4000000-0000-4000-8000-000000000003', v_r1, '{"en": "Drinks", "ar": "المشروبات"}', 30);
  insert into public.menu_items (id, restaurant_id, category_id, name, description, price_minor, sort, allergens, dietary_tags, spice_level) values
    ('d5000000-0000-4000-8000-000000000001', v_r1, 'd4000000-0000-4000-8000-000000000001',
     '{"en": "Hummus", "ar": "حمص"}', '{"en": "Chickpeas, tahini, olive oil", "ar": "حمص، طحينة، زيت زيتون"}', 1500, 10,
     '{sesame}', '{vegetarian,vegan}', 0),
    ('d5000000-0000-4000-8000-000000000002', v_r1, 'd4000000-0000-4000-8000-000000000001',
     '{"en": "Lentil soup", "ar": "شوربة عدس"}', '{}', 1200, 20, '{}', '{vegetarian}', 0),
    ('d5000000-0000-4000-8000-000000000003', v_r1, 'd4000000-0000-4000-8000-000000000002',
     '{"en": "Mixed grill", "ar": "مشاوي مشكلة"}', '{"en": "Lamb kebab, shish tawook, kofta", "ar": "كباب لحم، شيش طاووق، كفتة"}', 5900, 10,
     '{}', '{halal,popular}', 1),
    ('d5000000-0000-4000-8000-000000000004', v_r1, 'd4000000-0000-4000-8000-000000000002',
     '{"en": "Chicken shawarma plate", "ar": "صحن شاورما دجاج"}', '{}', 3500, 20, '{gluten}', '{halal}', 1),
    ('d5000000-0000-4000-8000-000000000005', v_r1, 'd4000000-0000-4000-8000-000000000003',
     '{"en": "Fresh lemon mint", "ar": "ليمون بالنعناع"}', '{}', 1000, 10, '{}', '{vegan}', 0);
  insert into public.menu_item_variants (restaurant_id, item_id, name, price_minor, sort, is_default) values
    (v_r1, 'd5000000-0000-4000-8000-000000000005', '{"en": "Regular", "ar": "عادي"}', 1000, 10, true),
    (v_r1, 'd5000000-0000-4000-8000-000000000005', '{"en": "Large", "ar": "كبير"}', 1400, 20, false);
  insert into public.menu_option_groups (id, restaurant_id, item_id, name, min_select, max_select, sort) values
    ('d6000000-0000-4000-8000-000000000001', v_r1, 'd5000000-0000-4000-8000-000000000003',
     '{"en": "Extras", "ar": "إضافات"}', 0, 3, 10);
  insert into public.menu_options (restaurant_id, group_id, name, price_delta_minor, sort) values
    (v_r1, 'd6000000-0000-4000-8000-000000000001', '{"en": "Garlic sauce", "ar": "ثومية"}', 200, 10),
    (v_r1, 'd6000000-0000-4000-8000-000000000001', '{"en": "Extra bread", "ar": "خبز إضافي"}', 300, 20);

  -- Phase 4 demo: published websites, a template each, an offer, tables with QR codes.
  update public.website_settings set is_published = true, template_key = 'showcase', menu_style = 'list',
         seo_title = '{"en": "Muscat Grill – grills and mezze in Qurum and Al Mouj", "ar": "مشاوي مسقط – مشاوي ومقبلات في القرم والموج"}'
   where restaurant_id = v_r1;
  update public.website_settings set is_published = true, template_key = 'classic', menu_style = 'grid' where restaurant_id = v_r2;
  update public.restaurants set tagline = '{"en": "Charcoal grills and fresh mezze since 2009", "ar": "مشاوي على الفحم ومقبلات طازجة منذ 2009"}',
         description = '{"en": "Family recipes from Muscat, grilled to order.", "ar": "وصفات عائلية من مسقط تُشوى عند الطلب."}',
         contact_phone_e164 = '+96824000001', whatsapp_e164 = '+96899000001',
         social_links = '{"instagram": "https://instagram.com/muscatgrill.demo"}'
   where id = v_r1;
  update public.branches set address = 'Way 2601, Qurum, Muscat', latitude = 23.6139, longitude = 58.4733 where id = v_qurum;
  update public.branches set address = 'The Walk, Al Mouj, Muscat', latitude = 23.6305, longitude = 58.2766 where id = v_mouj;
  insert into public.promotions (restaurant_id, kind, title, body, item_id, ends_at) values
    (v_r1, 'banner', '{"en": "Mixed grill for two – 20% off", "ar": "مشاوي مشكلة لشخصين – خصم 20٪"}',
     '{"en": "Weekdays, 12–4 pm.", "ar": "أيام الأسبوع من 12 إلى 4 مساءً."}', 'd5000000-0000-4000-8000-000000000003', now() + interval '30 days');
  insert into public.restaurant_tables (id, restaurant_id, branch_id, label, section) values
    ('d7000000-0000-4000-8000-000000000001', v_r1, v_qurum, 'T1', 'Indoor'),
    ('d7000000-0000-4000-8000-000000000002', v_r1, v_qurum, 'T2', 'Indoor'),
    ('d7000000-0000-4000-8000-000000000003', v_r1, v_qurum, 'T3', 'Terrace');
  -- Fixed demo tokens so the QR links are easy to try locally: /q/demo-muscat-grill-table-t1 ...
  insert into public.qr_codes (restaurant_id, kind, token, branch_id, table_id) values
    (v_r1, 'table', 'demo-muscat-grill-table-t1', v_qurum, 'd7000000-0000-4000-8000-000000000001'),
    (v_r1, 'table', 'demo-muscat-grill-table-t2', v_qurum, 'd7000000-0000-4000-8000-000000000002'),
    (v_r1, 'table', 'demo-muscat-grill-table-t3', v_qurum, 'd7000000-0000-4000-8000-000000000003');
  insert into public.qr_codes (restaurant_id, kind, token, label) values (v_r1, 'general', 'demo-muscat-grill-poster-01', 'Poster');
  -- Phase 5 demo: Muscat Grill takes orders and online payments through the built-in test
  -- gateway (no real money). The test gateway derives its webhook secret on the server, so the
  -- stored credential is only a marker here.
  update public.platform_settings set value = 'true' where key = 'testing_gateways_visible';
  update public.website_settings set ordering_enabled = true, online_payment_enabled = true where restaurant_id = v_r1;
  insert into public.payment_connections (id, restaurant_id, gateway_id, status, public_config, connected_by, connected_at)
  select 'd8000000-0000-4000-8000-000000000001', v_r1, id, 'connected', '{"mode": "test"}',
         'd1000000-0000-4000-8000-000000000001', now()
    from public.payment_gateways where key = 'test';
  insert into private.payment_connection_secrets (connection_id, secret_ciphertext)
  values ('d8000000-0000-4000-8000-000000000001', 'seed:test-gateway-has-no-stored-secret');
end $$;
