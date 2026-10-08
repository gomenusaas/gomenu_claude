-- Phase 3: AI menu import and translation with a credit ledger (decision P3-Q3:
-- 1 credit = 1 menu item imported, or 1 item translated into one language; 100 free per
-- restaurant once; extra packs bought by invoice). The AI provider (Claude, decision P3-Q2)
-- is called by the server; only the server (service role) can record AI results, so credits
-- always match what the AI actually produced.

insert into public.platform_settings (key, value, description) values
  ('ai_free_credits', '100', 'Free AI credits granted once to every new restaurant'),
  ('ai_credits_pack_size', '100', 'Credits in one purchasable pack');

insert into public.billing_prices (item_type, plan_id, currency, amount_minor)
values ('ai_credits_pack', null, 'USD', 500);

-- Credit-pack invoices have no plan.
alter table public.billing_invoices alter column plan_id drop not null;
alter table public.billing_invoices add column ai_credits integer check (ai_credits is null or ai_credits > 0);
alter table public.billing_invoices add constraint billing_invoices_plan_or_credits
  check ((kind = 'ai_credits') = (plan_id is null) and (ai_credits is null or kind = 'ai_credits'));

-- ---------------------------------------------------------------------------
-- Ledger (append-only; balance = sum of deltas)
-- ---------------------------------------------------------------------------
create type public.ai_credit_reason as enum ('free_grant', 'purchase', 'import', 'translation', 'refund', 'adjustment');

create table public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason public.ai_credit_reason not null,
  job_id uuid,
  invoice_id uuid references public.billing_invoices (id),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_credit_ledger_restaurant_idx on public.ai_credit_ledger (restaurant_id, created_at desc);
create unique index ai_credit_ledger_one_free_grant_uidx on public.ai_credit_ledger (restaurant_id) where reason = 'free_grant';
create unique index ai_credit_ledger_one_charge_per_job_uidx on public.ai_credit_ledger (job_id, reason) where job_id is not null;
create unique index ai_credit_ledger_one_purchase_per_invoice_uidx on public.ai_credit_ledger (invoice_id) where invoice_id is not null;

create trigger ai_credit_ledger_append_only before update or delete on public.ai_credit_ledger
  for each row execute function private.audit_is_append_only();

create or replace function private.ai_credit_balance(p_restaurant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer from public.ai_credit_ledger where restaurant_id = p_restaurant_id;
$$;

create or replace function private.grant_free_ai_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_credit_ledger (restaurant_id, delta, reason, note)
  values (new.id, private.setting_int('ai_free_credits'), 'free_grant', 'welcome credits')
  on conflict do nothing;
  return new;
end;
$$;
create trigger restaurants_free_ai_credits after insert on public.restaurants
  for each row execute function private.grant_free_ai_credits();

insert into public.ai_credit_ledger (restaurant_id, delta, reason, note)
select id, private.setting_int('ai_free_credits'), 'free_grant', 'welcome credits' from public.restaurants
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create type public.ai_job_kind as enum ('menu_import', 'translation');
create type public.ai_job_status as enum ('processing', 'needs_credits', 'needs_review', 'completed', 'failed', 'cancelled');

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  kind public.ai_job_kind not null,
  status public.ai_job_status not null default 'processing',
  source_path text check (source_path is null or source_path like restaurant_id::text || '/imports/%'),
  source_locale text,
  target_locale text,
  scope jsonb not null default '{}',
  result jsonb,
  item_count integer not null default 0,
  credits_charged integer not null default 0,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_jobs_restaurant_idx on public.ai_jobs (restaurant_id, created_at desc);
create trigger ai_jobs_set_updated_at before update on public.ai_jobs for each row execute function private.set_updated_at();
create trigger tenant_write_guard before insert or update or delete on public.ai_jobs
  for each row execute function private.guard_tenant_writable();

alter table public.ai_credit_ledger add constraint ai_credit_ledger_job_fk foreign key (job_id) references public.ai_jobs (id);

alter table public.ai_credit_ledger enable row level security;
alter table public.ai_credit_ledger force row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_jobs force row level security;
revoke all on public.ai_credit_ledger, public.ai_jobs from anon, authenticated;
grant select on public.ai_credit_ledger, public.ai_jobs to authenticated;

create policy ai_credit_ledger_select on public.ai_credit_ledger for select to authenticated
  using ((select private.has_permission(restaurant_id, 'menu.edit'))
         or (select private.has_permission(restaurant_id, 'billing.manage'))
         or (select private.has_platform_role(array['super_admin', 'admin', 'finance']::public.platform_role[])));
create policy ai_jobs_select on public.ai_jobs for select to authenticated
  using ((select private.has_permission(restaurant_id, 'menu.edit')));

create or replace function public.ai_credit_balance(p_restaurant_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission(p_restaurant_id, 'menu.edit') or private.has_permission(p_restaurant_id, 'billing.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.ai_credit_balance(p_restaurant_id);
end;
$$;

-- --- Import ---------------------------------------------------------------------------------
create or replace function public.start_menu_import(p_restaurant_id uuid, p_source_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_permission(p_restaurant_id, 'menu.edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not private.has_feature(p_restaurant_id, 'ai_menu_import') then
    raise exception 'AI menu creation is not included in your plan' using errcode = '23514';
  end if;
  if private.ai_credit_balance(p_restaurant_id) < 1 then
    raise exception 'you have no AI credits left; buy a credit pack first' using errcode = '23514';
  end if;
  insert into public.ai_jobs (restaurant_id, kind, source_path, created_by)
  values (p_restaurant_id, 'menu_import', p_source_path, auth.uid())
  returning id into v_id;
  perform private.write_audit(p_restaurant_id, 'ai.import_started', 'ai_job', v_id, null,
                              jsonb_build_object('source_path', p_source_path));
  return v_id;
end;
$$;

-- Charge credits for a job if the balance allows; returns whether it was charged.
create or replace function private.charge_ai_job(p_job_id uuid, p_reason public.ai_credit_reason)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
begin
  select * into v_job from public.ai_jobs where id = p_job_id for update;
  if v_job.item_count = 0 then
    return true;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_job.restaurant_id::text, 0));
  if private.ai_credit_balance(v_job.restaurant_id) < v_job.item_count then
    return false;
  end if;
  insert into public.ai_credit_ledger (restaurant_id, delta, reason, job_id, created_by)
  values (v_job.restaurant_id, -v_job.item_count, p_reason, v_job.id, v_job.created_by);
  update public.ai_jobs set credits_charged = v_job.item_count where id = v_job.id;
  return true;
end;
$$;

-- Server-only: record what the AI extracted. Credits = number of items extracted.
create or replace function public.complete_menu_import(p_job_id uuid, p_result jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
  v_count integer;
begin
  select * into v_job from public.ai_jobs where id = p_job_id and kind = 'menu_import' for update;
  if v_job.id is null or v_job.status <> 'processing' then
    raise exception 'job is not processing' using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(coalesce(c -> 'items', '[]'::jsonb))), 0)::integer into v_count
    from jsonb_array_elements(coalesce(p_result -> 'categories', '[]'::jsonb)) c;
  update public.ai_jobs set result = p_result, item_count = v_count where id = p_job_id;
  if private.charge_ai_job(p_job_id, 'import') then
    update public.ai_jobs set status = 'needs_review' where id = p_job_id;
  else
    update public.ai_jobs set status = 'needs_credits' where id = p_job_id;
  end if;
  return (select status::text from public.ai_jobs where id = p_job_id);
end;
$$;

create or replace function public.fail_ai_job(p_job_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_jobs set status = 'failed', error = left(p_error, 1000), completed_at = now()
   where id = p_job_id and status = 'processing';
$$;

-- After buying credits: unlock a job that was waiting for them.
create or replace function public.unlock_ai_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
begin
  select * into v_job from public.ai_jobs where id = p_job_id;
  if v_job.id is null or not private.has_permission(v_job.restaurant_id, 'menu.edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_job.status <> 'needs_credits' then
    raise exception 'job is not waiting for credits' using errcode = '22023';
  end if;
  if not private.charge_ai_job(p_job_id, case v_job.kind when 'menu_import' then 'import'::public.ai_credit_reason
                                                         else 'translation' end) then
    raise exception 'not enough AI credits (% needed)', v_job.item_count using errcode = '23514';
  end if;
  if v_job.kind = 'menu_import' then
    update public.ai_jobs set status = 'needs_review' where id = p_job_id;
  else
    perform private.write_translations(p_job_id);
  end if;
end;
$$;

-- The owner reviewed (and possibly edited) the extraction: create the menu (spec §8: review
-- before publishing). Payload: {"categories":[{"name":"...","items":[{"name","description","price_minor"}]}]}
create or replace function public.apply_menu_import(p_job_id uuid, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
  v_locale text;
  v_cat jsonb;
  v_item jsonb;
  v_cat_id uuid;
  v_sort integer;
  v_items integer := 0;
begin
  select * into v_job from public.ai_jobs where id = p_job_id for update;
  if v_job.id is null or not private.has_permission(v_job.restaurant_id, 'menu.edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_job.status <> 'needs_review' then
    raise exception 'this import is not ready to publish' using errcode = '22023';
  end if;
  select default_locale into v_locale from public.restaurants where id = v_job.restaurant_id;
  select coalesce(max(sort), 0) into v_sort from public.menu_categories where restaurant_id = v_job.restaurant_id;
  for v_cat in select * from jsonb_array_elements(coalesce(p_payload -> 'categories', '[]'::jsonb)) loop
    continue when coalesce(btrim(v_cat ->> 'name'), '') = '' or jsonb_array_length(coalesce(v_cat -> 'items', '[]')) = 0;
    v_sort := v_sort + 10;
    insert into public.menu_categories (restaurant_id, name, sort, created_by, i18n_meta)
    values (v_job.restaurant_id, jsonb_build_object(v_locale, btrim(v_cat ->> 'name')), v_sort, auth.uid(),
            jsonb_build_object(v_locale, jsonb_build_object('source', 'ai_import', 'reviewed', true)))
    returning id into v_cat_id;
    for v_item in select * from jsonb_array_elements(v_cat -> 'items') loop
      continue when coalesce(btrim(v_item ->> 'name'), '') = '';
      insert into public.menu_items (restaurant_id, category_id, name, description, price_minor, sort, created_by, i18n_meta)
      values (v_job.restaurant_id, v_cat_id, jsonb_build_object(v_locale, btrim(v_item ->> 'name')),
              case when coalesce(btrim(v_item ->> 'description'), '') = '' then '{}'::jsonb
                   else jsonb_build_object(v_locale, btrim(v_item ->> 'description')) end,
              greatest(coalesce((v_item ->> 'price_minor')::bigint, 0), 0), v_items * 10, auth.uid(),
              jsonb_build_object(v_locale, jsonb_build_object('source', 'ai_import', 'reviewed', true)));
      v_items := v_items + 1;
    end loop;
  end loop;
  update public.ai_jobs set status = 'completed', completed_at = now() where id = p_job_id;
  perform private.write_audit(v_job.restaurant_id, 'ai.import_published', 'ai_job', v_job.id, null,
                              jsonb_build_object('items', v_items));
  return v_items;
end;
$$;

create or replace function public.cancel_ai_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
begin
  select * into v_job from public.ai_jobs where id = p_job_id;
  if v_job.id is null or not private.has_permission(v_job.restaurant_id, 'menu.edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.ai_jobs set status = 'cancelled', completed_at = now()
   where id = p_job_id and status in ('needs_credits', 'needs_review', 'failed');
end;
$$;

-- --- Translation ---------------------------------------------------------------------------
-- Scope: {"type":"menu"} | {"type":"category","id":...} | {"type":"item","id":...}
create or replace function private.translation_source(p_restaurant_id uuid, p_scope jsonb)
returns setof public.menu_items
language sql
stable
security definer
set search_path = ''
as $$
  select i.* from public.menu_items i
   where i.restaurant_id = p_restaurant_id and i.archived_at is null
     and case p_scope ->> 'type'
           when 'item' then i.id = (p_scope ->> 'id')::uuid
           when 'category' then i.category_id = (p_scope ->> 'id')::uuid
           else true end;
$$;

-- Returns the job id and the source texts the server must send to the AI.
create or replace function public.start_translation(p_restaurant_id uuid, p_target_locale text, p_scope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_source text;
  v_count integer;
  v_payload jsonb;
begin
  if not private.has_permission(p_restaurant_id, 'menu.edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurant_languages where restaurant_id = p_restaurant_id and locale = p_target_locale) then
    raise exception 'activate this language for your restaurant first' using errcode = '22023';
  end if;
  select default_locale into v_source from public.restaurants where id = p_restaurant_id;
  if v_source = p_target_locale then
    raise exception 'choose a language other than your default' using errcode = '22023';
  end if;
  select count(*) into v_count from private.translation_source(p_restaurant_id, p_scope);
  if v_count = 0 then
    raise exception 'nothing to translate' using errcode = '22023';
  end if;
  if private.ai_credit_balance(p_restaurant_id) < v_count then
    raise exception 'not enough AI credits: % needed, % available', v_count, private.ai_credit_balance(p_restaurant_id)
      using errcode = '23514';
  end if;

  -- Everything the AI needs, keyed by stable ids. Categories/variants/options ride along free.
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name ->> v_source,
                                                   'description', i.description ->> v_source)), '[]'::jsonb),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name ->> v_source)), '[]'::jsonb)
                     from public.menu_categories c
                    where c.id in (select category_id from private.translation_source(p_restaurant_id, p_scope))),
    'variants', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name ->> v_source)), '[]'::jsonb)
                   from public.menu_item_variants v
                  where v.item_id in (select id from private.translation_source(p_restaurant_id, p_scope)) and v.archived_at is null),
    'option_groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name ->> v_source)), '[]'::jsonb)
                        from public.menu_option_groups g
                       where g.item_id in (select id from private.translation_source(p_restaurant_id, p_scope)) and g.archived_at is null),
    'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name ->> v_source)), '[]'::jsonb)
                  from public.menu_options o join public.menu_option_groups g on g.id = o.group_id
                 where g.item_id in (select id from private.translation_source(p_restaurant_id, p_scope)) and o.archived_at is null))
    into v_payload
    from private.translation_source(p_restaurant_id, p_scope) i;

  insert into public.ai_jobs (restaurant_id, kind, source_locale, target_locale, scope, item_count, created_by, result)
  values (p_restaurant_id, 'translation', v_source, p_target_locale, p_scope, v_count, auth.uid(),
          jsonb_build_object('source', v_payload))
  returning id into v_id;
  return jsonb_build_object('job_id', v_id, 'source_locale', v_source, 'target_locale', p_target_locale,
                            'item_count', v_count, 'source', v_payload);
end;
$$;

-- Writes AI translations as drafts (reviewed = false) for every entity in the job's result.
create or replace function private.write_translations(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
  v_t jsonb;
  v_meta jsonb;
  v_loc text;
begin
  select * into v_job from public.ai_jobs where id = p_job_id;
  v_loc := v_job.target_locale;
  v_meta := jsonb_build_object(v_loc, jsonb_build_object('source', 'ai', 'reviewed', false, 'job_id', v_job.id));
  for v_t in select * from jsonb_array_elements(coalesce(v_job.result -> 'translated' -> 'items', '[]')) loop
    update public.menu_items
       set name = name || jsonb_build_object(v_loc, v_t ->> 'name'),
           description = case when coalesce(v_t ->> 'description', '') = '' then description
                              else description || jsonb_build_object(v_loc, v_t ->> 'description') end,
           i18n_meta = i18n_meta || v_meta
     where id = (v_t ->> 'id')::uuid and restaurant_id = v_job.restaurant_id and coalesce(v_t ->> 'name', '') <> '';
  end loop;
  for v_t in select * from jsonb_array_elements(coalesce(v_job.result -> 'translated' -> 'categories', '[]')) loop
    update public.menu_categories set name = name || jsonb_build_object(v_loc, v_t ->> 'name'), i18n_meta = i18n_meta || v_meta
     where id = (v_t ->> 'id')::uuid and restaurant_id = v_job.restaurant_id and coalesce(v_t ->> 'name', '') <> '';
  end loop;
  for v_t in select * from jsonb_array_elements(coalesce(v_job.result -> 'translated' -> 'variants', '[]')) loop
    update public.menu_item_variants set name = name || jsonb_build_object(v_loc, v_t ->> 'name'), i18n_meta = i18n_meta || v_meta
     where id = (v_t ->> 'id')::uuid and restaurant_id = v_job.restaurant_id and coalesce(v_t ->> 'name', '') <> '';
  end loop;
  for v_t in select * from jsonb_array_elements(coalesce(v_job.result -> 'translated' -> 'option_groups', '[]')) loop
    update public.menu_option_groups set name = name || jsonb_build_object(v_loc, v_t ->> 'name'), i18n_meta = i18n_meta || v_meta
     where id = (v_t ->> 'id')::uuid and restaurant_id = v_job.restaurant_id and coalesce(v_t ->> 'name', '') <> '';
  end loop;
  for v_t in select * from jsonb_array_elements(coalesce(v_job.result -> 'translated' -> 'options', '[]')) loop
    update public.menu_options set name = name || jsonb_build_object(v_loc, v_t ->> 'name'), i18n_meta = i18n_meta || v_meta
     where id = (v_t ->> 'id')::uuid and restaurant_id = v_job.restaurant_id and coalesce(v_t ->> 'name', '') <> '';
  end loop;
  update public.ai_jobs set status = 'completed', completed_at = now() where id = p_job_id;
  perform private.write_audit(v_job.restaurant_id, 'ai.translation_applied', 'ai_job', v_job.id, null,
    jsonb_build_object('locale', v_loc, 'items', v_job.item_count));
end;
$$;

-- Server-only: record the AI translation, charge credits, write drafts.
create or replace function public.complete_translation(p_job_id uuid, p_translated jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs;
begin
  select * into v_job from public.ai_jobs where id = p_job_id and kind = 'translation' for update;
  if v_job.id is null or v_job.status <> 'processing' then
    raise exception 'job is not processing' using errcode = '22023';
  end if;
  update public.ai_jobs set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('translated', p_translated)
   where id = p_job_id;
  if private.charge_ai_job(p_job_id, 'translation') then
    perform private.write_translations(p_job_id);
  else
    update public.ai_jobs set status = 'needs_credits' where id = p_job_id;
  end if;
  return (select status::text from public.ai_jobs where id = p_job_id);
end;
$$;

-- A person confirms an AI (or any) translation after reading it.
create or replace function public.mark_translation_reviewed(p_entity text, p_id uuid, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant uuid;
begin
  if p_entity not in ('menu_items', 'menu_categories', 'menu_item_variants', 'menu_option_groups', 'menu_options') then
    raise exception 'unknown entity' using errcode = '22023';
  end if;
  execute format('select restaurant_id from public.%I where id = $1', p_entity) into v_restaurant using p_id;
  if v_restaurant is null or not private.has_permission(v_restaurant, 'menu.edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  execute format($f$update public.%I set i18n_meta = jsonb_set(i18n_meta, array[$2, 'reviewed'], 'true'::jsonb, true)
                    where id = $1 and i18n_meta ? $2$f$, p_entity) using p_id, p_locale;
end;
$$;

-- --- Buying credits ---------------------------------------------------------------------------
create or replace function public.buy_ai_credits(p_restaurant_id uuid, p_packs integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit bigint := private.current_price('ai_credits_pack', null);
  v_size integer := private.setting_int('ai_credits_pack_size');
  v_id uuid;
begin
  if not private.has_permission(p_restaurant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_packs is null or p_packs < 1 or p_packs > 50 then
    raise exception 'choose between 1 and 50 packs' using errcode = '22023';
  end if;
  v_id := private.issue_invoice(p_restaurant_id, 'ai_credits', null, 0, 0, 0,
    jsonb_build_array(jsonb_build_object('description', format('AI credits (%s per pack)', v_size),
                                         'quantity', p_packs, 'unit_amount_minor', v_unit, 'amount_minor', v_unit * p_packs)),
    v_unit * p_packs, now() + make_interval(days => private.setting_int('invoice_due_days')));
  update public.billing_invoices set ai_credits = v_size * p_packs where id = v_id;
  return v_id;
end;
$$;

-- apply_paid_invoice learns the ai_credits kind (everything else unchanged).
create or replace function private.apply_paid_invoice(p_invoice_id uuid, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.billing_invoices;
  v_r public.restaurants;
  v_start timestamptz;
  v_future_end timestamptz;
  v_last public.subscription_periods;
  v_cur public.subscription_periods;
  v_new_id uuid;
begin
  select * into v_inv from public.billing_invoices where id = p_invoice_id for update;
  if v_inv.status <> 'open' then
    raise exception 'invoice % is %', v_inv.number, v_inv.status using errcode = '22023';
  end if;
  select * into v_r from public.restaurants where id = v_inv.restaurant_id for update;

  if v_inv.kind = 'ai_credits' then
    if v_inv.ai_credits is null then
      raise exception 'credit invoice % has no credit quantity', v_inv.number using errcode = '22023';
    end if;
    insert into public.ai_credit_ledger (restaurant_id, delta, reason, invoice_id, created_by, note)
    values (v_inv.restaurant_id, v_inv.ai_credits, 'purchase', v_inv.id, auth.uid(), v_inv.number);
  elsif v_inv.kind = 'new_period' then
    select max(ends_at) into v_future_end from public.subscription_periods
     where restaurant_id = v_inv.restaurant_id and ends_at > p_now;
    v_last := private.latest_period(v_inv.restaurant_id, p_now);
    v_start := case
      when v_future_end is not null then v_future_end
      when v_last.kind = 'paid' and v_r.status in ('past_due', 'grace') then v_last.ends_at
      else p_now
    end;
    insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, extra_branches,
                                             currency, plan_amount_minor, branch_unit_amount_minor, invoice_id, created_by)
    values (v_inv.restaurant_id, 'paid', v_inv.plan_id, v_start, v_start + interval '1 year', v_inv.extra_branches,
            v_inv.currency, v_inv.plan_amount_minor, v_inv.branch_unit_amount_minor, v_inv.id, auth.uid());
  else
    v_cur := private.current_period(v_inv.restaurant_id, p_now);
    if v_cur.kind is distinct from 'paid' then
      raise exception 'no active paid period to apply invoice % to; void it instead', v_inv.number using errcode = '22023';
    end if;
    if v_cur.starts_at >= p_now then
      update public.subscription_periods
         set plan_id = v_inv.plan_id, plan_amount_minor = v_inv.plan_amount_minor,
             extra_branches = case when v_inv.kind = 'extra_branches' then extra_branches + v_inv.extra_branches
                                   else extra_branches end,
             invoice_id = v_inv.id
       where id = v_cur.id;
    else
      update public.subscription_periods set ends_at = p_now where id = v_cur.id;
      insert into public.subscription_periods (restaurant_id, kind, plan_id, starts_at, ends_at, extra_branches,
                                               currency, plan_amount_minor, branch_unit_amount_minor, invoice_id,
                                               created_by, note)
      values (v_inv.restaurant_id, 'paid', v_inv.plan_id, p_now, v_cur.ends_at,
              case when v_inv.kind = 'extra_branches' then v_cur.extra_branches + v_inv.extra_branches
                   else v_cur.extra_branches end,
              v_cur.currency, v_inv.plan_amount_minor, v_cur.branch_unit_amount_minor, v_inv.id, auth.uid(),
              v_inv.kind::text)
      returning id into v_new_id;
      update public.subscription_periods set superseded_by = v_new_id where id = v_cur.id;
    end if;
  end if;

  update public.billing_invoices set status = 'paid', paid_at = p_now where id = v_inv.id;
  perform private.write_audit(v_inv.restaurant_id, 'billing.invoice_paid', 'invoice', v_inv.id,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'paid', 'total_minor', v_inv.total_minor));
  perform private.run_billing_lifecycle(p_now, v_inv.restaurant_id);
end;
$$;

create or replace function public.platform_adjust_ai_credits(p_restaurant_id uuid, p_delta integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform(array['super_admin', 'admin']::public.platform_role[]);
  if p_delta = 0 or length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a non-zero amount and a reason are required' using errcode = '22023';
  end if;
  insert into public.ai_credit_ledger (restaurant_id, delta, reason, note, created_by)
  values (p_restaurant_id, p_delta, 'adjustment', btrim(p_reason), auth.uid());
  perform private.write_platform_audit('ai.credits_adjusted', 'restaurant', p_restaurant_id, p_restaurant_id, p_reason,
    null, jsonb_build_object('delta', p_delta));
end;
$$;

grant execute on function public.ai_credit_balance(uuid) to authenticated;
grant execute on function public.start_menu_import(uuid, text) to authenticated;
grant execute on function public.complete_menu_import(uuid, jsonb) to service_role;
grant execute on function public.fail_ai_job(uuid, text) to service_role;
grant execute on function public.unlock_ai_job(uuid) to authenticated;
grant execute on function public.apply_menu_import(uuid, jsonb) to authenticated;
grant execute on function public.cancel_ai_job(uuid) to authenticated;
grant execute on function public.start_translation(uuid, text, jsonb) to authenticated;
grant execute on function public.complete_translation(uuid, jsonb) to service_role;
grant execute on function public.mark_translation_reviewed(text, uuid, text) to authenticated;
grant execute on function public.buy_ai_credits(uuid, integer) to authenticated;
grant execute on function public.platform_adjust_ai_credits(uuid, integer, text) to authenticated;
