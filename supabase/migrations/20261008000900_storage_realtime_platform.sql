-- Storage buckets, Realtime authorization and audited platform access.

-- ---------------------------------------------------------------------------
-- Storage: every object path starts with the restaurant id: {restaurant_id}/...
-- ---------------------------------------------------------------------------
create or replace function private.path_restaurant_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
grant execute on function private.path_restaurant_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('restaurant-public', 'restaurant-public', true, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']),
  ('restaurant-private', 'restaurant-private', false, 15728640, null)
on conflict (id) do nothing;

-- Public bucket: anyone can fetch by URL (website media); only authorised staff can list/write.
create policy restaurant_public_select on storage.objects
  for select to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.is_active_member(private.path_restaurant_id(name))));
create policy restaurant_public_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'restaurant-public'
    and (
      (select private.has_permission(private.path_restaurant_id(name), 'website.manage'))
      or (select private.has_permission(private.path_restaurant_id(name), 'menu.edit'))
      or (select private.has_permission(private.path_restaurant_id(name), 'gallery.manage'))
    )
  );
create policy restaurant_public_update on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.has_permission(private.path_restaurant_id(name), 'website.manage')))
  with check (bucket_id = 'restaurant-public'
              and (select private.has_permission(private.path_restaurant_id(name), 'website.manage')));
create policy restaurant_public_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-public'
         and (select private.has_permission(private.path_restaurant_id(name), 'website.manage')));

-- Private bucket: assigned members read, settings.manage writes.
create policy restaurant_private_select on storage.objects
  for select to authenticated
  using (bucket_id = 'restaurant-private'
         and (select private.is_active_member(private.path_restaurant_id(name))));
create policy restaurant_private_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-private'
              and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')));
create policy restaurant_private_update on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-private'
         and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')))
  with check (bucket_id = 'restaurant-private'
              and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')));
create policy restaurant_private_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-private'
         and (select private.has_permission(private.path_restaurant_id(name), 'settings.manage')));

-- ---------------------------------------------------------------------------
-- Realtime (spec §2: only where live sync matters).
-- Postgres Changes respect the table's RLS. Private broadcast channels use the topic
-- 'restaurant:{id}' or 'restaurant:{id}:branch:{branch_id}' and require active membership.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.restaurant_notifications;

create or replace function private.realtime_topic_allowed(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := regexp_match(
    p_topic,
    '^restaurant:([0-9a-f-]{36})(?::branch:([0-9a-f-]{36}))?$');
begin
  if v_parts is null then
    return false;
  end if;
  return private.is_active_member(v_parts[1]::uuid, v_parts[2]::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;
grant execute on function private.realtime_topic_allowed(text) to authenticated;

create policy restaurant_channels_receive on realtime.messages
  for select to authenticated
  using ((select private.realtime_topic_allowed(realtime.topic())));
create policy restaurant_channels_send on realtime.messages
  for insert to authenticated
  with check ((select private.realtime_topic_allowed(realtime.topic())));

-- ---------------------------------------------------------------------------
-- Platform access to tenant data (decision Q11): Super Admin only, MFA session (aal2),
-- reason required, and EVERY read is written to the platform audit log first.
-- Platform roles have no RLS access to tenant tables; this function is the only path.
-- ---------------------------------------------------------------------------
create or replace function public.platform_get_restaurant_overview(p_restaurant_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.has_platform_role(array['super_admin']::public.platform_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'a reason is required to access restaurant data' using errcode = '22023';
  end if;

  perform private.write_platform_audit('platform.tenant_read', 'restaurant', p_restaurant_id,
                                       p_restaurant_id, btrim(p_reason));

  select jsonb_build_object(
           'restaurant', to_jsonb(r),
           'branches', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at)
                                   from public.branches b where b.restaurant_id = r.id), '[]'::jsonb),
           'staff_by_status', coalesce((select jsonb_object_agg(status, n) from (
                                   select m.status, count(*) as n from public.memberships m
                                    where m.restaurant_id = r.id group by m.status) s), '{}'::jsonb))
    into v_result
    from public.restaurants r
   where r.id = p_restaurant_id;
  return v_result;
end;
$$;

grant execute on function public.platform_get_restaurant_overview(uuid, text) to authenticated;
