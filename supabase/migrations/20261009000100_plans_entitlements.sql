-- Phase 2: platform settings, feature catalog, plans, versioned prices and entitlements.
-- Entitlements are centralised here (spec §6): code asks private.has_feature(), never "is Gold".
-- All of these are platform-managed; restaurants read them only through RPCs.

-- ---------------------------------------------------------------------------
-- Platform settings (every duration/price-related knob is editable in Platform Admin)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('billing_currency',            '"USD"',  'Currency for GoMenu subscription prices and invoices'),
  ('trial_months',                '2',      'Free trial length in months (first-time owners only)'),
  ('trial_plan_key',              '"gold"', 'Plan whose features a trial unlocks'),
  ('past_due_days',               '7',      'Days in Past Due after coverage ends, before Grace'),
  ('grace_days',                  '21',     'Days in Grace before Suspended'),
  ('suspended_days',              '30',     'Days in Suspended before Retention'),
  ('retention_days',              '180',    'Days in Retention (data and domain config preserved)'),
  ('expiring_days',               '30',     'Days in Expiring (final warnings) before Deleted'),
  ('renewal_window_days',         '30',     'Days before period end when renewal invoices are issued'),
  ('invoice_due_days',            '14',     'Days until an invoice is due'),
  ('tax_rate_bp',                 '0',      'Tax rate in basis points (500 = 5%). 0 until confirmed (decision P2-Q8)'),
  ('tax_label',                   '"VAT"',  'Tax label printed on invoices'),
  ('terms_version',               '"2026-10-draft"', 'Current Terms of Service version owners must accept'),
  ('bank_transfer_instructions',  '"Bank transfer details will be provided by GoMenu Finance. Use the invoice number as the payment reference."', 'Shown on unpaid invoices while payments are recorded manually (decision P2-Q1)'),
  ('sales_whatsapp',              '""',     'WhatsApp number for sales/support (E.164), shown on the contact page'),
  ('sales_email',                 '""',     'Sales/support email shown on the contact page');

create or replace function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.platform_settings where key = p_key;
$$;

create or replace function private.setting_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::integer from public.platform_settings where key = p_key;
$$;

create or replace function private.setting_text(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value #>> '{}' from public.platform_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Features and plans
-- ---------------------------------------------------------------------------
create type public.feature_kind as enum ('flag', 'limit');

create table public.features (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  kind public.feature_kind not null default 'flag',
  category text not null,
  name text not null,
  description text,
  sort integer not null default 0
);

insert into public.features (key, kind, category, name, sort) values
  ('website',            'flag',  'presence',   'Mobile-first website',                 10),
  ('qr_menu',            'flag',  'presence',   'Digital / QR menu',                    20),
  ('ai_menu_import',     'flag',  'menu',       'AI menu creation',                     30),
  ('unlimited_menu',     'flag',  'menu',       'Unlimited categories and items',       40),
  ('item_images',        'limit', 'menu',       'Images per item',                      50),
  ('item_videos',        'limit', 'menu',       'Videos per item',                      60),
  ('gallery',            'flag',  'presence',   'Gallery',                              70),
  ('templates_free',     'flag',  'presence',   'Free templates',                       80),
  ('templates_premium',  'flag',  'presence',   'Premium templates',                    90),
  ('custom_domain',      'flag',  'presence',   'Custom domain',                       100),
  ('social_whatsapp',    'flag',  'presence',   'Social links and WhatsApp',           110),
  ('sharing',            'flag',  'presence',   'Sharing',                             120),
  ('staff_roles',        'flag',  'team',       'Unlimited staff and roles',           130),
  ('branches_included',  'limit', 'team',       'Branches included',                   140),
  ('ordering',           'flag',  'operations', 'Ordering',                            150),
  ('gateway',            'flag',  'operations', 'Payment gateway connectivity',        160),
  ('loyalty_core',       'flag',  'growth',     'Core loyalty',                        170),
  ('promotions',         'flag',  'growth',     'Promotions and carousel',             180),
  ('frames',             'flag',  'growth',     'Frames',                              190),
  ('analytics_basic',    'flag',  'insights',   'Basic analytics',                     200),
  ('analytics_advanced', 'flag',  'insights',   'Advanced analytics',                  210),
  ('reports_advanced',   'flag',  'insights',   'Advanced reports',                    220),
  ('priority_support',   'flag',  'support',    'Priority WhatsApp support',           230);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

insert into public.plans (key, name, description, sort) values
  ('silver', 'Silver', 'Everything a restaurant needs to go online and take orders.', 10),
  ('gold',   'Gold',   'Silver plus promotions, Frames, premium templates and advanced insights.', 20);

-- limit_value NULL on a limit feature = unlimited.
create table public.plan_entitlements (
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_key text not null references public.features (key) on delete restrict,
  enabled boolean not null,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_key)
);

insert into public.plan_entitlements (plan_id, feature_key, enabled, limit_value)
select p.id, f.key,
       case
         when p.key = 'gold' then true
         else f.key not in ('templates_premium', 'promotions', 'frames', 'analytics_advanced',
                            'reports_advanced', 'priority_support')
       end,
       case f.key
         when 'item_images' then 5
         when 'item_videos' then 1
         when 'branches_included' then case when p.key = 'silver' then 1 end  -- Gold: unlimited (P2-Q3)
       end
  from public.plans p cross join public.features f;

-- ---------------------------------------------------------------------------
-- Versioned prices: a price change closes the old row and opens a new one, so invoices
-- and periods keep the price that applied when they were issued.
-- ---------------------------------------------------------------------------
create type public.price_item as enum ('plan', 'extra_branch');

create table public.billing_prices (
  id uuid primary key default gen_random_uuid(),
  item_type public.price_item not null,
  plan_id uuid references public.plans (id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor >= 0),
  billing_interval text not null default 'year' check (billing_interval = 'year'),  -- annual only (§6)
  active_from timestamptz not null default now(),
  active_until timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((item_type = 'plan') = (plan_id is not null)),
  check (active_until is null or active_until > active_from)
);

create unique index billing_prices_one_open_uidx
  on public.billing_prices (item_type, coalesce(plan_id, '00000000-0000-0000-0000-000000000000'::uuid), currency)
  where active_until is null;

insert into public.billing_prices (item_type, plan_id, currency, amount_minor)
select 'plan', id, 'USD', case key when 'silver' then 12000 when 'gold' then 18000 end from public.plans;
insert into public.billing_prices (item_type, plan_id, currency, amount_minor)
values ('extra_branch', null, 'USD', 6000);

create or replace function private.current_price(p_item public.price_item, p_plan_id uuid, p_at timestamptz default now())
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select amount_minor from public.billing_prices
   where item_type = p_item and plan_id is not distinct from p_plan_id
     and currency = private.setting_text('billing_currency')
     and active_from <= p_at and (active_until is null or active_until > p_at)
   order by active_from desc limit 1;
$$;

-- Reserved web addresses: marketing/app routes can never become restaurant slugs.
create table public.reserved_slugs (
  slug text primary key
);
insert into public.reserved_slugs (slug) values
  ('about'), ('account'), ('admin'), ('api'), ('app'), ('assets'), ('auth'), ('billing'), ('blog'),
  ('choose'), ('contact'), ('dashboard'), ('dev'), ('docs'), ('features'), ('gomenu'), ('help'),
  ('invite'), ('login'), ('logout'), ('onboarding'), ('pending'), ('platform'), ('pricing'),
  ('privacy'), ('qr'), ('register'), ('r'), ('settings'), ('signup'), ('static'), ('support'),
  ('terms'), ('verify'), ('www'), ('t'), ('go'), ('discover'), ('discovery');

alter table public.platform_settings enable row level security;
alter table public.platform_settings force row level security;
alter table public.features enable row level security;
alter table public.features force row level security;
alter table public.plans enable row level security;
alter table public.plans force row level security;
alter table public.plan_entitlements enable row level security;
alter table public.plan_entitlements force row level security;
alter table public.billing_prices enable row level security;
alter table public.billing_prices force row level security;
alter table public.reserved_slugs enable row level security;
alter table public.reserved_slugs force row level security;

revoke all on public.platform_settings, public.features, public.plans, public.plan_entitlements,
  public.billing_prices, public.reserved_slugs from anon, authenticated;
