-- Staff onboarding (spec §4, two-gate model):
--   invite (name + E.164 phone)  -> WhatsApp link with a random, single-use, expiring,
--   restaurant- and phone-bound token -> OTP to the invited number -> 6-digit PIN
--   -> New Staff (zero permissions) -> admin assigns role + branches -> Active.
--
-- Raw tokens are never stored: only SHA-256 hashes. The raw token leaves the database only
-- inside the queued WhatsApp message (private.message_outbox).

create type public.invitation_status as enum ('pending', 'opened', 'consumed', 'expired', 'cancelled', 'replaced');

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  membership_id uuid not null,
  full_name text not null,
  phone_e164 text not null check (private.is_e164(phone_e164)),
  token_hash bytea not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  opened_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (restaurant_id) references public.restaurants (id) on delete restrict,
  foreign key (membership_id, restaurant_id) references public.memberships (id, restaurant_id) on delete restrict
);

create index staff_invitations_membership_idx on public.staff_invitations (membership_id, created_at desc);
create index staff_invitations_restaurant_idx on public.staff_invitations (restaurant_id, status);

create trigger staff_invitations_set_updated_at
  before update on public.staff_invitations
  for each row execute function private.set_updated_at();

-- In-app notifications for restaurant staff, visible to holders of required_permission.
create table public.restaurant_notifications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  branch_id uuid,
  kind text not null,
  required_permission text not null references public.permissions (key),
  title text not null,
  body text,
  object_type text,
  object_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (branch_id, restaurant_id) references public.branches (id, restaurant_id)
);

create index restaurant_notifications_restaurant_idx on public.restaurant_notifications (restaurant_id, created_at desc);

-- Outbound WhatsApp/SMS queue. Delivery is pluggable: locally the queue IS the delivery
-- (see /dev/outbox); staging/production run a sender for the chosen provider.
create table private.message_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'sms')),
  to_phone_e164 text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  restaurant_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index message_outbox_status_idx on private.message_outbox (status, created_at);
create index message_outbox_phone_idx on private.message_outbox (to_phone_e164, created_at desc);

-- PINs are per person (one identity across restaurants). bcrypt hashes only.
create table private.staff_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  pin_set_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

create or replace function private.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 256 bits of randomness, URL-safe.
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function private.enqueue_message(
  p_channel text, p_to text, p_template text, p_payload jsonb, p_restaurant_id uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into private.message_outbox (channel, to_phone_e164, template, payload, restaurant_id)
  values (p_channel, p_to, p_template, coalesce(p_payload, '{}'::jsonb), p_restaurant_id)
  returning id;
$$;

create or replace function private.mask_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null
              else left(p, 4) || repeat('•', greatest(length(p) - 7, 0)) || right(p, 3) end;
$$;

-- Supabase Auth "Send SMS" hook: OTPs are queued like any other message, so they share
-- the same provider abstraction as WhatsApp invitations.
create or replace function private.hook_send_sms(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to text := '+' || ltrim(coalesce(nullif(event -> 'user' ->> 'phone_change', ''),
                                     event -> 'user' ->> 'phone'), '+');
begin
  perform private.enqueue_message('sms', v_to, 'auth_otp',
    jsonb_build_object('otp', event -> 'sms' ->> 'otp', 'user_id', event -> 'user' ->> 'id'));
  return '{}'::jsonb;
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.hook_send_sms(jsonb) to supabase_auth_admin;
revoke execute on function private.hook_send_sms(jsonb) from public, anon, authenticated;

create or replace function private.issue_invitation(p_membership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_r public.restaurants;
  v_token text := private.new_token();
  v_inv_id uuid;
  v_expires timestamptz;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  select * into v_r from public.restaurants where id = v_m.restaurant_id;
  v_expires := now() + make_interval(hours => v_r.invite_ttl_hours);

  -- Only one usable token at a time: older ones are invalidated.
  update public.staff_invitations
     set status = 'replaced'
   where membership_id = p_membership_id and status in ('pending', 'opened');

  insert into public.staff_invitations (restaurant_id, membership_id, full_name, phone_e164,
                                        token_hash, expires_at, created_by)
  values (v_m.restaurant_id, v_m.id, v_m.invited_name, v_m.invited_phone_e164,
          private.hash_token(v_token), v_expires, auth.uid())
  returning id into v_inv_id;

  perform private.enqueue_message('whatsapp', v_m.invited_phone_e164, 'staff_invitation',
    jsonb_build_object('token', v_token, 'restaurant_name', v_r.name,
                       'staff_name', v_m.invited_name, 'expires_at', v_expires),
    v_r.id);
  return v_inv_id;
end;
$$;

-- Resolve a raw token to its invitation, expiring it if needed. Returns NULL if unusable.
create or replace function private.usable_invitation(p_token text)
returns public.staff_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.staff_invitations;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select * into v_inv from public.staff_invitations where token_hash = private.hash_token(p_token);
  if v_inv.id is null then
    return null;
  end if;
  if v_inv.status in ('pending', 'opened') and v_inv.expires_at <= now() then
    update public.staff_invitations set status = 'expired' where id = v_inv.id;
    update public.memberships set status = 'expired'
     where id = v_inv.membership_id and status in ('invitation_sent', 'verification_pending');
    v_inv.status := 'expired';
  end if;
  return v_inv;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create or replace function public.invite_staff(
  p_restaurant_id uuid,
  p_full_name text,
  p_phone_e164 text,
  p_intended_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_new_staff_role uuid;
  v_phone text := btrim(p_phone_e164);
begin
  if not private.has_permission(p_restaurant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.is_e164(v_phone) then
    raise exception 'mobile number must be in E.164 format, e.g. +96891234567' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m
      left join public.profiles p on p.id = m.user_id
     where m.restaurant_id = p_restaurant_id
       and m.status not in ('expired', 'cancelled', 'removed')
       and (m.invited_phone_e164 = v_phone or p.phone_e164 = v_phone)
  ) then
    raise exception 'this mobile number is already invited or on the team' using errcode = '23505';
  end if;

  select id into v_new_staff_role from public.roles where is_new_staff;

  insert into public.memberships (restaurant_id, role_id, status, branch_scope,
                                  invited_name, invited_phone_e164, intended_branch_id, invited_by)
  values (p_restaurant_id, v_new_staff_role, 'invitation_sent', 'selected',
          btrim(p_full_name), v_phone, p_intended_branch_id, auth.uid())
  returning id into v_membership_id;

  perform private.issue_invitation(v_membership_id);
  perform private.write_audit(p_restaurant_id, 'staff.invited', 'membership', v_membership_id, null,
    jsonb_build_object('name', btrim(p_full_name), 'phone', v_phone,
                       'intended_branch_id', p_intended_branch_id, 'status', 'invitation_sent'));
  return v_membership_id;
end;
$$;

create or replace function public.resend_staff_invitation(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if v_m.id is null or not private.has_permission(v_m.restaurant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_m.status not in ('invitation_sent', 'verification_pending', 'expired') or v_m.user_id is not null then
    raise exception 'invitation cannot be resent in status %', v_m.status using errcode = '22023';
  end if;
  update public.memberships set status = 'invitation_sent' where id = v_m.id;
  perform private.issue_invitation(v_m.id);
  perform private.write_audit(v_m.restaurant_id, 'staff.invitation_resent', 'membership', v_m.id,
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'invitation_sent'));
end;
$$;

create or replace function public.cancel_staff_invitation(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if v_m.id is null or not private.has_permission(v_m.restaurant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_m.status not in ('invitation_sent', 'verification_pending', 'expired') or v_m.user_id is not null then
    raise exception 'invitation cannot be cancelled in status %', v_m.status using errcode = '22023';
  end if;
  update public.staff_invitations set status = 'cancelled', cancelled_at = now()
   where membership_id = v_m.id and status in ('pending', 'opened');
  update public.memberships set status = 'cancelled' where id = v_m.id;
  perform private.write_audit(v_m.restaurant_id, 'staff.invitation_cancelled', 'membership', v_m.id,
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'cancelled'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitee actions
-- ---------------------------------------------------------------------------

-- Public preview for the invitation page. Reveals nothing for unknown tokens.
create or replace function public.get_invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.staff_invitations;
  v_restaurant_name text;
begin
  v_inv := private.usable_invitation(p_token);
  if v_inv.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_inv.status not in ('pending', 'opened') then
    return jsonb_build_object('status', v_inv.status);
  end if;
  select name into v_restaurant_name from public.restaurants where id = v_inv.restaurant_id;
  return jsonb_build_object(
    'status', 'valid',
    'restaurant_name', v_restaurant_name,
    'staff_name', v_inv.full_name,
    'phone_masked', private.mask_phone(v_inv.phone_e164),
    'expires_at', v_inv.expires_at
  );
end;
$$;

-- Server-only: returns the invited number so the server can send the OTP to it.
-- The browser never chooses the number, so a forwarded link cannot redirect the OTP.
create or replace function public.open_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.staff_invitations;
begin
  v_inv := private.usable_invitation(p_token);
  if v_inv.id is null or v_inv.status not in ('pending', 'opened') then
    raise exception 'invitation is not valid' using errcode = '22023';
  end if;
  if v_inv.status = 'pending' then
    update public.staff_invitations set status = 'opened', opened_at = now() where id = v_inv.id;
    update public.memberships set status = 'verification_pending'
     where id = v_inv.membership_id and status = 'invitation_sent';
    perform private.write_audit(v_inv.restaurant_id, 'staff.invitation_opened', 'membership',
      v_inv.membership_id, jsonb_build_object('status', 'invitation_sent'),
      jsonb_build_object('status', 'verification_pending'));
  end if;
  return v_inv.phone_e164;
end;
$$;

-- After OTP: bind the invitation to the caller. Requires the caller's VERIFIED phone to be
-- exactly the invited phone (forwarded links grant nothing). Single use.
create or replace function public.accept_staff_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.staff_invitations;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  v_inv := private.usable_invitation(p_token);
  if v_inv.id is null or v_inv.status not in ('pending', 'opened') then
    raise exception 'invitation is not valid' using errcode = '22023';
  end if;
  select phone_e164 into v_phone from public.profiles where id = v_uid;
  if v_phone is null or v_phone <> v_inv.phone_e164 then
    raise exception 'this invitation belongs to a different mobile number' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships
              where restaurant_id = v_inv.restaurant_id and user_id = v_uid
                and status not in ('expired', 'cancelled', 'removed')) then
    raise exception 'you are already on this restaurant''s team' using errcode = '23505';
  end if;

  update public.staff_invitations
     set status = 'consumed', consumed_at = now(), consumed_by = v_uid
   where id = v_inv.id;
  update public.memberships
     set user_id = v_uid, status = 'verification_pending'
   where id = v_inv.membership_id;

  perform private.write_audit(v_inv.restaurant_id, 'staff.invitation_accepted', 'membership',
    v_inv.membership_id, null, jsonb_build_object('user_id', v_uid, 'status', 'verification_pending'));
  return v_inv.membership_id;
end;
$$;

create or replace function private.is_weak_pin(p_pin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_pin ~ '^(\d)\1{5}$'
      or p_pin in ('123456', '234567', '345678', '456789', '012345',
                   '654321', '765432', '876543', '987654', '543210', '121212', '112233');
$$;

-- Final step: PIN. Afterwards the person is New Staff: Verified / Awaiting Role, zero access.
-- If the person already has a PIN (staff elsewhere) they must enter it instead of a new one.
create or replace function public.complete_staff_verification(p_membership_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.memberships;
  v_cred private.staff_credentials;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if v_uid is null or v_m.id is null or v_m.user_id is distinct from v_uid
     or v_m.status <> 'verification_pending' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then
    raise exception 'PIN must be exactly 6 digits' using errcode = '22023';
  end if;

  select * into v_cred from private.staff_credentials where user_id = v_uid for update;
  if v_cred.user_id is null then
    if private.is_weak_pin(p_pin) then
      raise exception 'choose a less predictable PIN' using errcode = '22023';
    end if;
    insert into private.staff_credentials (user_id, pin_hash)
    values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)));
  else
    if v_cred.locked_until is not null and v_cred.locked_until > now() then
      raise exception 'too many attempts, try again later' using errcode = '42501';
    end if;
    if extensions.crypt(p_pin, v_cred.pin_hash) <> v_cred.pin_hash then
      update private.staff_credentials
         set failed_attempts = failed_attempts + 1,
             locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end,
             updated_at = now()
       where user_id = v_uid;
      perform private.write_audit(v_m.restaurant_id, 'auth.pin_failed', 'user', v_uid);
      return false;  -- returning (not raising) keeps the failed-attempt counter
    end if;
    update private.staff_credentials set failed_attempts = 0, locked_until = null, updated_at = now()
     where user_id = v_uid;
  end if;

  update public.memberships set status = 'new_staff', verified_at = now() where id = v_m.id;

  insert into public.restaurant_notifications (restaurant_id, kind, required_permission, title,
                                               object_type, object_id, data)
  values (v_m.restaurant_id, 'staff.verified', 'staff.manage', 'New Staff Verified',
          'membership', v_m.id, jsonb_build_object('name', v_m.invited_name));

  perform private.write_audit(v_m.restaurant_id, 'staff.verified', 'membership', v_m.id,
    jsonb_build_object('status', 'verification_pending'), jsonb_build_object('status', 'new_staff'));
  return true;
end;
$$;

-- Admin assigns role + branch scope: New Staff -> Active (or changes an active member).
-- Guards: no self-assignment, Owner role only by an owner, no granting permissions the caller
-- lacks, branch scope never wider than the caller's own.
create or replace function public.assign_staff_role(
  p_membership_id uuid,
  p_role_id uuid,
  p_branch_scope public.branch_scope,
  p_branch_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.memberships;
  v_role public.roles;
  v_role_perms text[];
  v_caller_scope public.branch_scope;
  v_branch uuid;
  v_before jsonb;
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if v_m.id is null or not private.has_permission(v_m.restaurant_id, 'roles.assign') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_m.user_id = v_uid then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;
  if v_m.status not in ('new_staff', 'active') then
    raise exception 'staff in status % cannot be assigned a role', v_m.status using errcode = '22023';
  end if;

  select * into v_role from public.roles where id = p_role_id and archived_at is null;
  if v_role.id is null or v_role.is_new_staff
     or (v_role.restaurant_id is not null and v_role.restaurant_id <> v_m.restaurant_id) then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if (v_role.is_owner or exists (select 1 from public.roles r where r.id = v_m.role_id and r.is_owner))
     and not private.is_owner(v_m.restaurant_id) then
    raise exception 'only an owner can grant or change the Owner role' using errcode = '42501';
  end if;

  select coalesce(array_agg(permission_key), '{}') into v_role_perms
    from public.role_permissions where role_id = v_role.id;
  if not v_role.is_owner and not private.holds_all_permissions(v_m.restaurant_id, v_role_perms) then
    raise exception 'you cannot assign a role with permissions you do not hold' using errcode = '42501';
  end if;

  select m.branch_scope into v_caller_scope from public.memberships m
   where m.user_id = v_uid and m.restaurant_id = v_m.restaurant_id and m.status = 'active';
  if p_branch_scope = 'all' then
    if v_caller_scope <> 'all' then
      raise exception 'you cannot grant access to all branches' using errcode = '42501';
    end if;
  else
    if coalesce(cardinality(p_branch_ids), 0) = 0 then
      raise exception 'select at least one branch' using errcode = '22023';
    end if;
    foreach v_branch in array p_branch_ids loop
      if not exists (select 1 from public.branches b where b.id = v_branch and b.restaurant_id = v_m.restaurant_id)
         or not private.has_permission(v_m.restaurant_id, 'roles.assign', v_branch) then
        raise exception 'branch % is not available to you', v_branch using errcode = '42501';
      end if;
    end loop;
  end if;

  select jsonb_build_object('role_id', v_m.role_id, 'status', v_m.status, 'branch_scope', v_m.branch_scope,
           'branch_ids', coalesce((select jsonb_agg(branch_id) from public.membership_branches
                                    where membership_id = v_m.id), '[]'::jsonb))
    into v_before;

  delete from public.membership_branches where membership_id = v_m.id;
  update public.memberships
     set role_id = v_role.id, status = 'active', branch_scope = p_branch_scope
   where id = v_m.id;
  if p_branch_scope = 'selected' then
    insert into public.membership_branches (membership_id, branch_id, restaurant_id)
    select v_m.id, b, v_m.restaurant_id from unnest(p_branch_ids) as b group by b;
  end if;

  perform private.write_audit(v_m.restaurant_id, 'staff.role_assigned', 'membership', v_m.id, v_before,
    jsonb_build_object('role_id', v_role.id, 'role_key', v_role.key, 'status', 'active',
                       'branch_scope', p_branch_scope, 'branch_ids', to_jsonb(coalesce(p_branch_ids, '{}'))));
end;
$$;

-- Dev-only: read the outbox (OTP codes, invitation links). Disabled unless the environment's
-- seed sets private.app_settings('dev_outbox_enabled') = true. Never enabled in production.
create or replace function public.dev_list_outbox(p_limit integer default 50)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select (value)::text::boolean from private.app_settings where key = 'dev_outbox_enabled'), false) is not true then
    raise exception 'dev outbox is disabled in this environment' using errcode = '42501';
  end if;
  return query
    select jsonb_build_object('id', o.id, 'channel', o.channel, 'to', o.to_phone_e164,
                              'template', o.template, 'payload', o.payload, 'created_at', o.created_at)
      from private.message_outbox o
     order by o.created_at desc
     limit least(greatest(p_limit, 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
alter table public.staff_invitations enable row level security;
alter table public.staff_invitations force row level security;
alter table public.restaurant_notifications enable row level security;
alter table public.restaurant_notifications force row level security;

revoke all on public.staff_invitations, public.restaurant_notifications from anon, authenticated;
-- token_hash is deliberately not selectable.
grant select (id, restaurant_id, membership_id, full_name, phone_e164, status, expires_at, opened_at,
              consumed_at, consumed_by, cancelled_at, created_by, created_at, updated_at)
  on public.staff_invitations to authenticated;
grant select on public.restaurant_notifications to authenticated;

create policy staff_invitations_select on public.staff_invitations
  for select to authenticated
  using ((select private.has_permission(restaurant_id, 'staff.manage')));

create policy restaurant_notifications_select on public.restaurant_notifications
  for select to authenticated
  using ((select private.has_permission(restaurant_id, required_permission, branch_id)));

grant execute on function public.invite_staff(uuid, text, text, uuid) to authenticated;
grant execute on function public.resend_staff_invitation(uuid) to authenticated;
grant execute on function public.cancel_staff_invitation(uuid) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
grant execute on function public.open_invitation(text) to service_role;
grant execute on function public.accept_staff_invitation(text) to authenticated;
grant execute on function public.complete_staff_verification(uuid, text) to authenticated;
grant execute on function public.assign_staff_role(uuid, uuid, public.branch_scope, uuid[]) to authenticated;
grant execute on function public.dev_list_outbox(integer) to service_role;
