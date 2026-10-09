-- Phase 4: everything a visitor sees comes from ONE function. Visitors never get table access:
-- the function returns only published, public fields of a restaurant that is publicly available.
-- Unreviewed AI translations are left out (the default language is shown instead).

create or replace function private.reviewed_text(p_text jsonb, p_meta jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(p_text, '{}'::jsonb)) e
   where coalesce((p_meta -> e.key ->> 'reviewed')::boolean, true);
$$;

create or replace function private.public_site_payload(p_restaurant_id uuid, p_template text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'ok',
    'restaurant', jsonb_build_object(
      'id', r.id, 'name', r.name, 'slug', r.slug, 'tagline', r.tagline, 'description', r.description,
      'logo_path', r.logo_path, 'cover_path', r.cover_path, 'currency', r.currency,
      'default_locale', r.default_locale, 'timezone', r.timezone,
      'contact_phone', r.contact_phone_e164, 'contact_email', r.contact_email,
      'whatsapp', case when private.has_feature(r.id, 'social_whatsapp') and w.show_whatsapp then r.whatsapp_e164 end,
      'social_links', case when private.has_feature(r.id, 'social_whatsapp') then r.social_links else '{}'::jsonb end),
    'website', jsonb_build_object(
      'template', p_template, 'menu_style', w.menu_style, 'show_gallery', w.show_gallery,
      'show_branches', w.show_branches, 'show_hours', w.show_hours,
      'ordering_enabled', w.ordering_enabled and private.has_feature(r.id, 'ordering'),
      'seo_title', w.seo_title, 'seo_description', w.seo_description, 'is_published', w.is_published),
    'features', jsonb_build_object('sharing', private.has_feature(r.id, 'sharing')),
    'canonical_host', (select d.hostname from public.restaurant_domains d
                        where d.restaurant_id = r.id and d.is_primary and d.status = 'active'),
    'languages', (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name,
                                  'native_name', l.native_name, 'dir', l.dir) order by rl.sort, l.sort), '[]'::jsonb)
                    from public.restaurant_languages rl join public.platform_languages l on l.code = rl.locale
                   where rl.restaurant_id = r.id and l.is_enabled),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', b.id, 'name', b.name, 'address', b.address, 'phone', b.phone_e164, 'whatsapp', b.whatsapp_e164,
                   'latitude', b.latitude, 'longitude', b.longitude, 'maps_url', b.maps_url,
                   'is_open', private.branch_is_open(b.id),
                   'hours', (select coalesce(jsonb_agg(jsonb_build_object('day', h.day_of_week,
                               'opens', to_char(h.opens_at, 'HH24:MI'), 'closes', to_char(h.closes_at, 'HH24:MI'))
                               order by h.day_of_week, h.opens_at), '[]'::jsonb)
                               from public.branch_hours h where h.branch_id = b.id))
                   order by b.sort, b.created_at), '[]'::jsonb)
                   from public.branches b where b.restaurant_id = r.id and b.is_active and b.archived_at is null),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', c.id, 'name', private.reviewed_text(c.name, c.i18n_meta),
                     'description', private.reviewed_text(c.description, c.i18n_meta)) order by c.sort, c.created_at), '[]'::jsonb)
                     from public.menu_categories c
                    where c.restaurant_id = r.id and c.is_active and c.archived_at is null),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'category_id', i.category_id,
                'name', private.reviewed_text(i.name, i.i18n_meta),
                'description', private.reviewed_text(i.description, i.i18n_meta),
                'price_minor', i.price_minor, 'calories', i.calories, 'allergens', i.allergens,
                'dietary_tags', i.dietary_tags, 'spice_level', i.spice_level, 'is_available', i.is_available,
                'media', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'path', m.storage_path,
                            'poster_path', m.poster_path, 'width', m.width, 'height', m.height)
                            order by m.is_cover desc, m.sort), '[]'::jsonb)
                            from public.menu_item_media m where m.item_id = i.id),
                'variants', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id,
                               'name', private.reviewed_text(v.name, v.i18n_meta), 'price_minor', v.price_minor,
                               'is_default', v.is_default) order by v.sort), '[]'::jsonb)
                               from public.menu_item_variants v where v.item_id = i.id and v.archived_at is null),
                'option_groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id,
                                    'name', private.reviewed_text(g.name, g.i18n_meta),
                                    'min_select', g.min_select, 'max_select', g.max_select,
                                    'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id,
                                                  'name', private.reviewed_text(o.name, o.i18n_meta),
                                                  'price_delta_minor', o.price_delta_minor, 'is_available', o.is_available)
                                                  order by o.sort), '[]'::jsonb)
                                                  from public.menu_options o where o.group_id = g.id and o.archived_at is null))
                                    order by g.sort), '[]'::jsonb)
                                    from public.menu_option_groups g where g.item_id = i.id and g.archived_at is null))
                order by i.sort, i.created_at), '[]'::jsonb)
                from public.menu_items i
                join public.menu_categories c on c.id = i.category_id and c.is_active and c.archived_at is null
               where i.restaurant_id = r.id and i.is_active and i.archived_at is null),
    'branch_overrides', (select coalesce(jsonb_agg(jsonb_build_object('branch_id', o.branch_id, 'item_id', o.item_id,
                           'category_id', o.category_id, 'is_hidden', o.is_hidden, 'is_available', o.is_available)), '[]'::jsonb)
                           from public.branch_menu_overrides o where o.restaurant_id = r.id),
    'gallery', case when private.has_feature(r.id, 'gallery') and w.show_gallery then
                 (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'path', g.storage_path,
                    'poster_path', g.poster_path, 'caption', g.caption) order by g.sort), '[]'::jsonb)
                    from public.gallery_media g where g.restaurant_id = r.id and g.is_active)
               else '[]'::jsonb end,
    'promotions', case when private.has_feature(r.id, 'promotions') then
                    (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind,
                       'title', private.reviewed_text(p.title, p.i18n_meta), 'body', private.reviewed_text(p.body, p.i18n_meta),
                       'image_path', p.image_path, 'item_id', p.item_id, 'ends_at', p.ends_at,
                       'branch_ids', (select coalesce(jsonb_agg(pb.branch_id), '[]'::jsonb) from public.promotion_branches pb
                                       where pb.promotion_id = p.id)) order by p.sort, p.created_at), '[]'::jsonb)
                       from public.promotions p
                      where p.restaurant_id = r.id and p.is_active and p.archived_at is null
                        and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now()))
                  else '[]'::jsonb end,
    'frames', case when private.has_feature(r.id, 'frames') then
                (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'path', f.media_path,
                   'poster_path', f.poster_path, 'caption', private.reviewed_text(f.caption, f.i18n_meta),
                   'item_id', f.item_id, 'promotion_id', f.promotion_id, 'expires_at', f.expires_at,
                   'branch_ids', (select coalesce(jsonb_agg(fb.branch_id), '[]'::jsonb) from public.frame_branches fb
                                   where fb.frame_id = f.id)) order by f.published_at desc), '[]'::jsonb)
                   from public.frames f
                  where f.restaurant_id = r.id and f.archived_at is null and f.expires_at > now())
              else '[]'::jsonb end)
    from public.restaurants r
    join public.website_settings w on w.restaurant_id = r.id
   where r.id = p_restaurant_id;
$$;

-- Public: a published website of a publicly available restaurant. NULL = not found / not published.
create or replace function public.public_site(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published boolean;
begin
  select w.is_published into v_published from public.website_settings w where w.restaurant_id = p_restaurant_id;
  if not coalesce(v_published, false) then
    return null;
  end if;
  if not private.restaurant_publicly_available(p_restaurant_id) then
    -- spec: suspended means the site is offline. Say so without exposing anything else.
    return jsonb_build_object('status', 'unavailable',
      'restaurant', (select jsonb_build_object('name', name, 'slug', slug) from public.restaurants where id = p_restaurant_id));
  end if;
  if not private.has_feature(p_restaurant_id, 'website') then
    return null;
  end if;
  return private.public_site_payload(p_restaurant_id, private.effective_template(p_restaurant_id));
end;
$$;

-- Preview for staff with website.manage: works unpublished, and with any active template
-- ("restaurants preview templates with their own content").
create or replace function public.preview_site(p_restaurant_id uuid, p_template text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_restaurant_id, 'website.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_template is not null and not exists (select 1 from public.website_templates where key = p_template and is_active) then
    raise exception 'unknown template' using errcode = '22023';
  end if;
  return private.public_site_payload(p_restaurant_id, coalesce(p_template, private.effective_template(p_restaurant_id)))
         || jsonb_build_object('preview', true);
end;
$$;

-- QR scan: token → context. Records the scan. Unknown or inactive tokens resolve to nothing.
create or replace function public.resolve_qr(p_token text, p_session_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.qr_codes;
  v_table public.restaurant_tables;
begin
  select * into v_q from public.qr_codes where token = p_token and is_active and revoked_at is null;
  if v_q.id is null or not private.restaurant_publicly_available(v_q.restaurant_id) then
    return null;
  end if;
  if v_q.table_id is not null then
    select * into v_table from public.restaurant_tables where id = v_q.table_id and is_active and archived_at is null;
    if v_table.id is null then
      return null;
    end if;
  end if;
  perform public.track_event(v_q.restaurant_id, 'qr_scan', p_session_id, v_q.table_id, v_q.branch_id, v_q.id);
  return jsonb_build_object('restaurant_id', v_q.restaurant_id,
    'slug', (select slug from public.restaurants where id = v_q.restaurant_id),
    'canonical_host', (select d.hostname from public.restaurant_domains d
                        where d.restaurant_id = v_q.restaurant_id and d.is_primary and d.status = 'active'),
    'kind', v_q.kind, 'qr_code_id', v_q.id, 'branch_id', v_q.branch_id,
    'table_id', v_q.table_id, 'table_label', v_table.label);
end;
$$;

grant execute on function public.public_site(uuid) to anon, authenticated;
grant execute on function public.preview_site(uuid, text) to authenticated;
grant execute on function public.resolve_qr(text, text) to anon, authenticated;
