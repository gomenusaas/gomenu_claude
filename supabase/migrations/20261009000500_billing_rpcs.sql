-- Phase 2: restaurant-facing billing/entitlement RPCs, payment application, platform admin
-- RPCs and the updated routing context.

-- ---------------------------------------------------------------------------
-- Public pricing (marketing site): plans, current prices, features. No auth needed.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_pricing()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', private.setting_text('billing_currency'),
    'trial_months', private.setting_int('trial_months'),
    'extra_branch_amount_minor', private.current_price('extra_branch', null),
    'features', (select jsonb_agg(jsonb_build_object('key', f.key, 'kind', f.kind, 'category', f.category, 'name', f.name)
                                  order by f.sort) from public.features f),
    'plans', (select jsonb_agg(jsonb_build_object(
                'key', p.key, 'name', p.name, 'description', p.description,
                'amount_minor', private.current_price('plan', p.id),
                'entitlements', (select jsonb_object_agg(pe.feature_key,
                                   jsonb_build_object('enabled', pe.enabled, 'limit', pe.limit_value))
                                   from public.plan_entitlements pe where pe.plan_id = p.id))
              order by p.sort)
              from public.plans p where p.is_public and p.is_active)
  );
$$;

-- The caller's effective entitlements in a restaurant (any active member).
create or replace function public.restaurant_entitlements(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  if not private.is_active_member(p_restaurant_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_plan := private.effective_plan_id(p_restaurant_id);
  return jsonb_build_object(
    'status', (select status from public.restaurants where id = p_restaurant_id),
    'plan_key', (select key from public.plans where id = v_plan),
    'writable', private.restaurant_writable(p_restaurant_id),
    'branch_limit', private.branch_limit(p_restaurant_id),
    'features', (select jsonb_object_agg(f.key, to_jsonb(private.feature_value(p_restaurant_id, f.key)))
                   from public.features f)
  );
end;
$$;

-- Everything the owner's billing page needs.
create or replace function public.restaurant_billing_overview(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r public.restaurants;
  v_cur public.subscription_periods;
  v_last public.subscription_periods;
begin
  if not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_r from public.restaurants where id = p_restaurant_id;
  v_cur := private.current_period(p_restaurant_id);
  v_last := private.latest_period(p_restaurant_id);
  return jsonb_build_object(
    'status', v_r.status,
    'status_changed_at', v_r.status_changed_at,
    'platform_hold', v_r.platform_hold,
    'writable', private.restaurant_writable(p_restaurant_id),
    'current_period', case when v_cur.id is null then null else jsonb_build_object(
        'kind', v_cur.kind, 'plan_key', (select key from public.plans where id = v_cur.plan_id),
        'starts_at', v_cur.starts_at, 'ends_at', v_cur.ends_at, 'extra_branches', v_cur.extra_branches) end,
    'last_period_ends_at', v_last.ends_at,
    'next_period', (select jsonb_build_object('starts_at', sp.starts_at, 'ends_at', sp.ends_at,
                                              'plan_key', (select key from public.plans where id = sp.plan_id))
                      from public.subscription_periods sp
                     where sp.restaurant_id = p_restaurant_id and sp.starts_at > now()
                     order by sp.starts_at limit 1),
    'effective_plan_key', (select key from public.plans where id = private.effective_plan_id(p_restaurant_id)),
    'branch_limit', private.branch_limit(p_restaurant_id),
    'branches_in_use', (select count(*) from public.branches where restaurant_id = p_restaurant_id
                          and is_active and archived_at is null),
    'renewal_window_days', private.setting_int('renewal_window_days'),
    'bank_transfer_instructions', private.setting_text('bank_transfer_instructions'),
    'pricing', public.get_public_pricing(),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'kind', i.kind, 'status', i.status, 'currency', i.currency,
        'lines', i.lines, 'subtotal_minor', i.subtotal_minor, 'tax_label', i.tax_label,
        'tax_rate_bp', i.tax_rate_bp, 'tax_minor', i.tax_minor, 'total_minor', i.total_minor,
        'issued_at', i.issued_at, 'due_at', i.due_at, 'paid_at', i.paid_at) order by i.issued_at desc)
        from (select * from public.billing_invoices where restaurant_id = p_restaurant_id
               order by issued_at desc limit 20) i), '[]'::jsonb)
  );
end;
$$;

-- Owner chooses a plan for a new annual period (end of trial, renewal, or reactivation).
create or replace function public.choose_plan(p_restaurant_id uuid, p_plan_key text, p_extra_branches integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_cur public.subscription_periods;
  v_unlimited boolean;
  v_id uuid;
begin
  if not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select status from public.restaurants where id = p_restaurant_id) = 'deleted' then
    raise exception 'this restaurant has been closed' using errcode = '42501';
  end if;
  select * into v_plan from public.plans where key = p_plan_key and is_active and is_public;
  if v_plan.id is null then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_extra_branches is null or p_extra_branches < 0 or p_extra_branches > 50 then
    raise exception 'extra branches must be between 0 and 50' using errcode = '22023';
  end if;
  select pe.enabled and pe.limit_value is null into v_unlimited
    from public.plan_entitlements pe where pe.plan_id = v_plan.id and pe.feature_key = 'branches_included';
  if coalesce(v_unlimited, false) and p_extra_branches > 0 then
    raise exception '% already includes unlimited branches', v_plan.name using errcode = '22023';
  end if;

  v_cur := private.current_period(p_restaurant_id);
  if exists (select 1 from public.subscription_periods
              where restaurant_id = p_restaurant_id and kind = 'paid' and starts_at > now()) then
    raise exception 'your next period is already paid' using errcode = '22023';
  end if;
  if v_cur.kind = 'paid' and v_cur.ends_at > now() + make_interval(days => private.setting_int('renewal_window_days')) then
    raise exception 'your plan is active until %; upgrade or add branches instead', v_cur.ends_at::date
      using errcode = '22023';
  end if;

  v_id := private.issue_period_invoice(p_restaurant_id, v_plan.id, p_extra_branches,
                                       now() + make_interval(days => private.setting_int('invoice_due_days')));
  return v_id;
end;
$$;

-- Fraction of the paid ANNUAL TERM still remaining (for proration). Measured against the full
-- year ending at ends_at, not the period row, because mid-term changes split periods.
create or replace function private.remaining_fraction(p_period public.subscription_periods, p_now timestamptz default now())
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(1, greatest(0, extract(epoch from (p_period.ends_at - p_now)))
                  / extract(epoch from (p_period.ends_at - (p_period.ends_at - interval '1 year'))));
$$;

create or replace function public.buy_extra_branches(p_restaurant_id uuid, p_count integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur public.subscription_periods;
  v_unit bigint;
  v_amount bigint;
  v_plan public.plans;
begin
  if not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'choose between 1 and 50 branches' using errcode = '22023';
  end if;
  v_cur := private.current_period(p_restaurant_id);
  if v_cur.kind is distinct from 'paid' then
    raise exception 'extra branches can be added to an active paid plan; choose a plan first' using errcode = '22023';
  end if;
  if private.branch_limit(p_restaurant_id) is null then
    raise exception 'your plan already includes unlimited branches' using errcode = '22023';
  end if;
  select * into v_plan from public.plans where id = v_cur.plan_id;
  v_unit := private.current_price('extra_branch', null);
  v_amount := round(v_unit * p_count * private.remaining_fraction(v_cur));
  return private.issue_invoice(p_restaurant_id, 'extra_branches', v_cur.plan_id, p_count,
    v_cur.plan_amount_minor, v_unit,
    jsonb_build_array(jsonb_build_object(
      'description', format('Extra branch, prorated to %s', to_char(v_cur.ends_at, 'YYYY-MM-DD')),
      'quantity', p_count, 'unit_amount_minor', round(v_unit * private.remaining_fraction(v_cur)),
      'amount_minor', v_amount)),
    v_amount, now() + make_interval(days => private.setting_int('invoice_due_days')));
end;
$$;

create or replace function public.upgrade_plan(p_restaurant_id uuid, p_plan_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur public.subscription_periods;
  v_plan public.plans;
  v_new_price bigint;
  v_amount bigint;
begin
  if not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_cur := private.current_period(p_restaurant_id);
  if v_cur.kind is distinct from 'paid' then
    raise exception 'upgrades apply to an active paid plan; choose a plan instead' using errcode = '22023';
  end if;
  select * into v_plan from public.plans where key = p_plan_key and is_active and is_public;
  v_new_price := private.current_price('plan', v_plan.id);
  if v_plan.id is null or v_plan.id = v_cur.plan_id or v_new_price <= v_cur.plan_amount_minor then
    raise exception 'choose a higher plan to upgrade; downgrades apply at renewal' using errcode = '22023';
  end if;
  v_amount := round((v_new_price - v_cur.plan_amount_minor) * private.remaining_fraction(v_cur));
  return private.issue_invoice(p_restaurant_id, 'upgrade', v_plan.id, v_cur.extra_branches,
    v_new_price, coalesce(v_cur.branch_unit_amount_minor, 0),
    jsonb_build_array(jsonb_build_object(
      'description', format('Upgrade to %s, prorated to %s', v_plan.name, to_char(v_cur.ends_at, 'YYYY-MM-DD')),
      'quantity', 1, 'unit_amount_minor', v_amount, 'amount_minor', v_amount)),
    v_amount, now() + make_interval(days => private.setting_int('invoice_due_days')));
end;
$$;

-- Onboarding checklist, computed from real data.
create or replace function public.restaurant_setup_status(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not private.has_permission(p_restaurant_id, 'settings.manage') then null else
    jsonb_build_object(
      'details', exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.default_locale is not null),
      'branch', exists (select 1 from public.branches b where b.restaurant_id = p_restaurant_id
                          and b.address is not null and b.phone_e164 is not null),
      'team', (select count(*) > 1 from public.memberships m where m.restaurant_id = p_restaurant_id
                 and m.status not in ('cancelled', 'removed', 'expired')),
      'plan', exists (select 1 from public.subscription_periods sp where sp.restaurant_id = p_restaurant_id and sp.kind = 'paid')
              or exists (select 1 from public.billing_invoices i where i.restaurant_id = p_restaurant_id and i.status = 'open'),
      'completed_at', (select onboarding_completed_at from public.restaurants where id = p_restaurant_id)
    ) end;
$$;

create or replace function public.complete_onboarding(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_restaurant_id, 'settings.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.restaurants set onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Applying a paid invoice (called only by platform payment recording, or a future
-- processor webhook). Activates/extends coverage, then re-runs the lifecycle.
-- ---------------------------------------------------------------------------
create or replace function private.apply_paid_invoice(p_invoice_id uuid, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.billing_invoices;
  v_r public.restaurants;
  v_start timestamptz;
  v_future_end timestamptz;
  v_last public.subscription_periods;
  v_cur public.subscription_periods;
  v_new_id uuid;
begin
  select * into v_inv from public.billing_invoices where id = p_invoice_id for update;
  if v_inv.status <> 'open' then
    raise exception 'invoice % is %', v_inv.number, v_inv.status using errcode = '22023';
  end if;
  select * into v_r from public.restaurants where id = v_inv.restaurant_id for update;

  if v_inv.kind = 'new_period' then
    select max(ends_at) into v_future_end from public.subscription_periods
     where restaurant_id = v_inv.restaurant_id and ends_at > p_now;
    v_last := private.latest_period(v_inv.restaurant_id, p_now);
    v_start := case
      when v_future_end is not null then v_future_end                         -- renew early / pay during trial
      when v_last.kind = 'paid' and v_r.status in ('past_due', 'grace') then v_last.ends_at  -- continuous
      else p_now                                                              -- lapsed or first payment
    end;
    insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, extra_branches,
                                             currency, plan_amount_minor, branch_unit_amount_minor, invoice_id, created_by)
    values (v_inv.restaurant_id, 'paid', v_inv.plan_id, v_start, v_start + interval '1 year', v_inv.extra_branches,
            v_inv.currency, v_inv.plan_amount_minor, v_inv.branch_unit_amount_minor, v_inv.id, auth.uid());
  else
    v_cur := private.current_period(v_inv.restaurant_id, p_now);
    if v_cur.kind is distinct from 'paid' then
      raise exception 'no active paid period to apply invoice % to; void it instead', v_inv.number using errcode = '22023';
    end if;
    if v_cur.starts_at >= p_now then
      update public.subscription_periods
         set plan_id = v_inv.plan_id, plan_amount_minor = v_inv.plan_amount_minor,
             extra_branches = case when v_inv.kind = 'extra_branches' then extra_branches + v_inv.extra_branches
                                   else extra_branches end,
             invoice_id = v_inv.id
       where id = v_cur.id;
    else
      update public.subscription_periods set ends_at = p_now where id = v_cur.id;
      insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, extra_branches,
                                               currency, plan_amount_minor, branch_unit_amount_minor, invoice_id,
                                               created_by, note)
      values (v_inv.restaurant_id, 'paid', v_inv.plan_id, p_now, v_cur.ends_at,
              case when v_inv.kind = 'extra_branches' then v_cur.extra_branches + v_inv.extra_branches
                   else v_cur.extra_branches end,
              v_cur.currency, v_inv.plan_amount_minor, v_cur.branch_unit_amount_minor, v_inv.id, auth.uid(),
              v_inv.kind::text)
      returning id into v_new_id;
      update public.subscription_periods set superseded_by = v_new_id where id = v_cur.id;
    end if;
  end if;

  update public.billing_invoices set status = 'paid', paid_at = p_now where id = v_inv.id;
  perform private.write_audit(v_inv.restaurant_id, 'billing.invoice_paid', 'invoice', v_inv.id,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'paid', 'total_minor', v_inv.total_minor));
  perform private.run_billing_lifecycle(p_now, v_inv.restaurant_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform admin RPCs. Every one requires an MFA (aal2) session and the right platform role,
-- marks itself as a platform action, and writes the platform audit log.
-- ---------------------------------------------------------------------------
create or replace function private.require_platform(p_roles public.platform_role[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_platform_role(p_roles) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform set_config('gomenu.platform_action', 'on', true);
end;
$$;

create or replace function public.platform_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(enum_range(null::public.platform_role));
  return jsonb_build_object(
    'restaurants_by_status', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from public.restaurants group by status) s), '{}'::jsonb),
    'open_invoices', (select count(*) from public.billing_invoices where status = 'open'),
    'overdue_invoices', (select count(*) from public.billing_invoices where status = 'open' and due_at < now())
  );
end;
$$;

-- Restaurant directory with commercial status. Billing-account data, visible to the platform
-- roles that run billing/support; every listing is audited (decision Q11).
create or replace function public.platform_list_restaurants(p_search text default null, p_status public.restaurant_status default null,
                                                            p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  perform private.require_platform(array['super_admin', 'admin', 'finance', 'support']::public.platform_role[]);
  perform private.write_platform_audit('platform.restaurants_listed', 'restaurant', null, null, null, null, null,
    jsonb_build_object('search', p_search, 'status', p_status, 'limit', p_limit, 'offset', p_offset));
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select r.id, r.name, r.slug, r.status, r.status_changed_at, r.platform_hold, r.created_at,
           (select key from public.plans where id = private.effective_plan_id(r.id)) as plan_key,
           (private.current_period(r.id)).ends_at as period_ends_at,
           (private.current_period(r.id)).kind as period_kind,
           (select count(*) from public.billing_invoices i where i.restaurant_id = r.id and i.status = 'open') as open_invoices
      from public.restaurants r
     where (p_status is null or r.status = p_status)
       and (p_search is null or r.name ilike '%' || p_search || '%' or r.slug ilike '%' || p_search || '%')
     order by r.created_at desc
     limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x;
  return v_rows;
end;
$$;

create or replace function public.platform_restaurant_billing(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin', 'admin', 'finance', 'support']::public.platform_role[]);
  perform private.write_platform_audit('platform.restaurant_billing_viewed', 'restaurant', p_restaurant_id, p_restaurant_id);
  return jsonb_build_object(
    'restaurant', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'status', status,
                     'status_changed_at', status_changed_at, 'platform_hold', platform_hold,
                     'platform_hold_reason', platform_hold_reason, 'created_at', created_at)
                     from public.restaurants where id = p_restaurant_id),
    'effective_plan_key', (select key from public.plans where id = private.effective_plan_id(p_restaurant_id)),
    'periods', coalesce((select jsonb_agg(to_jsonb(sp) || jsonb_build_object('plan_key', p.key) order by sp.starts_at desc)
                  from public.subscription_periods sp join public.plans p on p.id = sp.plan_id
                 where sp.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.issued_at desc)
                  from public.billing_invoices i where i.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(pm) order by pm.received_at desc)
                  from public.billing_payments pm where pm.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'trial_grants', coalesce((select jsonb_agg(to_jsonb(t)) from public.trial_grants t
                  where t.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(to_jsonb(o)) from public.restaurant_entitlement_overrides o
                  where o.restaurant_id = p_restaurant_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_list_invoices(p_status public.invoice_status default 'open', p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin', 'admin', 'finance']::public.platform_role[]);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.issued_at desc) from (
    select i.id, i.number, i.restaurant_id, r.name as restaurant_name, i.kind, i.status, i.currency,
           i.total_minor, i.issued_at, i.due_at, i.paid_at, (select key from public.plans where id = i.plan_id) as plan_key
      from public.billing_invoices i join public.restaurants r on r.id = i.restaurant_id
     where p_status is null or i.status = p_status
     order by i.issued_at desc limit least(greatest(p_limit, 1), 500)) x), '[]'::jsonb);
end;
$$;

-- Manual payment recording (decision P2-Q1). Idempotent on (method, reference).
create or replace function public.platform_record_payment(
  p_invoice_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_reference text,
  p_received_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.billing_invoices;
  v_existing public.billing_payments;
  v_id uuid;
begin
  perform private.require_platform(array['super_admin', 'finance']::public.platform_role[]);
  select * into v_existing from public.billing_payments where method = p_method and reference = btrim(p_reference);
  if v_existing.id is not null then
    if v_existing.invoice_id = p_invoice_id then
      return v_existing.id;  -- replay of the same payment: no double credit
    end if;
    raise exception 'payment reference % is already used for another invoice', p_reference using errcode = '23505';
  end if;
  select * into v_inv from public.billing_invoices where id = p_invoice_id for update;
  if v_inv.id is null or v_inv.status <> 'open' then
    raise exception 'invoice is not open' using errcode = '22023';
  end if;
  if p_amount_minor <> v_inv.total_minor then
    raise exception 'amount must equal the invoice total (%)', v_inv.total_minor using errcode = '22023';
  end if;
  if p_method = 'processor' then
    raise exception 'processor payments are recorded by the processor webhook' using errcode = '22023';
  end if;

  insert into public.billing_payments (invoice_id, restaurant_id, amount_minor, currency, method, reference,
                                       received_at, recorded_by)
  values (v_inv.id, v_inv.restaurant_id, p_amount_minor, v_inv.currency, p_method, btrim(p_reference),
          p_received_at, auth.uid())
  returning id into v_id;

  perform private.apply_paid_invoice(v_inv.id);
  perform private.write_platform_audit('billing.payment_recorded', 'invoice', v_inv.id, v_inv.restaurant_id, null,
    null, jsonb_build_object('amount_minor', p_amount_minor, 'method', p_method, 'reference', p_reference));
  return v_id;
end;
$$;

create or replace function public.platform_void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.billing_invoices;
begin
  perform private.require_platform(array['super_admin', 'finance']::public.platform_role[]);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  update public.billing_invoices set status = 'void', voided_at = now(), void_reason = btrim(p_reason)
   where id = p_invoice_id and status = 'open'
  returning * into v_inv;
  if v_inv.id is null then
    raise exception 'invoice is not open' using errcode = '22023';
  end if;
  perform private.write_platform_audit('billing.invoice_voided', 'invoice', v_inv.id, v_inv.restaurant_id, p_reason);
end;
$$;

-- New price version (old one closes now). Existing invoices/periods keep their snapshot.
create or replace function public.platform_set_price(p_item_type public.price_item, p_plan_key text, p_amount_minor bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_old public.billing_prices;
  v_id uuid;
  v_currency text := private.setting_text('billing_currency');
begin
  perform private.require_platform(array['super_admin', 'admin']::public.platform_role[]);
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_item_type = 'plan' then
    select id into v_plan_id from public.plans where key = p_plan_key;
    if v_plan_id is null then
      raise exception 'unknown plan' using errcode = '22023';
    end if;
  end if;
  update public.billing_prices set active_until = now()
   where item_type = p_item_type and plan_id is not distinct from v_plan_id and currency = v_currency
     and active_until is null
  returning * into v_old;
  insert into public.billing_prices (item_type, plan_id, currency, amount_minor, active_from, created_by)
  values (p_item_type, v_plan_id, v_currency, p_amount_minor, now(), auth.uid())
  returning id into v_id;
  perform private.write_platform_audit('pricing.price_changed', 'price', v_id, null, null,
    jsonb_build_object('amount_minor', v_old.amount_minor),
    jsonb_build_object('item', p_item_type, 'plan', p_plan_key, 'amount_minor', p_amount_minor, 'currency', v_currency));
  return v_id;
end;
$$;

create or replace function public.platform_set_entitlement(p_plan_key text, p_feature_key text, p_enabled boolean,
                                                           p_limit_value integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_old public.plan_entitlements;
begin
  perform private.require_platform(array['super_admin', 'admin']::public.platform_role[]);
  select id into v_plan_id from public.plans where key = p_plan_key;
  if v_plan_id is null or not exists (select 1 from public.features where key = p_feature_key) then
    raise exception 'unknown plan or feature' using errcode = '22023';
  end if;
  select * into v_old from public.plan_entitlements where plan_id = v_plan_id and feature_key = p_feature_key;
  insert into public.plan_entitlements (plan_id, feature_key, enabled, limit_value)
  values (v_plan_id, p_feature_key, p_enabled, p_limit_value)
  on conflict (plan_id, feature_key) do update set enabled = excluded.enabled, limit_value = excluded.limit_value;
  perform private.write_platform_audit('entitlements.plan_changed', 'plan', v_plan_id, null, null,
    to_jsonb(v_old), jsonb_build_object('feature', p_feature_key, 'enabled', p_enabled, 'limit', p_limit_value));
end;
$$;

create or replace function public.platform_set_restaurant_override(p_restaurant_id uuid, p_feature_key text,
  p_enabled boolean, p_limit_value integer, p_reason text, p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin', 'admin']::public.platform_role[]);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  insert into public.restaurant_entitlement_overrides (restaurant_id, feature_key, enabled, limit_value, reason, expires_at, created_by)
  values (p_restaurant_id, p_feature_key, p_enabled, p_limit_value, btrim(p_reason), p_expires_at, auth.uid())
  on conflict (restaurant_id, feature_key) do update
    set enabled = excluded.enabled, limit_value = excluded.limit_value, reason = excluded.reason,
        expires_at = excluded.expires_at, created_by = excluded.created_by, created_at = now();
  perform private.write_platform_audit('entitlements.restaurant_override', 'restaurant', p_restaurant_id, p_restaurant_id,
    p_reason, null, jsonb_build_object('feature', p_feature_key, 'enabled', p_enabled, 'limit', p_limit_value,
                                       'expires_at', p_expires_at));
end;
$$;

create or replace function public.platform_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  perform private.require_platform(array['super_admin']::public.platform_role[]);
  select value into v_old from public.platform_settings where key = p_key;
  if v_old is null then
    raise exception 'unknown setting %', p_key using errcode = '22023';
  end if;
  if jsonb_typeof(v_old) <> jsonb_typeof(p_value) then
    raise exception 'setting % must be a %', p_key, jsonb_typeof(v_old) using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric < 0 then
    raise exception 'setting % cannot be negative', p_key using errcode = '22023';
  end if;
  if p_key = 'billing_currency' and exists (select 1 from public.billing_invoices) then
    raise exception 'billing currency cannot change once invoices exist' using errcode = '22023';
  end if;
  update public.platform_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform private.write_platform_audit('settings.changed', 'setting', null, null, null,
    jsonb_build_object(p_key, v_old), jsonb_build_object(p_key, p_value));
end;
$$;

-- Trial exception (e.g. a returning owner promised a trial by sales).
create or replace function public.platform_grant_trial(p_restaurant_id uuid, p_days integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
begin
  perform private.require_platform(array['super_admin', 'admin']::public.platform_role[]);
  if p_days is null or p_days < 1 or p_days > 120 or length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'days (1–120) and a reason are required' using errcode = '22023';
  end if;
  if (private.current_period(p_restaurant_id)).id is not null then
    raise exception 'restaurant already has active coverage' using errcode = '22023';
  end if;
  select p.id, p.phone_e164 into v_owner from public.memberships m
    join public.roles r on r.id = m.role_id and r.is_owner
    join public.profiles p on p.id = m.user_id
   where m.restaurant_id = p_restaurant_id and m.status = 'active' order by m.created_at limit 1;
  insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, created_by, note)
  values (p_restaurant_id, 'trial', (select id from public.plans where key = private.setting_text('trial_plan_key')),
          now(), now() + make_interval(days => p_days), auth.uid(), 'platform exception: ' || btrim(p_reason));
  insert into public.trial_grants (phone_e164, user_id, restaurant_id, source, reason, granted_by)
  values (v_owner.phone_e164, v_owner.id, p_restaurant_id, 'platform_exception', btrim(p_reason), auth.uid());
  perform private.write_platform_audit('billing.trial_exception_granted', 'restaurant', p_restaurant_id, p_restaurant_id,
    p_reason, null, jsonb_build_object('days', p_days));
  perform private.run_billing_lifecycle(now(), p_restaurant_id);
end;
$$;

-- Manual suspension / release (spec §15: suspensions are platform-audited).
create or replace function public.platform_set_hold(p_restaurant_id uuid, p_hold boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin']::public.platform_role[]);
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  update public.restaurants set platform_hold = p_hold, platform_hold_reason = case when p_hold then btrim(p_reason) end
   where id = p_restaurant_id;
  perform private.write_platform_audit(case when p_hold then 'restaurant.suspended_manually' else 'restaurant.hold_released' end,
    'restaurant', p_restaurant_id, p_restaurant_id, p_reason);
  perform private.run_billing_lifecycle(now(), p_restaurant_id);
end;
$$;

create or replace function public.platform_add_staff(p_email text, p_role public.platform_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform private.require_platform(array['super_admin']::public.platform_role[]);
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_user is null then
    raise exception 'no confirmed account with that email' using errcode = '22023';
  end if;
  insert into public.platform_staff (user_id, role) values (v_user, p_role)
  on conflict (user_id) do update set role = excluded.role, is_active = true;
  perform private.write_platform_audit('platform.staff_granted', 'user', v_user, null, null, null,
    jsonb_build_object('email', p_email, 'role', p_role));
  return v_user;
end;
$$;

create or replace function public.platform_set_staff_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin']::public.platform_role[]);
  if p_user_id = auth.uid() then
    raise exception 'you cannot change your own platform access' using errcode = '42501';
  end if;
  update public.platform_staff set is_active = p_active where user_id = p_user_id;
  perform private.write_platform_audit(case when p_active then 'platform.staff_enabled' else 'platform.staff_disabled' end,
    'user', p_user_id);
end;
$$;

create or replace function public.platform_list_staff()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin']::public.platform_role[]);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', ps.user_id, 'role', ps.role, 'is_active', ps.is_active,
                     'email', u.email, 'full_name', p.full_name,
                     'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = ps.user_id and f.status = 'verified'))
                     order by ps.created_at)
                   from public.platform_staff ps join auth.users u on u.id = ps.user_id
                   left join public.profiles p on p.id = ps.user_id), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Routing context: include restaurant status; staff of suspended restaurants are told so.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_active jsonb;
  v_pending jsonb;
  v_unavailable jsonb;
  v_platform text;
  v_next text;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'next', 'login');
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'membership_id', m.id, 'restaurant_id', r.id, 'restaurant_name', r.name,
           'restaurant_slug', r.slug, 'restaurant_status', r.status, 'role_key', ro.key, 'role_name', ro.name,
           'is_owner', ro.is_owner, 'branch_scope', m.branch_scope,
           'writable', private.status_is_writable(r.status)
         ) order by r.name), '[]'::jsonb)
    into v_active
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
    join public.roles ro on ro.id = m.role_id
   where m.user_id = v_uid and m.status = 'active' and not ro.is_new_staff
     and (private.status_is_writable(r.status) or (ro.is_owner and r.status in ('suspended', 'retention', 'expiring')));

  select coalesce(jsonb_agg(jsonb_build_object(
           'membership_id', m.id, 'restaurant_name', r.name, 'status', m.status
         ) order by r.name), '[]'::jsonb)
    into v_pending
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
   where m.user_id = v_uid and m.status in ('verification_pending', 'new_staff', 'locked', 'disabled')
     and r.status <> 'deleted';

  -- Staff whose restaurant is suspended learn only that (name + status).
  select coalesce(jsonb_agg(jsonb_build_object('restaurant_name', r.name, 'restaurant_status', r.status)
           order by r.name), '[]'::jsonb)
    into v_unavailable
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
    join public.roles ro on ro.id = m.role_id
   where m.user_id = v_uid and m.status = 'active' and not ro.is_new_staff
     and not private.status_is_writable(r.status) and not (ro.is_owner and r.status in ('suspended', 'retention', 'expiring'));

  select role::text into v_platform from public.platform_staff where user_id = v_uid and is_active;

  v_next := case
    when jsonb_array_length(v_active) = 1 then 'restaurant'
    when jsonb_array_length(v_active) > 1 then 'choose_restaurant'
    when v_platform is not null then 'platform'
    when jsonb_array_length(v_pending) > 0 then 'pending'
    when jsonb_array_length(v_unavailable) > 0 then 'restaurant_unavailable'
    when v_profile.phone_e164 is null then 'verify_phone'
    else 'create_restaurant'
  end;

  return jsonb_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'full_name', v_profile.full_name,
    'phone_e164', v_profile.phone_e164,
    'email', v_profile.email,
    'locale', coalesce(v_profile.locale, 'en'),
    'platform_role', v_platform,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'active_memberships', v_active,
    'pending_memberships', v_pending,
    'unavailable_memberships', v_unavailable,
    'next', v_next
  );
end;
$$;

grant execute on function public.get_public_pricing() to anon, authenticated;
grant execute on function public.restaurant_entitlements(uuid) to authenticated;
grant execute on function public.restaurant_billing_overview(uuid) to authenticated;
grant execute on function public.choose_plan(uuid, text, integer) to authenticated;
grant execute on function public.buy_extra_branches(uuid, integer) to authenticated;
grant execute on function public.upgrade_plan(uuid, text) to authenticated;
grant execute on function public.restaurant_setup_status(uuid) to authenticated;
grant execute on function public.complete_onboarding(uuid) to authenticated;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_list_restaurants(text, public.restaurant_status, integer, integer) to authenticated;
grant execute on function public.platform_restaurant_billing(uuid) to authenticated;
grant execute on function public.platform_list_invoices(public.invoice_status, integer) to authenticated;
grant execute on function public.platform_record_payment(uuid, bigint, public.payment_method, text, timestamptz) to authenticated;
grant execute on function public.platform_void_invoice(uuid, text) to authenticated;
grant execute on function public.platform_set_price(public.price_item, text, bigint) to authenticated;
grant execute on function public.platform_set_entitlement(text, text, boolean, integer) to authenticated;
grant execute on function public.platform_set_restaurant_override(uuid, text, boolean, integer, text, timestamptz) to authenticated;
grant execute on function public.platform_set_setting(text, jsonb) to authenticated;
grant execute on function public.platform_grant_trial(uuid, integer, text) to authenticated;
grant execute on function public.platform_set_hold(uuid, boolean, text) to authenticated;
grant execute on function public.platform_add_staff(text, public.platform_role) to authenticated;
grant execute on function public.platform_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.platform_list_staff() to authenticated;
