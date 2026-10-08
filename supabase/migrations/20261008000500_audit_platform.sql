-- Audit (append-only, kept forever, full snapshot) and platform staff.
--
-- Decision (Phase 1 review): audit rows are never edited or deleted, are not linked by
-- cascading foreign keys (they outlive restaurants and people), and store a full snapshot of
-- the actor (name, phone, email, role) as they were at the time.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- NULL for events that are not tied to a restaurant (e.g. sign-up).
  restaurant_id uuid,
  branch_id uuid,
  actor_user_id uuid,
  actor_membership_id uuid,
  actor_role_key text,
  actor_name text,
  actor_phone_e164 text,
  actor_email text,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  object_type text not null,
  object_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  device_id text
);

create index audit_events_restaurant_time_idx on public.audit_events (restaurant_id, occurred_at desc);
create index audit_events_object_idx on public.audit_events (object_type, object_id);
create index audit_events_actor_idx on public.audit_events (actor_user_id, occurred_at desc);

-- Platform staff: GoMenu employees. Individual accounts only; managed by migrations/seed or
-- (Phase 2) the platform admin console.
create type public.platform_role as enum (
  'super_admin', 'admin', 'support', 'finance', 'content', 'discovery'
);

create table public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role public.platform_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platform_staff_set_updated_at
  before update on public.platform_staff
  for each row execute function private.set_updated_at();

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_platform_role text,
  actor_name text,
  actor_phone_e164 text,
  actor_email text,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  object_type text not null,
  object_id uuid,
  -- Set when a platform action touches a tenant (e.g. Super Admin reading restaurant data).
  restaurant_id uuid,
  reason text,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text
);

create index platform_audit_events_time_idx on public.platform_audit_events (occurred_at desc);
create index platform_audit_events_restaurant_idx on public.platform_audit_events (restaurant_id, occurred_at desc);

-- Nobody can edit or delete audit history — not even SECURITY DEFINER code or service_role.
create or replace function private.audit_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.audit_is_append_only();
create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function private.audit_is_append_only();
create trigger platform_audit_events_append_only
  before update or delete on public.platform_audit_events
  for each row execute function private.audit_is_append_only();
create trigger platform_audit_events_no_truncate
  before truncate on public.platform_audit_events
  for each statement execute function private.audit_is_append_only();

-- Writers. Called only from SECURITY DEFINER functions; never granted to clients.
create or replace function private.write_audit(
  p_restaurant_id uuid,
  p_action text,
  p_object_type text,
  p_object_id uuid,
  p_before jsonb default null,
  p_after jsonb default null,
  p_branch_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_membership_id uuid;
  v_role_key text;
  v_profile public.profiles;
begin
  if v_uid is not null then
    select * into v_profile from public.profiles where id = v_uid;
    if p_restaurant_id is not null then
      select m.id, r.key into v_membership_id, v_role_key
        from public.memberships m join public.roles r on r.id = m.role_id
       where m.user_id = v_uid and m.restaurant_id = p_restaurant_id
         and m.status not in ('expired', 'cancelled', 'removed')
       limit 1;
    end if;
  end if;

  insert into public.audit_events (
    restaurant_id, branch_id, actor_user_id, actor_membership_id, actor_role_key,
    actor_name, actor_phone_e164, actor_email, action, object_type, object_id,
    before, after, metadata, ip_address, user_agent, device_id
  ) values (
    p_restaurant_id, p_branch_id, v_uid, v_membership_id, v_role_key,
    v_profile.full_name, v_profile.phone_e164, v_profile.email, p_action, p_object_type, p_object_id,
    p_before, p_after, coalesce(p_metadata, '{}'::jsonb),
    split_part(coalesce(private.request_header('x-forwarded-for'), ''), ',', 1),
    private.request_header('user-agent'),
    private.request_header('x-gomenu-device-id')
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.write_platform_audit(
  p_action text,
  p_object_type text,
  p_object_id uuid,
  p_restaurant_id uuid default null,
  p_reason text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_role text;
begin
  select * into v_profile from public.profiles where id = v_uid;
  select role::text into v_role from public.platform_staff where user_id = v_uid;
  insert into public.platform_audit_events (
    actor_user_id, actor_platform_role, actor_name, actor_phone_e164, actor_email,
    action, object_type, object_id, restaurant_id, reason, before, after, metadata,
    ip_address, user_agent
  ) values (
    v_uid, v_role, v_profile.full_name, v_profile.phone_e164, v_profile.email,
    p_action, p_object_type, p_object_id, p_restaurant_id, p_reason, p_before, p_after,
    coalesce(p_metadata, '{}'::jsonb),
    split_part(coalesce(private.request_header('x-forwarded-for'), ''), ',', 1),
    private.request_header('user-agent')
  ) returning id into v_id;
  return v_id;
end;
$$;

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
alter table public.platform_staff enable row level security;
alter table public.platform_staff force row level security;
alter table public.platform_audit_events enable row level security;
alter table public.platform_audit_events force row level security;

revoke all on public.audit_events, public.platform_staff, public.platform_audit_events from anon, authenticated;
