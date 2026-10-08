-- Phase 3: billing items for AI credit packs. (Separate migration: new enum values cannot be
-- used in the same transaction that adds them.)
alter type public.invoice_kind add value if not exists 'ai_credits';
alter type public.price_item add value if not exists 'ai_credits_pack';
