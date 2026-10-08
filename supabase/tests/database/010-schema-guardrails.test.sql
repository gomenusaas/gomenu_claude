-- Schema guardrails: properties every current AND future table/function must satisfy.
-- These are catalog-driven, so a new table or RPC that forgets RLS fails CI automatically.
begin;
select plan(11);

select is(
  (select array_agg(format('%I.%I', n.nspname, c.relname) order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'every public table has RLS enabled'
);

select is(
  (select array_agg(format('%I.%I', n.nspname, c.relname) order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relforcerowsecurity),
  null,
  'every public table has RLS forced (applies to the table owner too)'
);

select is(
  (select array_agg(format('%I.%I', n.nspname, c.relname) order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')),
  null,
  'no views in public (views bypass RLS unless security_invoker; add tests before introducing one)'
);

select is(
  (select array_agg(distinct table_name::text order by table_name::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  null,
  'anon has no privileges on any public table'
);

-- Every table is tenant-owned (restaurant_id) or explicitly declared global/personal here.
select is(
  (select array_agg(t.tablename::text order by t.tablename)
     from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from information_schema.columns c
                       where c.table_schema = 'public' and c.table_name = t.tablename
                         and c.column_name = 'restaurant_id')
      and t.tablename not in ('restaurants', 'profiles', 'permissions', 'role_permissions', 'platform_staff',
                              'platform_settings', 'features', 'plans', 'plan_entitlements', 'billing_prices',
                              'reserved_slugs')),
  null,
  'every public table carries restaurant_id or is a reviewed global table'
);

-- Every SECURITY DEFINER function pins search_path (prevents search_path hijacking).
select is(
  (select array_agg(format('%I.%I', n.nspname, p.proname) order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  null,
  'every SECURITY DEFINER function sets search_path'
);

-- Reviewed RPC surface. Adding a public function requires updating this list (and tests).
select is(
  (select array_agg(format('%s:%s', p.proname, r.rolname) order by format('%s:%s', p.proname, r.rolname))
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege(r.rolname, p.oid, 'execute')
      and r.rolname <> 'service_role'),
  array[
    'accept_staff_invitation:authenticated',
    'assign_staff_role:authenticated',
    'buy_extra_branches:authenticated',
    'cancel_staff_invitation:authenticated',
    'choose_plan:authenticated',
    'complete_onboarding:authenticated',
    'complete_staff_verification:authenticated',
    'create_custom_role:authenticated',
    'create_restaurant:authenticated',
    'get_invitation_preview:anon',
    'get_invitation_preview:authenticated',
    'get_my_context:authenticated',
    'get_public_contact:anon',
    'get_public_contact:authenticated',
    'get_public_pricing:anon',
    'get_public_pricing:authenticated',
    'invite_staff:authenticated',
    'my_permissions:authenticated',
    'my_pin_is_set:authenticated',
    'platform_add_staff:authenticated',
    'platform_get_restaurant_overview:authenticated',
    'platform_grant_trial:authenticated',
    'platform_list_invoices:authenticated',
    'platform_list_restaurants:authenticated',
    'platform_list_staff:authenticated',
    'platform_overview:authenticated',
    'platform_record_payment:authenticated',
    'platform_restaurant_billing:authenticated',
    'platform_set_entitlement:authenticated',
    'platform_set_hold:authenticated',
    'platform_set_price:authenticated',
    'platform_set_restaurant_override:authenticated',
    'platform_set_setting:authenticated',
    'platform_set_staff_active:authenticated',
    'platform_void_invoice:authenticated',
    'resend_staff_invitation:authenticated',
    'restaurant_billing_overview:authenticated',
    'restaurant_entitlements:authenticated',
    'restaurant_setup_status:authenticated',
    'upgrade_plan:authenticated'
  ],
  'client-callable RPCs match the reviewed list'
);

select ok(
  not has_function_privilege('authenticated', 'public.open_invitation(text)', 'execute')
  and not has_function_privilege('anon', 'public.open_invitation(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.dev_list_outbox(integer)', 'execute'),
  'server-only RPCs are not callable by clients'
);

-- authenticated needs USAGE on private only for the helpers RLS policies call.
select is(
  (select array_agg(p.proname::text order by p.proname::text)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')),
  array['can_view_profile', 'has_any_active_membership', 'has_permission', 'has_platform_role',
        'is_active_member', 'is_e164', 'is_platform_staff', 'path_restaurant_id', 'realtime_topic_allowed',
        'restaurant_writable'],
  'authenticated can execute only the reviewed private helpers (policy/check helpers)'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
  and not has_table_privilege('authenticated', 'private.message_outbox', 'select')
  and not has_table_privilege('authenticated', 'private.staff_credentials', 'select'),
  'private schema data is unreachable from clients'
);

-- Lifecycle: every tenant table refuses user writes while the restaurant is suspended, unless
-- it is a reviewed exception (billing so owners can renew; audit/notifications always record).
select is(
  (select array_agg(t.table_name::text order by t.table_name)
     from (select distinct c.table_name from information_schema.columns c
            join pg_tables pt on pt.schemaname = c.table_schema and pt.tablename = c.table_name
           where c.table_schema = 'public' and c.column_name = 'restaurant_id'
           union select 'restaurants') t
    where not exists (select 1 from pg_trigger tg
                       where tg.tgrelid = ('public.' || t.table_name)::regclass and tg.tgname = 'tenant_write_guard')
      and t.table_name not in ('audit_events', 'platform_audit_events', 'restaurant_notifications',
                               'billing_invoices', 'billing_payments', 'subscription_periods', 'trial_grants',
                               'restaurant_entitlement_overrides')),
  null,
  'every tenant table has the lifecycle write guard or is a reviewed exception'
);

select * from finish();
rollback;
