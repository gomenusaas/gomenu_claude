-- Phase 4: a diner's favorites with names. Diners can't read restaurant tables, so this returns
-- only what the public website shows, and only for restaurants that are publicly available.
create or replace function public.my_favorites()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'restaurant_id', r.id, 'restaurant_name', r.name, 'slug', r.slug, 'logo_path', r.logo_path,
           'item_id', i.id, 'item_name', case when i.id is not null then private.reviewed_text(i.name, i.i18n_meta) end,
           'default_locale', r.default_locale)
           order by f.created_at desc), '[]'::jsonb)
    from public.diner_favorites f
    join public.restaurants r on r.id = f.restaurant_id
    left join public.menu_items i on i.id = f.item_id and i.is_active and i.archived_at is null
   where f.user_id = auth.uid()
     and private.restaurant_publicly_available(r.id)
     and exists (select 1 from public.website_settings w where w.restaurant_id = r.id and w.is_published)
     and (f.item_id is null or i.id is not null);
$$;

grant execute on function public.my_favorites() to authenticated;
