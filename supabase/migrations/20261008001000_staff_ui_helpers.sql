-- Read-only helpers for the UI. They reveal only facts about the caller; they never grant
-- anything (authorization stays in RLS and the write RPCs).

-- Whether to ask for a NEW PIN or the person's EXISTING PIN during activation
-- (PINs are per person; someone already on another restaurant's team keeps theirs).
create or replace function public.my_pin_is_set()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.staff_credentials where user_id = auth.uid());
$$;

-- The caller's effective permissions in a restaurant (restaurant-wide), used to decide which
-- controls to show. Empty for New Staff and non-members.
create or replace function public.my_permissions(p_restaurant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.key order by p.key), '{}')
    from public.permissions p
   where private.has_permission(p_restaurant_id, p.key);
$$;

grant execute on function public.my_pin_is_set() to authenticated;
grant execute on function public.my_permissions(uuid) to authenticated;
