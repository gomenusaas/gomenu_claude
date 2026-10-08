-- Roles, permissions, memberships and branch scope.
--
-- Access = identity + membership (which restaurant) + role + permissions + branch scope.
-- A membership grants permissions ONLY while status = 'active'. New Staff is a system role
-- with zero permissions; triggers below make that rule impossible to break.

-- ---------------------------------------------------------------------------
-- Permission catalog (global reference data, managed only by migrations)
-- ---------------------------------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  category text not null,
  description text not null,
  -- Owner-only permissions can never be granted to another role or by override.
  owner_only boolean not null default false
);

insert into public.permissions (key, category, description, owner_only) values
  ('orders.view',              'orders',    'View orders',                                   false),
  ('orders.manage',            'orders',    'Manage orders (status, assignment, cancel)',    false),
  ('orders.create_waiter',     'orders',    'Create waiter orders',                          false),
  ('orders.confirm_table',     'orders',    'Confirm table-QR orders',                       false),
  ('kitchen.access',           'kitchen',   'Use the kitchen display',                       false),
  ('menu.view',                'menu',      'View the menu in admin',                        false),
  ('menu.edit',                'menu',      'Edit the menu',                                 false),
  ('promotions.manage',        'marketing', 'Manage promotions',                             false),
  ('frames.manage',            'marketing', 'Manage Frames',                                 false),
  ('gallery.manage',           'marketing', 'Manage the gallery',                            false),
  ('customers.view',           'customers', 'View this restaurant''s customers',             false),
  ('loyalty.view',             'loyalty',   'View loyalty',                                  false),
  ('loyalty.manage',           'loyalty',   'Manage loyalty programs',                       false),
  ('loyalty.adjust',           'loyalty',   'Manually adjust loyalty balances',              false),
  ('analytics.view',           'reports',   'View analytics',                                false),
  ('reports.financial',        'reports',   'View financial reports (Income)',               false),
  ('reports.export',           'reports',   'Export reports',                                false),
  ('audit.view',               'security',  'View the activity log',                         false),
  ('staff.view',               'staff',     'View staff',                                    false),
  ('staff.manage',             'staff',     'Invite, resend, cancel and manage staff',       false),
  ('roles.assign',             'staff',     'Assign roles, branches and permissions',        false),
  ('roles.manage',             'staff',     'Create and edit custom roles',                  false),
  ('branches.manage',          'settings',  'Manage branches',                               false),
  ('website.manage',           'settings',  'Manage website, templates and domains',         false),
  ('qr.manage',                'settings',  'Manage tables and QR codes',                    false),
  ('settings.manage',          'settings',  'Manage restaurant settings',                    false),
  ('payments.manage',          'owner',     'Connect and manage payment gateways',           true),
  ('billing.manage',           'owner',     'Manage GoMenu subscription and billing',        true),
  ('ownership.transfer',       'owner',     'Transfer ownership, manage owners',             true);

-- ---------------------------------------------------------------------------
-- Roles: system roles (restaurant_id IS NULL, managed by migrations) and custom roles
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants (id) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  is_owner boolean not null default false,
  is_new_staff boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- System roles are global; custom roles belong to one restaurant.
  check (is_system = (restaurant_id is null)),
  -- Owner and New Staff exist only as system roles.
  check (not (is_owner or is_new_staff) or is_system),
  check (not (is_owner and is_new_staff)),
  unique (id, restaurant_id)
);

create unique index roles_system_key_uidx on public.roles (key) where restaurant_id is null;
create unique index roles_restaurant_key_uidx on public.roles (restaurant_id, key) where restaurant_id is not null;
create unique index roles_single_owner_role_uidx on public.roles (is_owner) where is_owner;
create unique index roles_single_new_staff_role_uidx on public.roles (is_new_staff) where is_new_staff;

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete restrict,
  primary key (role_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Memberships: a person's place in one restaurant
-- ---------------------------------------------------------------------------
create type public.membership_status as enum (
  'invitation_sent',       -- invited, link not yet opened
  'verification_pending',  -- link opened, OTP sent to the invited number
  'new_staff',             -- OTP + PIN done; Verified / Awaiting Role (zero permissions)
  'active',                -- role assigned; permissions apply
  'expired',               -- invitation expired
  'cancelled',             -- invitation cancelled
  'locked',                -- security lock
  'disabled',              -- disabled by management
  'removed'                -- removed from the restaurant (kept for history)
);

create type public.branch_scope as enum ('all', 'selected');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  -- NULL until the invited person verifies their phone.
  user_id uuid references auth.users (id) on delete restrict,
  role_id uuid not null,
  status public.membership_status not null,
  branch_scope public.branch_scope not null default 'selected',
  -- Snapshot of who was invited (the invitation is bound to this phone).
  invited_name text,
  invited_phone_e164 text check (invited_phone_e164 is null or private.is_e164(invited_phone_e164)),
  -- Spec §4: intended branch is a note only, never authorization.
  intended_branch_id uuid,
  invited_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (role_id) references public.roles (id) on delete restrict,
  foreign key (intended_branch_id, restaurant_id) references public.branches (id, restaurant_id),
  unique (id, restaurant_id)
);

-- One live membership per person per restaurant (history rows are kept).
create unique index memberships_live_user_uidx on public.memberships (restaurant_id, user_id)
  where user_id is not null and status not in ('expired', 'cancelled', 'removed');
create unique index memberships_live_phone_uidx on public.memberships (restaurant_id, invited_phone_e164)
  where invited_phone_e164 is not null and status in ('invitation_sent', 'verification_pending');
create index memberships_user_lookup_idx on public.memberships (user_id, restaurant_id, status);
create index memberships_restaurant_idx on public.memberships (restaurant_id, status);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

create table public.membership_branches (
  membership_id uuid not null,
  branch_id uuid not null,
  restaurant_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, branch_id),
  -- Both sides must belong to the same restaurant.
  foreign key (membership_id, restaurant_id) references public.memberships (id, restaurant_id) on delete cascade,
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id) on delete cascade
);

create index membership_branches_branch_idx on public.membership_branches (branch_id);

create type public.permission_effect as enum ('grant', 'deny');

create table public.membership_permission_overrides (
  membership_id uuid not null,
  restaurant_id uuid not null,
  permission_key text not null references public.permissions (key) on delete restrict,
  effect public.permission_effect not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (membership_id, permission_key),
  foreign key (membership_id, restaurant_id) references public.memberships (id, restaurant_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Integrity guards (apply to every writer, including SECURITY DEFINER functions)
-- ---------------------------------------------------------------------------

-- A custom role's restaurant must match the membership's restaurant.
create or replace function private.guard_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
  v_owner_count integer;
begin
  select * into v_role from public.roles where id = new.role_id;
  if v_role.restaurant_id is not null and v_role.restaurant_id <> new.restaurant_id then
    raise exception 'role % does not belong to restaurant %', new.role_id, new.restaurant_id
      using errcode = '23514';
  end if;

  -- New Staff can never be active; an active membership can never hold the New Staff role.
  if new.status = 'active' and v_role.is_new_staff then
    raise exception 'New Staff cannot be active: assign a role first' using errcode = '23514';
  end if;

  -- Anyone not yet active is New Staff (zero permissions) — whatever the caller asked for.
  if new.status in ('invitation_sent', 'verification_pending', 'new_staff') and not v_role.is_new_staff then
    raise exception 'memberships in status % must hold the New Staff role', new.status using errcode = '23514';
  end if;

  if new.status in ('new_staff', 'active', 'locked', 'disabled') and new.user_id is null then
    raise exception 'membership in status % requires a user', new.status using errcode = '23514';
  end if;

  if new.status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;

  -- Never leave a restaurant without an active owner.
  if tg_op = 'UPDATE' and old.status = 'active'
     and exists (select 1 from public.roles r where r.id = old.role_id and r.is_owner)
     and (new.status <> 'active' or not v_role.is_owner) then
    select count(*) into v_owner_count
      from public.memberships m
      join public.roles r on r.id = m.role_id and r.is_owner
     where m.restaurant_id = old.restaurant_id and m.status = 'active' and m.id <> old.id;
    if v_owner_count = 0 then
      raise exception 'a restaurant must keep at least one active owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.restaurant_id <> old.restaurant_id
     or (old.user_id is not null and new.user_id is distinct from old.user_id)) then
    raise exception 'membership restaurant/user cannot change' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger memberships_guard
  before insert or update on public.memberships
  for each row execute function private.guard_membership();

create or replace function private.guard_membership_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'memberships are never deleted; set status = removed' using errcode = '42501';
end;
$$;

create trigger memberships_no_delete
  before delete on public.memberships
  for each row execute function private.guard_membership_delete();

-- The New Staff role can never receive a permission, and owner-only permissions stay with Owner.
create or replace function private.guard_role_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
  v_owner_only boolean;
begin
  select * into v_role from public.roles where id = new.role_id;
  if v_role.is_new_staff then
    raise exception 'the New Staff role has zero permissions, immutably' using errcode = '42501';
  end if;
  select owner_only into v_owner_only from public.permissions where key = new.permission_key;
  if v_owner_only and not v_role.is_owner then
    raise exception 'permission % is owner-only', new.permission_key using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger role_permissions_guard
  before insert or update on public.role_permissions
  for each row execute function private.guard_role_permission();

-- Overrides only on active memberships, never owner-only grants.
create or replace function private.guard_permission_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.membership_status;
  v_is_new_staff boolean;
  v_owner_only boolean;
begin
  select m.status, r.is_new_staff into v_status, v_is_new_staff
    from public.memberships m join public.roles r on r.id = m.role_id
   where m.id = new.membership_id;
  if v_status <> 'active' or v_is_new_staff then
    raise exception 'permission overrides require an active, assigned membership' using errcode = '42501';
  end if;
  select owner_only into v_owner_only from public.permissions where key = new.permission_key;
  if new.effect = 'grant' and v_owner_only then
    raise exception 'permission % is owner-only', new.permission_key using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger membership_permission_overrides_guard
  before insert or update on public.membership_permission_overrides
  for each row execute function private.guard_permission_override();

-- Branch selections only on assigned memberships.
create or replace function private.guard_membership_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.memberships m join public.roles r on r.id = m.role_id
     where m.id = new.membership_id and r.is_new_staff
  ) then
    raise exception 'New Staff cannot be given branch access' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger membership_branches_guard
  before insert or update on public.membership_branches
  for each row execute function private.guard_membership_branch();

-- System roles and their permissions are migration-managed only.
create or replace function private.guard_system_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    if tg_table_name = 'roles' and (coalesce(old.is_system, false) or coalesce(new.is_system, false)) then
      raise exception 'system roles are managed by migrations only' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger roles_guard_system
  before insert or update or delete on public.roles
  for each row execute function private.guard_system_role();

-- ---------------------------------------------------------------------------
-- System roles
-- ---------------------------------------------------------------------------
insert into public.roles (key, name, description, is_system, is_owner, is_new_staff) values
  ('owner',          'Owner',              'Full control including billing, gateway and ownership', true, true,  false),
  ('admin',          'Admin',              'Everything except owner-only permissions',              true, false, false),
  ('manager',        'Manager',            'Runs operations, menu and staff',                       true, false, false),
  ('branch_manager', 'Branch Manager',     'Runs operations for assigned branches',                 true, false, false),
  ('waiter',         'Waiter',             'Takes and confirms orders',                             true, false, false),
  ('kitchen',        'Kitchen',            'Kitchen display only',                                  true, false, false),
  ('order_staff',    'Order Staff',        'Handles incoming orders',                               true, false, false),
  ('finance',        'Finance/Reporting',  'Financial reports and exports',                         true, false, false),
  ('new_staff',      'New Staff',          'Verified, awaiting role. Zero permissions.',            true, false, true);

-- owner: everything
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'owner' and r.is_system;

-- admin: everything except owner-only
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
 where r.key = 'admin' and r.is_system and not p.owner_only;

insert into public.role_permissions (role_id, permission_key)
select r.id, v.perm
  from public.roles r
  join (values
    ('manager', 'orders.view'), ('manager', 'orders.manage'), ('manager', 'orders.create_waiter'),
    ('manager', 'orders.confirm_table'), ('manager', 'kitchen.access'), ('manager', 'menu.view'),
    ('manager', 'menu.edit'), ('manager', 'promotions.manage'), ('manager', 'frames.manage'),
    ('manager', 'gallery.manage'), ('manager', 'customers.view'), ('manager', 'loyalty.view'),
    ('manager', 'loyalty.manage'), ('manager', 'analytics.view'), ('manager', 'staff.view'),
    ('manager', 'staff.manage'), ('manager', 'roles.assign'), ('manager', 'qr.manage'),
    ('manager', 'audit.view'),
    ('branch_manager', 'orders.view'), ('branch_manager', 'orders.manage'),
    ('branch_manager', 'orders.create_waiter'), ('branch_manager', 'orders.confirm_table'),
    ('branch_manager', 'kitchen.access'), ('branch_manager', 'menu.view'),
    ('branch_manager', 'staff.view'), ('branch_manager', 'analytics.view'),
    ('waiter', 'orders.view'), ('waiter', 'orders.create_waiter'), ('waiter', 'orders.confirm_table'),
    ('waiter', 'menu.view'),
    ('kitchen', 'kitchen.access'), ('kitchen', 'menu.view'),
    ('order_staff', 'orders.view'), ('order_staff', 'orders.manage'), ('order_staff', 'menu.view'),
    ('finance', 'reports.financial'), ('finance', 'reports.export'), ('finance', 'analytics.view')
  ) as v(role_key, perm) on v.role_key = r.key and r.is_system;

-- ---------------------------------------------------------------------------
-- RLS on: policies live in the authorization migration
-- ---------------------------------------------------------------------------
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.membership_branches enable row level security;
alter table public.membership_branches force row level security;
alter table public.membership_permission_overrides enable row level security;
alter table public.membership_permission_overrides force row level security;

revoke all on public.permissions, public.roles, public.role_permissions, public.memberships,
  public.membership_branches, public.membership_permission_overrides from anon, authenticated;
