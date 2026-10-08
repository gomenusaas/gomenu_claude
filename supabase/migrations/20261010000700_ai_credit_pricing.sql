-- Phase 3: owners see the credit-pack price and size before buying (billing page).
create or replace function public.ai_credit_pack_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'size', private.setting_int('ai_credits_pack_size'),
    'amount_minor', private.current_price('ai_credits_pack', null),
    'currency', private.setting_text('billing_currency'));
$$;

grant execute on function public.ai_credit_pack_info() to authenticated;
