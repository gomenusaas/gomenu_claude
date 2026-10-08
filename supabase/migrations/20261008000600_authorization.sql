-- Authorization core: permission checks and RLS policies for every Phase 1 table.
--
-- Single rule for tenant data: private.has_permission(restaurant, permission, branch) is true
-- only when the caller has a membership in that restaurant that is
--   * status = 'active'                     (New Staff, invited, locked, disabled... => false)
--   * holding a role that is not New Staff  (belt and braces: guard trigger enforces it too)
--   * granted the permission by role or 'grant' override, and not 'deny' override
--   * in scope for the branch (scope 'all', or the branch is in membership_branches)
-- Policies call it through (select ...) so Postgres evaluates it once per statement.

create or replace function private.has_permission(
  p_restaurant_id uuid,
  p_permission text,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
     where m.user_id = (select auth.uid())
       and m.restaurant_id = p_restaurant_id
       and m.status = 'active'
       and not r.is_new_staff
       and r.archived_at is null
       and (
         exists (select 1 from public.role_permissions rp
                  where rp.role_id = m.role_id and rp.permission_key = p_permission)
         or exists (select 1 from public.membership_permission_overrides o
                     where o.membership_id = m.id and o.permission_key = p_permission
                       and o.effect = 'grant')
       )
       and not exists (select 1 from public.membership_permission_overrides o
                        where o.membership_id = m.id and o.permission_key = p_permission
                          and o.effect = 'deny')
       and (
         p_branch_id is null
         or m.branch_scope = 'all'
         or exists (select 1 from public.membership_branches mb
                     where mb.membership_id = m.id and mb.branch_id = p_branch_id)
       )
  );
$$;

-- Active (assigned) member of a restaurant, optionally scoped to a branch.
create or replace function private.is_active_member(
  p_restaurant_id uuid,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
     where m.user_id = (select auth.uid())
       and m.restaurant_id = p_restaurant_id
       and m.status = 'active'
       and not r.is_new_staff
       and (
         p_branch_id is null
         or m.branch_scope = 'all'
         or exists (select 1 from public.membership_branches mb
                     where mb.membership_id = m.id and mb.branch_id = p_branch_id)
       )
  );
$$;

-- Has at least one active membership anywhere (used for global reference data).
create or replace function private.has_any_active_membership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m join public.roles r on r.id = m.role_id
     where m.user_id = (select auth.uid()) and m.status = 'active' and not r.is_new_staff
  );
$$;

-- The caller holds every permission in the list (used to stop privilege escalation).
create or replace function private.holds_all_permissions(p_restaurant_id uuid, p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(private.has_permission(p_restaurant_id, p)), true)
    from unnest(p_permissions) as p;
$$;

create or replace function private.is_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m join public.roles r on r.id = m.role_id
     where m.user_id = (select auth.uid()) and m.restaurant_id = p_restaurant_id
       and m.status = 'active' and r.is_owner
  );
$$;

-- Platform role check. Super Admin additionally requires an MFA (aal2) session.
create or replace function private.has_platform_role(p_roles public.platform_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff ps
     where ps.user_id = (select auth.uid()) and ps.is_active and ps.role = any (p_roles)
       and (ps.role <> 'super_admin' or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2')
  );
$$;

-- A profile is visible to its owner and to staff managers of a restaurant the person belongs to.
create or replace function private.can_view_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1 from public.memberships m
         where m.user_id = p_user_id
           and private.has_permission(m.restaurant_id, 'staff.view')
      );
$$;

revoke all on function private.has_permission(uuid, text, uuid) from public;
revoke all on function private.is_active_member(uuid, uuid) from public;
revoke all on function private.has_any_active_membership() from public;
revoke all on function private.holds_all_permissions(uuid, text[]) from public;
revoke all on function private.is_owner(uuid) from public;
revoke all on function private.has_platform_role(public.platform_role[]) from public;
revoke all on function private.can_view_profile(uuid) from public;

-- RLS policies run as the querying role, which needs USAGE + EXECUTE on these helpers only.
grant usage on schema private to authenticated;
grant execute on function private.has_permission(uuid, text, uuid) to authenticated;
grant execute on function private.is_active_member(uuid, uuid) to authenticated;
grant execute on function private.has_any_active_membership() to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.has_platform_role(public.platform_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges (RLS still decides which rows)
-- Writes to memberships, roles, invitations, audit... happen only through RPCs.
-- ---------------------------------------------------------------------------
grant select on public.restaurants, public.branches, public.permissions, public.roles,
  public.role_permissions, public.memberships, public.membership_branches,
  public.membership_permission_overrides, public.audit_events, public.platform_staff,
  public.platform_audit_events
  to authenticated;

grant update (name, default_locale, invite_ttl_hours) on public.restaurants to authenticated;
grant insert (restaurant_id, name, address, phone_e164, is_active) on public.branches to authenticated;
grant update (name, address, phone_e164, is_active, archived_at) on public.branches to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select private.can_view_profile(id)));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- restaurants: active members read; settings.manage updates a few columns.
create policy restaurants_select on public.restaurants
  for select to authenticated
  using ((select private.is_active_member(id)));
create policy restaurants_update on public.restaurants
  for update to authenticated
  using ((select private.has_permission(id, 'settings.manage')))
  with check ((select private.has_permission(id, 'settings.manage')));

-- branches: members see the branches in their scope; branches.manage writes.
create policy branches_select on public.branches
  for select to authenticated
  using ((select private.is_active_member(restaurant_id, id)));
create policy branches_insert on public.branches
  for insert to authenticated
  with check ((select private.has_permission(restaurant_id, 'branches.manage')));
create policy branches_update on public.branches
  for update to authenticated
  using ((select private.has_permission(restaurant_id, 'branches.manage', id)))
  with check ((select private.has_permission(restaurant_id, 'branches.manage', id)));

-- permissions catalog: assigned staff only (New Staff and outsiders see nothing).
create policy permissions_select on public.permissions
  for select to authenticated
  using ((select private.has_any_active_membership()));

-- roles: system roles to assigned staff; custom roles to that restaurant's assigned staff.
create policy roles_select on public.roles
  for select to authenticated
  using (
    case when restaurant_id is null then (select private.has_any_active_membership())
         else (select private.is_active_member(restaurant_id)) end
  );

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id));  -- inherits roles RLS

-- memberships: staff.view sees the restaurant's staff; everyone sees their own ACTIVE row.
-- (New Staff read their pending status only through public.get_my_context().)
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    (select private.has_permission(restaurant_id, 'staff.view'))
    or (user_id = (select auth.uid()) and status = 'active')
  );

create policy membership_branches_select on public.membership_branches
  for select to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id)); -- inherits

create policy membership_permission_overrides_select on public.membership_permission_overrides
  for select to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id)); -- inherits

-- audit: audit.view only; nobody writes directly (private.write_audit is the only writer).
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (restaurant_id is not null and (select private.has_permission(restaurant_id, 'audit.view')));

-- platform tables: platform staff only. Platform roles get NO tenant-table access via RLS;
-- Super Admin reads tenant data only through audited RPCs (see platform migration).
create policy platform_staff_select on public.platform_staff
  for select to authenticated
  using (user_id = (select auth.uid())
         or (select private.has_platform_role(array['super_admin']::public.platform_role[])));
create policy platform_audit_events_select on public.platform_audit_events
  for select to authenticated
  using ((select private.has_platform_role(array['super_admin']::public.platform_role[])));
