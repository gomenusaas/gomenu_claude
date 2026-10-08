-- Profiles: one row per Supabase Auth identity (owners, staff, diners, platform staff).
-- Identity alone grants nothing: access always comes from memberships (see RBAC migration).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  -- Mirrors auth.users.phone (verified) in E.164 form. Never written by clients.
  phone_e164 text unique check (phone_e164 is null or private.is_e164(phone_e164)),
  -- Mirrors auth.users.email once confirmed. Never written by clients.
  email text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Keep profiles in sync with auth.users. Only verified phone/email are mirrored.
create or replace function private.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := case
    when new.phone is not null and new.phone <> '' and new.phone_confirmed_at is not null
      then '+' || ltrim(new.phone, '+')
  end;
  v_email text := case when new.email_confirmed_at is not null then new.email end;
begin
  insert into public.profiles (id, full_name, phone_e164, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), v_phone, v_email)
  on conflict (id) do update
    set phone_e164 = excluded.phone_e164,
        email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update of phone, phone_confirmed_at, email, email_confirmed_at, raw_user_meta_data
  on auth.users
  for each row execute function private.sync_profile_from_auth();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Clients may only change their own display name and locale. Phone/email come from Auth.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, locale) on public.profiles to authenticated;
