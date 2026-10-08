-- Phase 2: registration rules (terms, reserved slugs, one trial per owner phone) and the
-- billing lifecycle engine.

-- Reserved web addresses can never be used as restaurant slugs.
create or replace function private.guard_reserved_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reserved_slugs where slug = new.slug) then
    raise exception 'the web address "%" is reserved', new.slug using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger restaurants_reserved_slug
  before insert or update of slug on public.restaurants
  for each row execute function private.guard_reserved_slug();

-- In-app notification for the restaurant's owners (billing.manage).
create or replace function private.notify_owners(p_restaurant_id uuid, p_kind text, p_title text,
                                                 p_data jsonb default '{}'::jsonb, p_object_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.restaurant_notifications (restaurant_id, kind, required_permission, title, object_type, object_id, data)
  values (p_restaurant_id, p_kind, 'billing.manage', p_title, 'restaurant', coalesce(p_object_id, p_restaurant_id), p_data);
$$;

-- ---------------------------------------------------------------------------
-- Registration: create_restaurant now requires terms acceptance and applies the trial rule.
-- ---------------------------------------------------------------------------
drop function public.create_restaurant(text, text, text);

create or replace function public.create_restaurant(
  p_name text,
  p_slug text,
  p_branch_name text default null,
  p_accept_terms boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_restaurant public.restaurants;
  v_branch_id uuid;
  v_membership_id uuid;
  v_trial_plan uuid;
  v_trial_end timestamptz;
  v_has_trial boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select phone_e164 into v_phone from public.profiles where id = v_uid;
  if v_phone is null then
    raise exception 'verify your mobile number before creating a restaurant' using errcode = '42501';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'you must accept the Terms of Service' using errcode = '22023';
  end if;

  -- One automatic free trial per verified owner mobile, ever (decision P2-Q5).
  v_has_trial := not exists (select 1 from public.trial_grants where phone_e164 = v_phone and source = 'automatic');

  insert into public.restaurants (name, slug, created_by, status, terms_version, terms_accepted_at, terms_accepted_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid,
          (case when v_has_trial then 'trial' else 'past_due' end)::public.restaurant_status,
          private.setting_text('terms_version'), now(), v_uid)
  returning * into v_restaurant;

  insert into public.branches (restaurant_id, name)
  values (v_restaurant.id, coalesce(nullif(btrim(p_branch_name), ''), 'Main branch'))
  returning id into v_branch_id;

  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, verified_at, activated_at)
  select v_restaurant.id, v_uid, id, 'active', 'all', now(), now() from public.roles where is_owner and is_system
  returning id into v_membership_id;

  if v_has_trial then
    select id into v_trial_plan from public.plans where key = private.setting_text('trial_plan_key');
    v_trial_end := now() + make_interval(months => private.setting_int('trial_months'));
    insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, created_by, note)
    values (v_restaurant.id, 'trial', v_trial_plan, now(), v_trial_end, v_uid, 'first-time free trial');
    insert into public.trial_grants (phone_e164, user_id, restaurant_id, source)
    values (v_phone, v_uid, v_restaurant.id, 'automatic');
  else
    perform private.notify_owners(v_restaurant.id, 'billing.no_trial', 'Choose a plan to keep your restaurant active',
      jsonb_build_object('reason', 'free trial already used by this mobile number'));
  end if;

  perform private.write_audit(v_restaurant.id, 'restaurant.created', 'restaurant', v_restaurant.id,
                              null, to_jsonb(v_restaurant));
  perform private.write_audit(v_restaurant.id, 'restaurant.terms_accepted', 'restaurant', v_restaurant.id,
                              null, jsonb_build_object('version', v_restaurant.terms_version));
  perform private.write_audit(v_restaurant.id, 'branch.created', 'branch', v_branch_id, null,
                              jsonb_build_object('name', coalesce(nullif(btrim(p_branch_name), ''), 'Main branch')),
                              v_branch_id);
  perform private.write_audit(v_restaurant.id, 'membership.owner_created', 'membership', v_membership_id,
                              null, jsonb_build_object('role', 'owner', 'status', 'active'));
  perform private.write_audit(v_restaurant.id,
                              case when v_has_trial then 'billing.trial_started' else 'billing.trial_refused' end,
                              'restaurant', v_restaurant.id, null,
                              jsonb_build_object('trial_ends_at', v_trial_end, 'phone', v_phone));
  return v_restaurant.id;
end;
$$;

grant execute on function public.create_restaurant(text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create or replace function private.issue_invoice(
  p_restaurant_id uuid,
  p_kind public.invoice_kind,
  p_plan_id uuid,
  p_extra_branches integer,
  p_plan_amount_minor bigint,
  p_branch_unit_amount_minor bigint,
  p_lines jsonb,
  p_subtotal_minor bigint,
  p_due_at timestamptz,
  p_issued_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_rate integer := coalesce(private.setting_int('tax_rate_bp'), 0);
  v_tax bigint := round(p_subtotal_minor * v_rate / 10000.0);
begin
  update public.billing_invoices
     set status = 'void', voided_at = p_issued_at, void_reason = 'replaced by a newer invoice'
   where restaurant_id = p_restaurant_id and status = 'open';

  insert into public.billing_invoices (number, restaurant_id, kind, plan_id, extra_branches, currency, lines,
                                       plan_amount_minor, branch_unit_amount_minor, subtotal_minor, tax_label,
                                       tax_rate_bp, tax_minor, total_minor, issued_at, due_at, created_by)
  values ('GM-' || to_char(p_issued_at, 'YYYY') || '-' || lpad(nextval('public.billing_invoice_number_seq')::text, 6, '0'),
          p_restaurant_id, p_kind, p_plan_id, p_extra_branches, private.setting_text('billing_currency'), p_lines,
          p_plan_amount_minor, p_branch_unit_amount_minor, p_subtotal_minor, private.setting_text('tax_label'),
          v_rate, v_tax, p_subtotal_minor + v_tax, p_issued_at, p_due_at, auth.uid())
  returning id into v_id;

  perform private.write_audit(p_restaurant_id, 'billing.invoice_issued', 'invoice', v_id, null,
    jsonb_build_object('kind', p_kind, 'subtotal_minor', p_subtotal_minor, 'tax_minor', v_tax,
                       'lines', p_lines));
  return v_id;
end;
$$;

-- Annual invoice for a plan (+ extra branches) at today's prices.
create or replace function private.issue_period_invoice(p_restaurant_id uuid, p_plan_id uuid, p_extra integer,
                                                        p_due_at timestamptz, p_now timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_plan_price bigint;
  v_branch_price bigint;
  v_lines jsonb;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  v_plan_price := private.current_price('plan', p_plan_id, p_now);
  v_branch_price := private.current_price('extra_branch', null, p_now);
  if v_plan_price is null or v_branch_price is null then
    raise exception 'no current price configured for plan %', v_plan.key using errcode = 'P0001';
  end if;
  v_lines := jsonb_build_array(jsonb_build_object(
    'description', v_plan.name || ' plan, 12 months', 'quantity', 1,
    'unit_amount_minor', v_plan_price, 'amount_minor', v_plan_price));
  if p_extra > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'description', 'Extra branch, 12 months', 'quantity', p_extra,
      'unit_amount_minor', v_branch_price, 'amount_minor', v_branch_price * p_extra));
  end if;
  return private.issue_invoice(p_restaurant_id, 'new_period', p_plan_id, p_extra, v_plan_price, v_branch_price,
                               v_lines, v_plan_price + v_branch_price * p_extra, p_due_at, p_now);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle engine. Idempotent; computes each restaurant's state from its periods and the
-- configurable durations, and records every transition. p_now is a parameter so tests can
-- simulate time.
-- ---------------------------------------------------------------------------
create or replace function private.lifecycle_target(p_restaurant_id uuid, p_now timestamptz)
returns public.restaurant_status
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r public.restaurants;
  v_cur public.subscription_periods;
  v_last public.subscription_periods;
  v_anchor timestamptz;
  v_days numeric;
  v_past integer := private.setting_int('past_due_days');
  v_grace integer := private.setting_int('grace_days');
  v_susp integer := private.setting_int('suspended_days');
  v_ret integer := private.setting_int('retention_days');
  v_exp integer := private.setting_int('expiring_days');
begin
  select * into v_r from public.restaurants where id = p_restaurant_id;
  if v_r.status = 'deleted' then
    return 'deleted';
  end if;
  v_cur := private.current_period(p_restaurant_id, p_now);
  if v_cur.id is not null and not v_r.platform_hold then
    return case v_cur.kind when 'trial' then 'trial'::public.restaurant_status else 'active' end;
  end if;

  v_last := private.latest_period(p_restaurant_id, p_now);
  -- Coverage ended at the end of the last period; restaurants that never had one count from creation.
  v_anchor := coalesce(v_last.ends_at, v_r.created_at);
  v_days := extract(epoch from (p_now - v_anchor)) / 86400.0;

  if v_r.platform_hold then
    -- Manual suspension: at least Suspended, and the normal timeline still applies after it.
    if v_days < v_past + v_grace + v_susp then
      return 'suspended';
    end if;
  end if;

  return case
    when v_days < v_past then 'past_due'
    when v_days < v_past + v_grace then 'grace'
    when v_days < v_past + v_grace + v_susp then 'suspended'
    when v_days < v_past + v_grace + v_susp + v_ret then 'retention'
    when v_days < v_past + v_grace + v_susp + v_ret + v_exp then 'expiring'
    else 'deleted'
  end::public.restaurant_status;
end;
$$;

create or replace function private.run_billing_lifecycle(p_now timestamptz default now(), p_restaurant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_target public.restaurant_status;
  v_cur public.subscription_periods;
  v_last public.subscription_periods;
  v_changes integer := 0;
  v_window interval := make_interval(days => private.setting_int('renewal_window_days'));
begin
  for v_r in
    select * from public.restaurants
     where status <> 'deleted' and (p_restaurant_id is null or id = p_restaurant_id)
     order by id
     for update
  loop
    v_target := private.lifecycle_target(v_r.id, p_now);
    if v_target <> v_r.status then
      perform set_config('gomenu.system_action', 'on', true);
      update public.restaurants set status = v_target, status_changed_at = p_now where id = v_r.id;
      perform set_config('gomenu.system_action', 'off', true);
      v_changes := v_changes + 1;
      perform private.write_audit(v_r.id, 'billing.status_changed', 'restaurant', v_r.id,
        jsonb_build_object('status', v_r.status), jsonb_build_object('status', v_target),
        null, jsonb_build_object('at', p_now));
      perform private.write_platform_audit('billing.status_changed', 'restaurant', v_r.id, v_r.id, null,
        jsonb_build_object('status', v_r.status), jsonb_build_object('status', v_target));
      perform private.notify_owners(v_r.id, 'billing.status_changed',
        case v_target
          when 'active' then 'Your subscription is active'
          when 'past_due' then 'Payment is due'
          when 'grace' then 'Payment overdue: renew to avoid suspension'
          when 'suspended' then 'Your restaurant is suspended'
          when 'retention' then 'Your restaurant is suspended; data is being kept for you'
          when 'expiring' then 'Your restaurant data will be deleted soon'
          when 'deleted' then 'Your restaurant has been closed'
          else 'Subscription status changed'
        end,
        jsonb_build_object('from', v_r.status, 'to', v_target));
    end if;

    v_cur := private.current_period(v_r.id, p_now);
    v_last := private.latest_period(v_r.id, p_now);

    -- Trial ending soon: remind once.
    if v_cur.kind = 'trial' and v_cur.ends_at <= p_now + interval '14 days'
       and not exists (select 1 from public.restaurant_notifications
                        where restaurant_id = v_r.id and kind = 'billing.trial_ending' and object_id = v_cur.id) then
      perform private.notify_owners(v_r.id, 'billing.trial_ending', 'Your free trial ends soon',
        jsonb_build_object('trial_ends_at', v_cur.ends_at), v_cur.id);
    end if;

    -- Renewal invoice: paid coverage ending inside the renewal window (or already lapsed),
    -- nothing paid beyond it, and no open invoice yet.
    if v_last.kind = 'paid' and v_target not in ('deleted')
       and v_last.ends_at <= p_now + v_window
       and not exists (select 1 from public.subscription_periods
                        where restaurant_id = v_r.id and ends_at > v_last.ends_at)
       and not exists (select 1 from public.billing_invoices where restaurant_id = v_r.id and status = 'open') then
      perform private.issue_period_invoice(v_r.id, v_last.plan_id, v_last.extra_branches,
                                           greatest(v_last.ends_at, p_now + interval '1 day'), p_now);
      perform private.notify_owners(v_r.id, 'billing.renewal_invoice', 'Your renewal invoice is ready',
        jsonb_build_object('period_ends_at', v_last.ends_at));
    end if;
  end loop;
  return v_changes;
end;
$$;

-- Hourly, so transitions happen within an hour of their due time.
create extension if not exists pg_cron;
select cron.schedule('gomenu-billing-lifecycle', '7 * * * *', $$select private.run_billing_lifecycle()$$);
