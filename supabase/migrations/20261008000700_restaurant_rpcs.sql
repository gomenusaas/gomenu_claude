-- Restaurant creation, post-login routing context and custom roles.
-- All writes to tenancy/RBAC tables go through these SECURITY DEFINER functions, which check
-- authorization explicitly and write the audit row in the same transaction.

-- Minimal owner sign-up (Phase 1): an authenticated user with a VERIFIED phone creates a
-- restaurant, its first branch and their Owner membership.
create or replace function public.create_restaurant(
  p_name text,
  p_slug text,
  p_branch_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant public.restaurants;
  v_branch_id uuid;
  v_membership_id uuid;
  v_owner_role uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_e164 is not null) then
    raise exception 'verify your mobile number before creating a restaurant' using errcode = '42501';
  end if;

  insert into public.restaurants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid)
  returning * into v_restaurant;

  insert into public.branches (restaurant_id, name)
  values (v_restaurant.id, coalesce(nullif(btrim(p_branch_name), ''), 'Main branch'))
  returning id into v_branch_id;

  select id into v_owner_role from public.roles where is_owner and is_system;

  insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, verified_at, activated_at)
  values (v_restaurant.id, v_uid, v_owner_role, 'active', 'all', now(), now())
  returning id into v_membership_id;

  perform private.write_audit(v_restaurant.id, 'restaurant.created', 'restaurant', v_restaurant.id,
                              null, to_jsonb(v_restaurant));
  perform private.write_audit(v_restaurant.id, 'branch.created', 'branch', v_branch_id,
                              null, jsonb_build_object('name', coalesce(nullif(btrim(p_branch_name), ''), 'Main branch')),
                              v_branch_id);
  perform private.write_audit(v_restaurant.id, 'membership.owner_created', 'membership', v_membership_id,
                              null, jsonb_build_object('role', 'owner', 'status', 'active'));
  return v_restaurant.id;
end;
$$;

-- Routing after login is decided here, not by frontend labels (spec §3).
-- Returns only what the caller is entitled to know about themselves.
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
  v_platform text;
  v_next text;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'next', 'login');
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'membership_id', m.id, 'restaurant_id', r.id, 'restaurant_name', r.name,
           'restaurant_slug', r.slug, 'role_key', ro.key, 'role_name', ro.name,
           'is_owner', ro.is_owner, 'branch_scope', m.branch_scope
         ) order by r.name), '[]'::jsonb)
    into v_active
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
    join public.roles ro on ro.id = m.role_id
   where m.user_id = v_uid and m.status = 'active' and not ro.is_new_staff;

  -- Pending staff learn only the restaurant name and their status.
  select coalesce(jsonb_agg(jsonb_build_object(
           'membership_id', m.id, 'restaurant_name', r.name, 'status', m.status
         ) order by r.name), '[]'::jsonb)
    into v_pending
    from public.memberships m
    join public.restaurants r on r.id = m.restaurant_id
   where m.user_id = v_uid and m.status in ('verification_pending', 'new_staff', 'locked', 'disabled');

  select role::text into v_platform from public.platform_staff where user_id = v_uid and is_active;

  v_next := case
    when jsonb_array_length(v_active) = 1 then 'restaurant'
    when jsonb_array_length(v_active) > 1 then 'choose_restaurant'
    when v_platform is not null then 'platform'
    when jsonb_array_length(v_pending) > 0 then 'pending'
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
    'active_memberships', v_active,
    'pending_memberships', v_pending,
    'next', v_next
  );
end;
$$;

-- Custom roles (Silver: unlimited roles). Callers can only grant permissions they hold
-- themselves, and never owner-only permissions.
create or replace function public.create_custom_role(
  p_restaurant_id uuid,
  p_key text,
  p_name text,
  p_permission_keys text[],
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_perms text[] := coalesce(p_permission_keys, '{}');
begin
  if not private.has_permission(p_restaurant_id, 'roles.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_perms) k left join public.permissions p on p.key = k
              where p.key is null or p.owner_only) then
    raise exception 'unknown or owner-only permission requested' using errcode = '22023';
  end if;
  if not private.holds_all_permissions(p_restaurant_id, v_perms) then
    raise exception 'you cannot grant permissions you do not hold' using errcode = '42501';
  end if;

  insert into public.roles (restaurant_id, key, name, description, is_system)
  values (p_restaurant_id, p_key, btrim(p_name), p_description, false)
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select v_role_id, k from unnest(v_perms) as k group by k;

  perform private.write_audit(p_restaurant_id, 'role.created', 'role', v_role_id, null,
    jsonb_build_object('key', p_key, 'name', p_name, 'permissions', to_jsonb(v_perms)));
  return v_role_id;
end;
$$;

grant execute on function public.create_restaurant(text, text, text) to authenticated;
grant execute on function public.get_my_context() to authenticated;
grant execute on function public.create_custom_role(uuid, text, text, text[], text) to authenticated;
