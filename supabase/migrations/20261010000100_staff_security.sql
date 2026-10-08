-- Phase 3: staff security — trusted devices, PIN unlock of parked sessions, staff switcher,
-- re-authentication, forgot-PIN, logout everywhere, and management of staff accounts.
--
-- Design (decision P3-Q5): a PIN never creates a session from nothing. The first login on a
-- device is mobile + OTP, which marks the device trusted. When a person locks the screen or
-- switches staff, the app parks their Supabase refresh token server-side (encrypted by the
-- app, stored here, unreadable by clients). PIN unlock is verified here and only then does the
-- server resume the parked session. Logging out everywhere deletes the Auth sessions, so any
-- parked token stops working and OTP is required again.

-- ---------------------------------------------------------------------------
-- Re-authentication (decision P3-Q6): a fresh OTP within the last N seconds, read from the
-- Supabase JWT's amr claim.
-- ---------------------------------------------------------------------------
create or replace function private.recent_otp(p_seconds integer default 600)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) a
     where a ->> 'method' = 'otp'
       and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - p_seconds
  );
$$;

create or replace function private.require_recent_otp()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.recent_otp(600) then
    raise exception 'reauthentication required: confirm with a new code sent to your mobile'
      using errcode = '42501', hint = 'REAUTH_REQUIRED';
  end if;
end;
$$;

create or replace function private.revoke_user_sessions(p_user_id uuid, p_keep_session uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id and (p_keep_session is null or id <> p_keep_session);
$$;

-- ---------------------------------------------------------------------------
-- Trusted devices and parked sessions
-- ---------------------------------------------------------------------------
create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null,
  label text,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  trusted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  unique (token_hash, user_id)
);
create index user_devices_user_idx on public.user_devices (user_id, last_seen_at desc);

create table private.device_sessions (
  device_id uuid not null references public.user_devices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  refresh_token_ciphertext text not null,
  parked_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

alter table public.user_devices enable row level security;
alter table public.user_devices force row level security;
revoke all on public.user_devices from anon, authenticated;
grant select (id, user_id, label, user_agent, first_seen_at, last_seen_at, trusted_at, revoked_at)
  on public.user_devices to authenticated;

-- Management of a person (devices, PIN, phone): staff.manage in a restaurant they belong to.
create or replace function private.can_manage_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m
                  where m.user_id = p_user_id and m.status not in ('cancelled', 'removed', 'expired')
                    and private.has_permission(m.restaurant_id, 'staff.manage'));
$$;
grant execute on function private.can_manage_user(uuid) to authenticated;

create policy user_devices_select on public.user_devices for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can_manage_user(user_id)));

-- Called right after an OTP login on this browser: remembers the device as trusted.
create or replace function public.register_trusted_device(p_device_token text, p_label text default null,
                                                         p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new boolean;
begin
  if v_uid is null or not private.recent_otp(600) then
    raise exception 'a device can only be trusted right after a code login' using errcode = '42501';
  end if;
  if p_device_token is null or length(p_device_token) < 32 then
    raise exception 'invalid device token' using errcode = '22023';
  end if;
  v_new := not exists (select 1 from public.user_devices
                        where token_hash = private.hash_token(p_device_token) and user_id = v_uid);
  insert into public.user_devices (user_id, token_hash, label, user_agent, trusted_at)
  values (v_uid, private.hash_token(p_device_token), left(p_label, 80), left(p_user_agent, 300), now())
  on conflict (token_hash, user_id) do update
    set last_seen_at = now(), user_agent = excluded.user_agent,
        trusted_at = coalesce(public.user_devices.trusted_at, now()),
        revoked_at = null, revoked_by = null
  returning id into v_id;
  perform private.write_audit(null, case when v_new then 'auth.new_device' else 'auth.device_seen' end,
                              'device', v_id, null, jsonb_build_object('user_agent', left(p_user_agent, 300)));
  return v_id;
end;
$$;

create or replace function private.trusted_device(p_device_token text, p_user_id uuid)
returns public.user_devices
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.user_devices
   where token_hash = private.hash_token(p_device_token) and user_id = p_user_id
     and trusted_at is not null and revoked_at is null;
$$;

-- Server-only: park the current session of a person on a trusted device (lock / switch user).
create or replace function public.park_device_session(p_device_token text, p_user_id uuid, p_ciphertext text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.user_devices := private.trusted_device(p_device_token, p_user_id);
begin
  if v_device.id is null then
    raise exception 'device is not trusted for this person' using errcode = '42501';
  end if;
  insert into private.device_sessions (device_id, user_id, refresh_token_ciphertext)
  values (v_device.id, p_user_id, p_ciphertext)
  on conflict (device_id, user_id) do update
    set refresh_token_ciphertext = excluded.refresh_token_ciphertext, parked_at = now();
  perform private.write_audit(null, 'auth.session_locked', 'device', v_device.id, null,
                              jsonb_build_object('user_id', p_user_id));
end;
$$;

-- Server-only: the staff switcher list for this device (names only).
create or replace function public.list_parked_sessions(p_device_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', d.user_id, 'full_name', p.full_name,
                                               'phone_masked', private.mask_phone(p.phone_e164))
                            order by ds.parked_at desc), '[]'::jsonb)
    from private.device_sessions ds
    join public.user_devices d on d.id = ds.device_id
    join public.profiles p on p.id = d.user_id
   where d.token_hash = private.hash_token(p_device_token) and d.trusted_at is not null and d.revoked_at is null
     and ds.parked_at > now() - interval '30 days';
$$;

-- Server-only: verify device + PIN with lockout. On success returns the parked ciphertext
-- (and removes it — the session moves back into the browser).
create or replace function public.pin_unlock(p_device_token text, p_user_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.user_devices := private.trusted_device(p_device_token, p_user_id);
  v_cred private.staff_credentials;
  v_cipher text;
begin
  if v_device.id is null then
    return jsonb_build_object('ok', false, 'reason', 'device_not_trusted');
  end if;
  select * into v_cred from private.staff_credentials where user_id = p_user_id for update;
  if v_cred.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_cred.locked_until);
  end if;
  if p_pin is null or extensions.crypt(p_pin, v_cred.pin_hash) <> v_cred.pin_hash then
    update private.staff_credentials
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end,
           failed_attempts_reset_at = now()
     where user_id = p_user_id;
    perform private.write_audit(null, 'auth.pin_failed', 'device', v_device.id, null,
                                jsonb_build_object('user_id', p_user_id, 'attempt', v_cred.failed_attempts + 1));
    return jsonb_build_object('ok', false,
      'reason', case when v_cred.failed_attempts + 1 >= 5 then 'locked' else 'wrong_pin' end,
      'attempts_left', greatest(0, 4 - v_cred.failed_attempts));
  end if;
  update private.staff_credentials set failed_attempts = 0, locked_until = null where user_id = p_user_id;
  delete from private.device_sessions where device_id = v_device.id and user_id = p_user_id
  returning refresh_token_ciphertext into v_cipher;
  update public.user_devices set last_seen_at = now() where id = v_device.id;
  perform private.write_audit(null, 'auth.pin_unlock', 'device', v_device.id, null,
                              jsonb_build_object('user_id', p_user_id));
  if v_cipher is null then
    return jsonb_build_object('ok', false, 'reason', 'no_parked_session');
  end if;
  return jsonb_build_object('ok', true, 'ciphertext', v_cipher);
end;
$$;

alter table private.staff_credentials add column failed_attempts_reset_at timestamptz;

create or replace function public.revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.user_devices;
begin
  select * into v_device from public.user_devices where id = p_device_id;
  if v_device.id is null or not (v_device.user_id = auth.uid() or private.can_manage_user(v_device.user_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.user_devices set revoked_at = now(), revoked_by = auth.uid() where id = p_device_id;
  delete from private.device_sessions where device_id = p_device_id;
  perform private.write_audit(null, 'auth.device_revoked', 'device', p_device_id, null,
                              jsonb_build_object('user_id', v_device.user_id));
end;
$$;

-- "Logout all devices": every Auth session (including parked ones) ends; devices untrusted.
create or replace function public.logout_all_devices()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from private.device_sessions where user_id = v_uid;
  update public.user_devices set revoked_at = now(), revoked_by = v_uid where user_id = v_uid and revoked_at is null;
  perform private.revoke_user_sessions(v_uid);
  perform private.write_audit(null, 'auth.logout_all_devices', 'user', v_uid);
end;
$$;

-- Forgot PIN / set PIN: needs a fresh OTP. Other sessions are revoked (spec §4).
create or replace function public.set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  if p_pin is null or p_pin !~ '^\d{6}$' then
    raise exception 'PIN must be exactly 6 digits' using errcode = '22023';
  end if;
  if private.is_weak_pin(p_pin) then
    raise exception 'choose a less predictable PIN' using errcode = '22023';
  end if;
  insert into private.staff_credentials (user_id, pin_hash)
  values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, pin_set_at = now(), updated_at = now();
  delete from private.device_sessions where user_id = v_uid;
  perform private.revoke_user_sessions(v_uid, nullif((select auth.jwt()) ->> 'session_id', '')::uuid);
  perform private.write_audit(null, 'auth.pin_changed', 'user', v_uid);
end;
$$;

-- Server-friendly audit of sign-ins (actor = the signed-in user).
create or replace function public.record_auth_event(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_action not in ('auth.login_otp', 'auth.login_password', 'auth.logout', 'auth.reauthenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.write_audit(null, p_action, 'user', auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff account management (spec §4: lock, disable, remove; phone changes need management)
-- ---------------------------------------------------------------------------
create or replace function private.is_sensitive_membership(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m join public.roles r on r.id = m.role_id
                  where m.id = p_membership_id and (r.is_owner or r.key = 'admin'));
$$;

create or replace function public.set_staff_status(p_membership_id uuid, p_status public.membership_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if v_m.id is null or not private.has_permission(v_m.restaurant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_m.user_id = auth.uid() then
    raise exception 'you cannot change your own status' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled', 'locked', 'removed') then
    raise exception 'unsupported status' using errcode = '22023';
  end if;
  if v_m.status not in ('active', 'disabled', 'locked', 'new_staff') then
    raise exception 'staff in status % cannot be changed here', v_m.status using errcode = '22023';
  end if;
  if p_status = 'active' and v_m.status = 'new_staff' then
    raise exception 'assign a role to activate New Staff' using errcode = '22023';
  end if;
  if private.is_sensitive_membership(v_m.id) then
    if not private.is_owner(v_m.restaurant_id) then
      raise exception 'only an owner can change an owner or admin' using errcode = '42501';
    end if;
    perform private.require_recent_otp();
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  update public.memberships set status = p_status where id = v_m.id;
  perform private.write_audit(v_m.restaurant_id, 'staff.status_changed', 'membership', v_m.id,
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

-- Only possible for people who belong to no other restaurant (identity is global).
create or replace function private.require_single_restaurant_person(p_membership public.memberships)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.memberships m
              where m.user_id = p_membership.user_id and m.restaurant_id <> p_membership.restaurant_id
                and m.status not in ('cancelled', 'removed', 'expired')) then
    raise exception 'this person also works for another restaurant; ask GoMenu support' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.change_staff_phone(p_membership_id uuid, p_new_phone text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_old text;
  v_phone text := btrim(p_new_phone);
begin
  select * into v_m from public.memberships where id = p_membership_id for update;
  if v_m.id is null or v_m.user_id is null or not private.has_permission(v_m.restaurant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_m.user_id = auth.uid() or private.is_sensitive_membership(v_m.id) then
    raise exception 'owners and admins change their own number from their account' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  perform private.require_single_restaurant_person(v_m);
  if not private.is_e164(v_phone) then
    raise exception 'mobile number must be in E.164 format' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where phone = ltrim(v_phone, '+') and id <> v_m.user_id) then
    raise exception 'that number belongs to another account' using errcode = '23505';
  end if;
  select phone_e164 into v_old from public.profiles where id = v_m.user_id;
  -- Unconfirmed until the person verifies a code sent to the new number at next login.
  update auth.users set phone = ltrim(v_phone, '+'), phone_confirmed_at = null, updated_at = now()
   where id = v_m.user_id;
  update public.memberships set invited_phone_e164 = v_phone where id = v_m.id;
  delete from private.device_sessions where user_id = v_m.user_id;
  update public.user_devices set revoked_at = now(), revoked_by = auth.uid() where user_id = v_m.user_id and revoked_at is null;
  perform private.revoke_user_sessions(v_m.user_id);
  perform private.write_audit(v_m.restaurant_id, 'staff.phone_changed', 'membership', v_m.id,
    jsonb_build_object('phone', v_old), jsonb_build_object('phone', v_phone, 'reason', p_reason));
end;
$$;

create or replace function public.reset_staff_pin(p_membership_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if v_m.id is null or v_m.user_id is null or not private.has_permission(v_m.restaurant_id, 'staff.manage')
     or v_m.user_id = auth.uid() or private.is_sensitive_membership(v_m.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  perform private.require_single_restaurant_person(v_m);
  delete from private.staff_credentials where user_id = v_m.user_id;
  delete from private.device_sessions where user_id = v_m.user_id;
  perform private.revoke_user_sessions(v_m.user_id);
  perform private.write_audit(v_m.restaurant_id, 'staff.pin_reset', 'membership', v_m.id, null,
                              jsonb_build_object('reason', p_reason));
end;
$$;

-- Owner/Admin role changes need a fresh OTP (spec §3: admin-role changes re-authenticate).
create or replace function private.guard_sensitive_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.role_id is distinct from old.role_id
     and not (current_setting('gomenu.platform_action', true) = 'on' and private.is_platform_staff())
     and exists (select 1 from public.roles r where r.id in (new.role_id, old.role_id) and (r.is_owner or r.key = 'admin')) then
    perform private.require_recent_otp();
  end if;
  return new;
end;
$$;

create trigger memberships_sensitive_role_guard
  before update of role_id on public.memberships
  for each row execute function private.guard_sensitive_role_change();

-- Security settings: auto-lock for shared devices (re-authentication required).
alter table public.restaurants add column staff_auto_lock_minutes integer not null default 5
  check (staff_auto_lock_minutes between 1 and 120);

create or replace function public.set_security_settings(p_restaurant_id uuid, p_auto_lock_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer;
begin
  if not private.has_permission(p_restaurant_id, 'settings.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.require_recent_otp();
  select staff_auto_lock_minutes into v_old from public.restaurants where id = p_restaurant_id;
  update public.restaurants set staff_auto_lock_minutes = p_auto_lock_minutes where id = p_restaurant_id;
  perform private.write_audit(p_restaurant_id, 'settings.security_changed', 'restaurant', p_restaurant_id,
    jsonb_build_object('staff_auto_lock_minutes', v_old), jsonb_build_object('staff_auto_lock_minutes', p_auto_lock_minutes));
end;
$$;

grant execute on function public.register_trusted_device(text, text, text) to authenticated;
grant execute on function public.park_device_session(text, uuid, text) to service_role;
grant execute on function public.list_parked_sessions(text) to service_role;
grant execute on function public.pin_unlock(text, uuid, text) to service_role;
grant execute on function public.revoke_device(uuid) to authenticated;
grant execute on function public.logout_all_devices() to authenticated;
grant execute on function public.set_my_pin(text) to authenticated;
grant execute on function public.record_auth_event(text) to authenticated;
grant execute on function public.set_staff_status(uuid, public.membership_status, text) to authenticated;
grant execute on function public.change_staff_phone(uuid, text, text) to authenticated;
grant execute on function public.reset_staff_pin(uuid, text) to authenticated;
grant execute on function public.set_security_settings(uuid, integer) to authenticated;
