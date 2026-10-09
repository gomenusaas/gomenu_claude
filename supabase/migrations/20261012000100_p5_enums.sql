-- Phase 5 enum values (separate migration so they can be used by later ones).
alter type public.analytics_event_type add value if not exists 'add_to_cart';
alter type public.analytics_event_type add value if not exists 'checkout_started';
alter type public.analytics_event_type add value if not exists 'order_created';
alter type public.analytics_event_type add value if not exists 'payment_completed';
