-- Phase 4 enum values (separate migration: new enum values can't be used in the same transaction).
alter type public.invoice_kind add value if not exists 'template';
