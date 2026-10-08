-- Tenancy: each restaurant is a tenant; branches belong to exactly one restaurant.
-- Every tenant-owned table carries restaurant_id (even child tables) so RLS can filter on it
-- directly, and composite foreign keys make cross-tenant references impossible.

create type public.restaurant_status as enum (
  'trial', 'active', 'past_due', 'grace', 'suspended', 'retention', 'expiring', 'deleted'
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  status public.restaurant_status not null default 'trial',
  country_code text not null default 'OM' check (country_code ~ '^[A-Z]{2}$'),
  currency text not null default 'OMR' check (currency ~ '^[A-Z]{3}$'),
  default_locale text not null default 'en' check (default_locale in ('en', 'ar')),
  -- Staff invitation lifetime (spec §4: configurable 24–72h).
  invite_ttl_hours integer not null default 48 check (invite_ttl_hours between 24 and 72),
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger restaurants_set_updated_at
  before update on public.restaurants
  for each row execute function private.set_updated_at();

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  address text,
  phone_e164 text check (phone_e164 is null or private.is_e164(phone_e164)),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for composite FKs: (branch_id, restaurant_id) must belong together.
  unique (id, restaurant_id)
);

create index branches_restaurant_id_idx on public.branches (restaurant_id);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function private.set_updated_at();

alter table public.restaurants enable row level security;
alter table public.restaurants force row level security;
alter table public.branches enable row level security;
alter table public.branches force row level security;

revoke all on public.restaurants, public.branches from anon, authenticated;
