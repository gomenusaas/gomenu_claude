-- Phase 4: website templates (spec §7). 9 launch templates: 3 free, 3 Gold, 3 paid one-time.
-- Templates are records Platform manages (add, price, activate, preview); they are presentation
-- only, so switching never touches restaurant data.

create type public.template_tier as enum ('free', 'gold', 'paid');

create table public.website_templates (
  key text primary key check (key ~ '^[a-z0-9_-]{2,40}$'),
  name jsonb not null check (private.is_i18n_text(name)),
  description jsonb not null default '{}' check (private.is_i18n_text(description, false)),
  tier public.template_tier not null,
  price_minor bigint check (price_minor is null or price_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only paid templates carry a price.
  check ((tier = 'paid') = (price_minor is not null))
);
create trigger website_templates_set_updated_at before update on public.website_templates
  for each row execute function private.set_updated_at();

insert into public.website_templates (key, tier, price_minor, sort, name, description) values
  ('classic', 'free', null, 10, '{"en": "Classic", "ar": "كلاسيك"}',
   '{"en": "Cover photo, then your menu as a clear list.", "ar": "صورة غلاف ثم قائمتك بشكل واضح."}'),
  ('minimal', 'free', null, 20, '{"en": "Minimal", "ar": "بسيط"}',
   '{"en": "Text-first and fast, with sticky category tabs.", "ar": "نصي وسريع مع تبويبات فئات ثابتة."}'),
  ('cards', 'free', null, 30, '{"en": "Cards", "ar": "بطاقات"}',
   '{"en": "Photo cards in a grid, great for colourful dishes.", "ar": "بطاقات مصورة في شبكة، مثالية للأطباق الملونة."}'),
  ('showcase', 'gold', null, 40, '{"en": "Showcase", "ar": "واجهة"}',
   '{"en": "Full-screen hero, promotion carousel and Frames up front.", "ar": "واجهة كاملة الشاشة مع العروض والإطارات في المقدمة."}'),
  ('bold', 'gold', null, 50, '{"en": "Bold", "ar": "جريء"}',
   '{"en": "Dark, high-contrast, large type and a side-scrolling menu.", "ar": "داكن بتباين عالٍ وخط كبير وقائمة أفقية."}'),
  ('street', 'gold', null, 60, '{"en": "Street", "ar": "ستريت"}',
   '{"en": "Vibrant and playful, built for quick-service and food trucks.", "ar": "حيوي ومرح، مصمم للوجبات السريعة وعربات الطعام."}'),
  ('elegant', 'paid', 4900, 70, '{"en": "Elegant", "ar": "أنيق"}',
   '{"en": "Fine-dining: centred serif type, generous spacing, no clutter.", "ar": "للمطاعم الراقية: خط أنيق ومساحات واسعة."}'),
  ('magazine', 'paid', 4900, 80, '{"en": "Magazine", "ar": "مجلة"}',
   '{"en": "Editorial layout with large photos and a story about you.", "ar": "تصميم تحريري بصور كبيرة وقصة عن مطعمك."}'),
  ('cafe', 'paid', 4900, 90, '{"en": "Café", "ar": "مقهى"}',
   '{"en": "Warm and cosy, with a category sidebar on larger screens.", "ar": "دافئ ومريح مع قائمة فئات جانبية على الشاشات الكبيرة."}');

-- No direct table access: the catalogue is read through list_templates(), changed through
-- platform_upsert_template().
alter table public.website_templates enable row level security;
alter table public.website_templates force row level security;
revoke all on public.website_templates from anon, authenticated;

-- Purchases record restaurant, template, date, price, currency, reference and status.
create type public.template_purchase_status as enum ('pending', 'paid', 'void');

create table public.template_purchases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  template_key text not null references public.website_templates (key),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  invoice_id uuid not null unique references public.billing_invoices (id),
  status public.template_purchase_status not null default 'pending',
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);
create unique index template_purchases_one_live_uidx on public.template_purchases (restaurant_id, template_key)
  where status <> 'void';
create trigger tenant_write_guard before insert or update or delete on public.template_purchases
  for each row execute function private.guard_tenant_writable();

alter table public.template_purchases enable row level security;
alter table public.template_purchases force row level security;
revoke all on public.template_purchases from anon, authenticated;
grant select on public.template_purchases to authenticated;
create policy template_purchases_select on public.template_purchases for select to authenticated
  using ((select private.has_permission(restaurant_id, 'website.manage'))
         or (select private.has_permission(restaurant_id, 'billing.manage')));

-- Template invoices, like credit packs, have no plan.
alter table public.billing_invoices drop constraint billing_invoices_plan_or_credits;
alter table public.billing_invoices add constraint billing_invoices_plan_or_credits
  check ((kind in ('ai_credits', 'template')) = (plan_id is null) and (ai_credits is null or kind = 'ai_credits'));

-- Can this restaurant use this template right now?
create or replace function private.can_use_template(p_restaurant_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.is_active and case t.tier
      when 'free' then private.has_feature(p_restaurant_id, 'templates_free')
      when 'gold' then private.has_feature(p_restaurant_id, 'templates_premium')
      else exists (select 1 from public.template_purchases p
                    where p.restaurant_id = p_restaurant_id and p.template_key = t.key and p.status = 'paid')
    end
    from public.website_templates t where t.key = p_key), false);
$$;

-- The template shown publicly: the chosen one if still allowed (e.g. after a downgrade), else Classic.
create or replace function private.effective_template(p_restaurant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.can_use_template(p_restaurant_id, w.template_key) then w.template_key else 'classic' end
    from public.website_settings w where w.restaurant_id = p_restaurant_id;
$$;

create or replace function private.guard_template_choice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.template_key is distinct from old.template_key
     and not private.can_use_template(new.restaurant_id, new.template_key) then
    raise exception 'this template is not available to your restaurant' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger website_settings_template_guard before update on public.website_settings
  for each row execute function private.guard_template_choice();
alter table public.website_settings
  add constraint website_settings_template_fk foreign key (template_key) references public.website_templates (key);

-- Owner buys a paid template: an invoice now, the template unlocks when the invoice is paid.
create or replace function public.buy_template(p_restaurant_id uuid, p_template_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.website_templates;
  v_id uuid;
begin
  if not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_t from public.website_templates where key = p_template_key;
  if v_t.key is null or not v_t.is_active or v_t.tier <> 'paid' then
    raise exception 'this template cannot be bought' using errcode = '22023';
  end if;
  if exists (select 1 from public.template_purchases where restaurant_id = p_restaurant_id
               and template_key = p_template_key and status <> 'void') then
    raise exception 'this template is already bought or waiting for payment' using errcode = '23505';
  end if;
  v_id := private.issue_invoice(p_restaurant_id, 'template', null, 0, 0, 0,
    jsonb_build_array(jsonb_build_object('description', format('Website template: %s', v_t.name ->> 'en'),
                                         'quantity', 1, 'unit_amount_minor', v_t.price_minor,
                                         'amount_minor', v_t.price_minor)),
    v_t.price_minor, now() + make_interval(days => private.setting_int('invoice_due_days')));
  insert into public.template_purchases (restaurant_id, template_key, price_minor, currency, invoice_id, created_by)
  values (p_restaurant_id, v_t.key, v_t.price_minor, v_t.currency, v_id, auth.uid());
  perform private.write_audit(p_restaurant_id, 'website.template_bought', 'template', null, null,
                              jsonb_build_object('template', v_t.key, 'invoice_id', v_id));
  return v_id;
end;
$$;

-- Invoice paid / voided → purchase paid / void.
create or replace function private.sync_template_purchase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'template' and new.status is distinct from old.status then
    update public.template_purchases
       set status = case new.status when 'paid' then 'paid'::public.template_purchase_status
                                    when 'void' then 'void'::public.template_purchase_status else status end,
           paid_at = case when new.status = 'paid' then new.paid_at else paid_at end
     where invoice_id = new.id;
  end if;
  return new;
end;
$$;
create trigger billing_invoices_template_purchase after update of status on public.billing_invoices
  for each row execute function private.sync_template_purchase();

-- apply_paid_invoice learns the template kind (everything else unchanged).
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

  if v_inv.kind = 'template' then
    null;  -- the purchase is marked paid by the billing_invoices_template_purchase trigger
  elsif v_inv.kind = 'ai_credits' then
    if v_inv.ai_credits is null then
      raise exception 'credit invoice % has no credit quantity', v_inv.number using errcode = '22023';
    end if;
    insert into public.ai_credit_ledger (restaurant_id, delta, reason, invoice_id, created_by, note)
    values (v_inv.restaurant_id, v_inv.ai_credits, 'purchase', v_inv.id, auth.uid(), v_inv.number);
  elsif v_inv.kind = 'new_period' then
    select max(ends_at) into v_future_end from public.subscription_periods
     where restaurant_id = v_inv.restaurant_id and ends_at > p_now;
    v_last := private.latest_period(v_inv.restaurant_id, p_now);
    v_start := case
      when v_future_end is not null then v_future_end
      when v_last.kind = 'paid' and v_r.status in ('past_due', 'grace') then v_last.ends_at
      else p_now
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

-- Platform manages the catalogue (add, price, activate). Audited.
create or replace function public.platform_upsert_template(p_key text, p_name jsonb, p_description jsonb,
  p_tier public.template_tier, p_price_minor bigint, p_is_active boolean, p_sort integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform private.require_platform(array['super_admin', 'admin', 'content']::public.platform_role[]);
  select to_jsonb(t) into v_before from public.website_templates t where key = p_key;
  insert into public.website_templates (key, name, description, tier, price_minor, is_active, sort)
  values (p_key, p_name, coalesce(p_description, '{}'), p_tier, case when p_tier = 'paid' then p_price_minor end,
          p_is_active, coalesce(p_sort, 0))
  on conflict (key) do update
     set name = excluded.name, description = excluded.description, tier = excluded.tier,
         price_minor = excluded.price_minor, is_active = excluded.is_active, sort = excluded.sort;
  perform private.write_platform_audit('templates.upserted', 'template', null, null, null, v_before,
    (select to_jsonb(t) from public.website_templates t where key = p_key));
end;
$$;

-- The catalogue. With a restaurant: whether each template is usable there and any purchase.
-- Inactive templates are listed only for platform staff (templates_manage).
create or replace function public.list_templates(p_restaurant_id uuid default null, p_include_inactive boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_include_inactive then
    perform private.require_platform(array['super_admin', 'admin', 'content']::public.platform_role[]);
  end if;
  if p_restaurant_id is not null and not private.has_permission(p_restaurant_id, 'website.manage')
     and not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'key', t.key, 'name', t.name, 'description', t.description, 'tier', t.tier,
            'price_minor', t.price_minor, 'currency', t.currency, 'is_active', t.is_active, 'sort', t.sort)
            || case when p_restaurant_id is null then '{}'::jsonb else jsonb_build_object(
                 'usable', private.can_use_template(p_restaurant_id, t.key),
                 'purchase_status', (select p.status from public.template_purchases p
                                      where p.restaurant_id = p_restaurant_id and p.template_key = t.key
                                        and p.status <> 'void')) end
            order by t.sort), '[]'::jsonb)
            from public.website_templates t where t.is_active or p_include_inactive);
end;
$$;

grant execute on function public.list_templates(uuid, boolean) to anon, authenticated;
grant execute on function public.buy_template(uuid, text) to authenticated;
grant execute on function public.platform_upsert_template(text, jsonb, jsonb, public.template_tier, bigint, boolean, integer)
  to authenticated;
