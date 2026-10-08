-- Phase 2: effective entitlements, lifecycle-aware access, and the tenant write guard.
--
-- Lifecycle access rules (decision P2-Q6):
--   trial, active, past_due, grace  -> normal access (past_due/grace show a renewal banner)
--   suspended, retention, expiring  -> public site offline; OWNERS read-only; everyone else blocked
--   deleted                         -> nobody

create or replace function private.status_is_writable(p_status public.restaurant_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('trial', 'active', 'past_due', 'grace');
$$;

create or replace function private.restaurant_writable(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.status_is_writable(status) from public.restaurants where id = p_restaurant_id), false);
$$;

-- Whether the public website/menu/ordering may be served (used by Phase 4 public pages).
create or replace function private.restaurant_publicly_available(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.status_is_writable(status) and not platform_hold
                     from public.restaurants where id = p_restaurant_id), false);
$$;

-- ---------------------------------------------------------------------------
-- Permission checks now respect the lifecycle.
-- ---------------------------------------------------------------------------
create or replace function private.has_permission(
  p_restaurant_id uuid,
  p_permission text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      join public.restaurants rest on rest.id = m.restaurant_id
     where m.user_id = (select auth.uid())
       and m.restaurant_id = p_restaurant_id
       and m.status = 'active'
       and not r.is_new_staff
       and r.archived_at is null
       and (private.status_is_writable(rest.status)
            or (r.is_owner and rest.status in ('suspended', 'retention', 'expiring')))
       and (
         exists (select 1 from public.role_permissions rp
                  where rp.role_id = m.role_id and rp.permission_key = p_permission)
         or exists (select 1 from public.membership_permission_overrides o
                     where o.membership_id = m.id and o.permission_key = p_permission
                       and o.effect = 'grant')
       )
       and not exists (select 1 from public.membership_permission_overrides o
                        where o.membership_id = m.id and o.permission_key = p_permission
                          and o.effect = 'deny')
       and (
         p_branch_id is null
         or m.branch_scope = 'all'
         or exists (select 1 from public.membership_branches mb
                     where mb.membership_id = m.id and mb.branch_id = p_branch_id)
       )
  );
$$;

create or replace function private.is_active_member(
  p_restaurant_id uuid,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      join public.restaurants rest on rest.id = m.restaurant_id
     where m.user_id = (select auth.uid())
       and m.restaurant_id = p_restaurant_id
       and m.status = 'active'
       and not r.is_new_staff
       and (private.status_is_writable(rest.status)
            or (r.is_owner and rest.status in ('suspended', 'retention', 'expiring')))
       and (
         p_branch_id is null
         or m.branch_scope = 'all'
         or exists (select 1 from public.membership_branches mb
                     where mb.membership_id = m.id and mb.branch_id = p_branch_id)
       )
  );
$$;

-- Decision P2-Q7: MFA (aal2) is required for EVERY platform role, not only Super Admin.
create or replace function private.has_platform_role(p_roles public.platform_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff ps
     where ps.user_id = (select auth.uid()) and ps.is_active and ps.role = any (p_roles)
       and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
  );
$$;

create or replace function private.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_platform_role(enum_range(null::public.platform_role));
$$;
grant execute on function private.is_platform_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Effective plan and entitlements
-- ---------------------------------------------------------------------------
create or replace function private.current_period(p_restaurant_id uuid, p_at timestamptz default now())
returns public.subscription_periods
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscription_periods
   where restaurant_id = p_restaurant_id and starts_at <= p_at and ends_at > p_at
   limit 1;
$$;

-- Latest period that has started (the current one, or the one that most recently ended).
create or replace function private.latest_period(p_restaurant_id uuid, p_at timestamptz default now())
returns public.subscription_periods
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscription_periods
   where restaurant_id = p_restaurant_id and starts_at <= p_at
   order by ends_at desc limit 1;
$$;

create or replace function private.effective_plan_id(p_restaurant_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.restaurant_status;
begin
  select status into v_status from public.restaurants where id = p_restaurant_id;
  if v_status = 'trial' then
    return (select id from public.plans where key = private.setting_text('trial_plan_key'));
  elsif v_status in ('active', 'past_due', 'grace') then
    return (private.latest_period(p_restaurant_id)).plan_id;
  end if;
  return null;  -- suspended and later: no features
end;
$$;

-- Returns (enabled, limit_value); an unexpired platform override wins over the plan.
create or replace function private.feature_value(p_restaurant_id uuid, p_feature text,
                                                 out enabled boolean, out limit_value integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  select o.enabled, o.limit_value into enabled, limit_value
    from public.restaurant_entitlement_overrides o
   where o.restaurant_id = p_restaurant_id and o.feature_key = p_feature
     and (o.expires_at is null or o.expires_at > now());
  if found then
    return;
  end if;
  v_plan := private.effective_plan_id(p_restaurant_id);
  select pe.enabled, pe.limit_value into enabled, limit_value
    from public.plan_entitlements pe where pe.plan_id = v_plan and pe.feature_key = p_feature;
  enabled := coalesce(enabled, false);
end;
$$;

create or replace function private.has_feature(p_restaurant_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.feature_value(p_restaurant_id, p_feature)).enabled;
$$;

-- Branches allowed: plan's included branches (+ paid extras). NULL = unlimited. Never < 1.
create or replace function private.branch_limit(p_restaurant_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value record;
  v_extra integer;
begin
  v_value := private.feature_value(p_restaurant_id, 'branches_included');
  if v_value.enabled and v_value.limit_value is null then
    return null;
  end if;
  v_extra := coalesce((private.latest_period(p_restaurant_id)).extra_branches, 0);
  return greatest(coalesce(v_value.limit_value, 0) + v_extra, 1);
end;
$$;

create or replace function private.guard_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.is_active and new.archived_at is null
     and (tg_op = 'INSERT' or not (old.is_active and old.archived_at is null)) then
    v_limit := private.branch_limit(new.restaurant_id);
    if v_limit is not null then
      select count(*) into v_count from public.branches
       where restaurant_id = new.restaurant_id and is_active and archived_at is null and id <> new.id;
      if v_count >= v_limit then
        raise exception 'branch limit reached (% on this plan); add a branch to your subscription', v_limit
          using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger branches_limit_guard
  before insert or update on public.branches
  for each row execute function private.guard_branch_limit();

-- ---------------------------------------------------------------------------
-- Tenant write guard: user-initiated writes to a restaurant's data are refused unless the
-- restaurant is in a writable lifecycle state. Lifecycle jobs (no auth.uid()) and audited
-- platform actions (gomenu.platform_action = on) are exempt. Billing/audit/notification
-- tables are deliberately NOT guarded so owners can renew and history is always recorded.
-- Guardrail test 010 checks every tenant table has this trigger or is on the exempt list.
-- ---------------------------------------------------------------------------
create or replace function private.guard_tenant_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant uuid;
begin
  -- Exempt: system jobs (no user, or the lifecycle engine's own status updates, flagged only
  -- inside private functions clients cannot call) and audited platform RPCs, which set the
  -- flag AND must be called by MFA-verified platform staff.
  if auth.uid() is null
     or current_setting('gomenu.system_action', true) = 'on'
     or (current_setting('gomenu.platform_action', true) = 'on' and private.is_platform_staff()) then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'restaurants' then
    v_restaurant := coalesce(new.id, old.id);
  else
    v_restaurant := coalesce(new.restaurant_id, old.restaurant_id);
  end if;
  if v_restaurant is not null and not private.restaurant_writable(v_restaurant) then
    raise exception 'this restaurant''s account is not active; renew the subscription to make changes'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tenant_write_guard before update on public.restaurants
  for each row execute function private.guard_tenant_writable();
create trigger tenant_write_guard before insert or update or delete on public.branches
  for each row execute function private.guard_tenant_writable();
create trigger tenant_write_guard before insert or update or delete on public.memberships
  for each row execute function private.guard_tenant_writable();
create trigger tenant_write_guard before insert or update or delete on public.membership_branches
  for each row execute function private.guard_tenant_writable();
create trigger tenant_write_guard before insert or update or delete on public.membership_permission_overrides
  for each row execute function private.guard_tenant_writable();
create trigger tenant_write_guard before insert or update or delete on public.roles
  for each row execute function private.guard_tenant_writable();
create trigger tenant_write_guard before insert or update or delete on public.staff_invitations
  for each row execute function private.guard_tenant_writable();

-- Storage writes need a writable restaurant too (owners of suspended restaurants are read-only).
drop policy restaurant_public_insert on storage.objects;
drop policy restaurant_public_update on storage.objects;
drop policy restaurant_public_delete on storage.objects;
drop policy restaurant_private_insert on storage.objects;
drop policy restaurant_private_update on storage.objects;
drop policy restaurant_private_delete on storage.objects;

grant execute on function private.restaurant_writable(uuid) to authenticated;

create policy restaurant_public_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'restaurant-public'
    and (select private.restaurant_writable(private.path_restaurant_id(name)))
    and (
      (select private.has_permission(private.path_restaurant_id(name), 'website.manage'))
      or (select private.has_permission(private.path_restaurant_id(name), 'menu.edit'))
      or (select private.has_permission(private.path_restaurant_id(name), 'gallery.manage'))
    )
  );
create policy restaurant_public_update on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.restaurant_writable(private.path_restaurant_id(name)))
         and (select private.has_permission(private.path_restaurant_id(name), 'website.manage')))
  with check (bucket_id = 'restaurant-public'
              and (select private.restaurant_writable(private.path_restaurant_id(name)))
              and (select private.has_permission(private.path_restaurant_id(name), 'website.manage')));
create policy restaurant_public_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.restaurant_writable(private.path_restaurant_id(name)))
         and (select private.has_permission(private.path_restaurant_id(name), 'website.manage')));
create policy restaurant_private_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-private'
              and (select private.restaurant_writable(private.path_restaurant_id(name)))
              and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')));
create policy restaurant_private_update on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-private'
         and (select private.restaurant_writable(private.path_restaurant_id(name)))
         and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')))
  with check (bucket_id = 'restaurant-private'
              and (select private.restaurant_writable(private.path_restaurant_id(name)))
              and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')));
create policy restaurant_private_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-private'
         and (select private.restaurant_writable(private.path_restaurant_id(name)))
         and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')));

-- ---------------------------------------------------------------------------
-- Read policies for the new tables
-- ---------------------------------------------------------------------------
grant select on public.platform_settings, public.features, public.plans, public.plan_entitlements,
  public.billing_prices, public.reserved_slugs, public.subscription_periods, public.trial_grants,
  public.billing_invoices, public.billing_payments, public.restaurant_entitlement_overrides
  to authenticated;

-- Catalog/pricing tables: platform staff only (restaurants read them through RPCs).
create policy platform_settings_select on public.platform_settings for select to authenticated
  using ((select private.is_platform_staff()));
create policy features_select on public.features for select to authenticated
  using ((select private.is_platform_staff()));
create policy plans_select on public.plans for select to authenticated
  using ((select private.is_platform_staff()));
create policy plan_entitlements_select on public.plan_entitlements for select to authenticated
  using ((select private.is_platform_staff()));
create policy billing_prices_select on public.billing_prices for select to authenticated
  using ((select private.is_platform_staff()));
create policy reserved_slugs_select on public.reserved_slugs for select to authenticated
  using ((select private.is_platform_staff()));

-- Billing records: the restaurant's billing.manage holders (owners) and platform billing staff.
create policy subscription_periods_select on public.subscription_periods for select to authenticated
  using ((select private.has_permission(restaurant_id, 'billing.manage'))
         or (select private.has_platform_role(array['super_admin', 'admin', 'finance', 'support']::public.platform_role[])));
create policy billing_invoices_select on public.billing_invoices for select to authenticated
  using ((select private.has_permission(restaurant_id, 'billing.manage'))
         or (select private.has_platform_role(array['super_admin', 'admin', 'finance', 'support']::public.platform_role[])));
create policy billing_payments_select on public.billing_payments for select to authenticated
  using ((select private.has_permission(restaurant_id, 'billing.manage'))
         or (select private.has_platform_role(array['super_admin', 'admin', 'finance']::public.platform_role[])));
create policy trial_grants_select on public.trial_grants for select to authenticated
  using ((select private.has_platform_role(array['super_admin', 'admin', 'support']::public.platform_role[])));
create policy restaurant_entitlement_overrides_select on public.restaurant_entitlement_overrides for select to authenticated
  using ((select private.has_platform_role(array['super_admin', 'admin', 'support']::public.platform_role[])));
