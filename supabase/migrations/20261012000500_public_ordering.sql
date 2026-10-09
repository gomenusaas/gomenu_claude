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
