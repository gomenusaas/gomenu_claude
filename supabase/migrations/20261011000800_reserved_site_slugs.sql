-- Phase 4 adds top-level routes next to /{slug}: they can never become restaurant addresses.
insert into public.reserved_slugs (slug) values ('me'), ('q'), ('site'), ('preview'), ('item'), ('api'), ('verify'), ('lock'), ('reauth'), ('unavailable')
on conflict do nothing;
