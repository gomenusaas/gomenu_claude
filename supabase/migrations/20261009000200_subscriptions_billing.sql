-- Phase 2: subscription periods, trial grants, invoices, payments and entitlement overrides.
-- Every money value is an integer in minor units with its currency, snapshotted when the
-- invoice/period is created (spec §2: later price changes never rewrite history).

create extension if not exists btree_gist with schema extensions;

alter table public.restaurants
  add column status_changed_at timestamptz not null default now(),
  -- Manual platform suspension (audited); the lifecycle keeps the restaurant Suspended while set.
  add column platform_hold boolean not null default false,
  add column platform_hold_reason text,
  add column terms_version text,
  add column terms_accepted_at timestamptz,
  add column terms_accepted_by uuid references auth.users (id) on delete set null,
  add column onboarding_completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Subscription periods: [starts_at, ends_at) per restaurant, never overlapping.
-- ---------------------------------------------------------------------------
create type public.period_kind as enum ('trial', 'paid');

create table public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.period_kind not null,
  plan_id uuid not null references public.plans (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  extra_branches integer not null default 0 check (extra_branches >= 0),
  -- snapshot of what was charged (NULL for trials)
  currency text check (currency ~ '^[A-Z]{3}$'),
  plan_amount_minor bigint check (plan_amount_minor >= 0),
  branch_unit_amount_minor bigint check (branch_unit_amount_minor >= 0),
  invoice_id uuid,
  -- set when a period is split by a mid-term upgrade or branch purchase
  superseded_by uuid references public.subscription_periods (id),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind = 'trial' or (currency is not null and plan_amount_minor is not null)),
  exclude using gist (restaurant_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create index subscription_periods_restaurant_idx on public.subscription_periods (restaurant_id, starts_at desc);

-- One automatic free trial per verified owner mobile, ever (decision P2-Q5).
create type public.trial_source as enum ('automatic', 'platform_exception');

create table public.trial_grants (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null check (private.is_e164(phone_e164)),
  user_id uuid references auth.users (id) on delete set null,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  source public.trial_source not null,
  reason text,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  check (source = 'automatic' or reason is not null)
);
create unique index trial_grants_one_automatic_per_phone_uidx on public.trial_grants (phone_e164)
  where source = 'automatic';

-- ---------------------------------------------------------------------------
-- Invoices and payments
-- ---------------------------------------------------------------------------
create type public.invoice_kind as enum ('new_period', 'upgrade', 'extra_branches');
create type public.invoice_status as enum ('open', 'paid', 'void');

create sequence public.billing_invoice_number_seq;

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.invoice_kind not null,
  status public.invoice_status not null default 'open',
  plan_id uuid not null references public.plans (id) on delete restrict,
  extra_branches integer not null default 0 check (extra_branches >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- line items snapshot: [{description, quantity, unit_amount_minor, amount_minor}]
  lines jsonb not null,
  plan_amount_minor bigint not null check (plan_amount_minor >= 0),
  branch_unit_amount_minor bigint not null check (branch_unit_amount_minor >= 0),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  tax_label text not null,
  tax_rate_bp integer not null check (tax_rate_bp between 0 and 10000),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor = subtotal_minor + tax_minor),
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null)),
  check ((status = 'void') = (voided_at is not null))
);

create index billing_invoices_restaurant_idx on public.billing_invoices (restaurant_id, issued_at desc);
create index billing_invoices_status_idx on public.billing_invoices (status, due_at);
-- At most one open invoice per restaurant: issuing a new one voids the old.
create unique index billing_invoices_one_open_uidx on public.billing_invoices (restaurant_id) where status = 'open';

create trigger billing_invoices_set_updated_at before update on public.billing_invoices
  for each row execute function private.set_updated_at();

alter table public.subscription_periods
  add constraint subscription_periods_invoice_fk foreign key (invoice_id) references public.billing_invoices (id);

create type public.payment_method as enum ('bank_transfer', 'cash', 'card_offline', 'processor');

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices (id) on delete restrict,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method public.payment_method not null,
  reference text not null check (length(btrim(reference)) > 0),
  -- for a future processor integration (decision P2-Q1): idempotent webhook keys
  processor text,
  processor_payment_id text,
  received_at timestamptz not null,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (method, reference),
  unique (processor, processor_payment_id)
);

create index billing_payments_restaurant_idx on public.billing_payments (restaurant_id, received_at desc);

-- Payments are financial records: never edited or deleted (refunds come later as new rows).
create trigger billing_payments_append_only before update or delete on public.billing_payments
  for each row execute function private.audit_is_append_only();

-- Platform-managed exceptions to plan entitlements for one restaurant.
create table public.restaurant_entitlement_overrides (
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  feature_key text not null references public.features (key) on delete restrict,
  enabled boolean not null,
  limit_value integer check (limit_value is null or limit_value >= 0),
  reason text not null,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, feature_key)
);

alter table public.subscription_periods enable row level security;
alter table public.subscription_periods force row level security;
alter table public.trial_grants enable row level security;
alter table public.trial_grants force row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoices force row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_payments force row level security;
alter table public.restaurant_entitlement_overrides enable row level security;
alter table public.restaurant_entitlement_overrides force row level security;

revoke all on public.subscription_periods, public.trial_grants, public.billing_invoices,
  public.billing_payments, public.restaurant_entitlement_overrides from anon, authenticated;
revoke all on sequence public.billing_invoice_number_seq from anon, authenticated;
