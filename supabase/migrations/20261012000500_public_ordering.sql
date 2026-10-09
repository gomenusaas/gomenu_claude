-- Phase 5: what the checkout needs to know (no internal settings), and a diner's own orders.

/** Ordering options for visitors. NULL when this restaurant does not take online orders. */
create or replace function public.public_ordering(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'services', jsonb_build_object('table', s.service_table, 'car', s.service_car, 'pickup', s.service_pickup),
    'timing', jsonb_build_object('table', s.timing_table, 'car', s.timing_car, 'pickup', s.timing_pickup),
    'table_needs_confirmation', s.waiter_confirmation and s.assignment_mode <> 'none',
    'online_needs_confirmation', not s.auto_accept_online,
    'online_payment', private.online_payment_ready(r.id),
    'vat_rate_bp', s.vat_rate_bp,
    'prices_include_vat', s.prices_include_vat,
    'currency', r.currency)
    from public.restaurants r
    join public.website_settings w on w.restaurant_id = r.id
    join public.ordering_settings s on s.restaurant_id = r.id
   where r.id = p_restaurant_id and w.is_published and w.ordering_enabled
     and private.restaurant_publicly_available(r.id) and private.has_feature(r.id, 'ordering');
$$;

/** A signed-in diner's recent orders, everywhere (spec §12: past orders are historical). */
create or replace function public.my_orders(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('public_key', o.public_key, 'number', o.number, 'status', o.status,
                              'payment_status', o.payment_status, 'total_minor', o.total_minor, 'currency', o.currency,
                              'created_at', o.created_at, 'restaurant_name', r.name, 'slug', r.slug) as x
      from public.orders o join public.restaurants r on r.id = o.restaurant_id
     where o.customer_user_id = auth.uid() and auth.uid() is not null
     order by o.created_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100)) t;
$$;

grant execute on function public.public_ordering(uuid) to anon, authenticated;
grant execute on function public.my_orders(integer) to authenticated;

-- --- Staff screens ------------------------------------------------------------------------------

-- Waiters pick a table for waiter orders and the kitchen prints table names: order and kitchen
-- staff see their branches' tables (labels only; QR tokens stay with qr.manage).
create policy restaurant_tables_select_orders on public.restaurant_tables for select to authenticated
  using ((select private.has_permission(restaurant_id, 'orders.view', branch_id))
         or (select private.has_permission(restaurant_id, 'kitchen.access', branch_id)));

/** Mode B: the waiter responsible for a table. NULL clears it. */
create or replace function public.set_table_waiter(p_table_id uuid, p_waiter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.restaurant_tables;
begin
  select * into v_t from public.restaurant_tables where id = p_table_id and archived_at is null;
  if v_t.id is null or not private.has_permission(v_t.restaurant_id, 'orders.manage', v_t.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_waiter_id is not null and not exists (
       select 1 from public.memberships m where m.user_id = p_waiter_id and m.restaurant_id = v_t.restaurant_id
          and m.status = 'active' and (m.branch_scope = 'all' or exists (
            select 1 from public.membership_branches mb where mb.membership_id = m.id and mb.branch_id = v_t.branch_id))) then
    raise exception 'this person does not work in this branch' using errcode = '22023', hint = 'NOT_IN_BRANCH';
  end if;
  update public.restaurant_tables set assigned_waiter_id = p_waiter_id where id = v_t.id;
  perform private.write_audit(v_t.restaurant_id, 'table.waiter_assigned', 'table', v_t.id,
                              null, jsonb_build_object('waiter_id', p_waiter_id), v_t.branch_id);
end;
$$;

/** Who works in a branch and who is on shift, for assigning orders. Order staff only. */
create or replace function public.branch_order_staff(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b public.branches;
begin
  select * into v_b from public.branches where id = p_branch_id;
  if v_b.id is null or not private.has_permission(v_b.restaurant_id, 'orders.view', v_b.id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', m.user_id, 'name', coalesce(p.full_name, m.invited_name), 'role', r.name,
            'on_shift', private.on_shift(m.user_id, v_b.id)) order by coalesce(p.full_name, m.invited_name)), '[]'::jsonb)
            from public.memberships m
            join public.roles r on r.id = m.role_id
            left join public.profiles p on p.id = m.user_id
           where m.restaurant_id = v_b.restaurant_id and m.status = 'active' and not r.is_new_staff
             and (m.branch_scope = 'all' or exists (select 1 from public.membership_branches mb
                                                     where mb.membership_id = m.id and mb.branch_id = v_b.id))
             and (r.is_owner or exists (select 1 from public.role_permissions rp where rp.role_id = r.id
                                         and rp.permission_key in ('orders.confirm_table', 'orders.create_waiter', 'orders.manage'))));
end;
$$;

grant execute on function public.set_table_waiter(uuid, uuid) to authenticated;
grant execute on function public.branch_order_staff(uuid) to authenticated;
