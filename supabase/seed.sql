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
end $$;
