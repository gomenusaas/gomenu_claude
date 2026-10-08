-- GoMenu Phase 1 — foundation: schemas, extensions, shared helpers.
--
-- Conventions used by every later migration:
--   * public  : tables the app reads through the API. RLS is ENABLED and FORCED on every table.
--   * private : helper functions, secrets and delivery queues. Never exposed by PostgREST.
--   * Every SECURITY DEFINER function sets search_path = '' and fully qualifies names.
--   * Default privileges are revoked so nothing is reachable unless explicitly granted.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create extension if not exists pgcrypto with schema extensions;

-- Functions are NOT executable by anyone unless granted explicitly. Postgres grants EXECUTE
-- to PUBLIC by default, and Supabase adds per-schema defaults for anon/authenticated; both are
-- removed for functions created by the migration role. (Guarded by 010-schema-guardrails.)
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- updated_at maintenance
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- E.164 phone validation used by profiles and invitations.
create or replace function private.is_e164(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p ~ '^\+[1-9][0-9]{7,14}$';
$$;

-- Used in CHECK constraints, so writers need EXECUTE.
grant execute on function private.is_e164(text) to authenticated, service_role;

-- Request metadata captured into audit rows (PostgREST exposes headers as a GUC).
create or replace function private.request_header(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> lower(p_name);
$$;

-- Key/value platform settings that differ per environment (seeded per environment, never in
-- the base migrations). Only service_role and SECURITY DEFINER functions can read it.
create table private.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
