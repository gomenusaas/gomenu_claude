-- Marketing site: the public sales/support contact (two platform settings, nothing else).
create or replace function public.get_public_contact()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('whatsapp', nullif(private.setting_text('sales_whatsapp'), ''),
                            'email', nullif(private.setting_text('sales_email'), ''));
$$;

grant execute on function public.get_public_contact() to anon, authenticated;
