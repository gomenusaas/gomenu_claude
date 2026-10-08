# GoMenu — Product Specification

## 0. How to use this document
This is the source of truth for GoMenu's business rules. Build in the phases in §18. If a technical constraint seems to require changing a business rule in this document, stop and explain the conflict instead of changing it silently. The UI design reference is the Claude Design prototype [link/export].

## 1. Product
GoMenu is a multi-tenant SaaS giving restaurants a mobile-first website, digital/QR menu, table ordering, waiter and kitchen operations, payments via their own gateway, loyalty, analytics, and reporting. Diners have one universal account across restaurants. A consumer Discovery app comes later; its admin and data model are built now but stay private.

## 2. Stack and engineering non-negotiables
- Frontend: [Next.js App Router + TypeScript — confirm], deployed on Vercel.
- Backend: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions). Supabase is the only source of truth; screens read real data, never hard-coded arrays. Demo data is seeded into Supabase through the same tables as real data.
- Authorization is enforced in the database (RLS) and server code. Hiding UI is never authorization.
- All schema, RLS, functions, triggers, and seeds live in versioned migrations in GitHub. No undocumented dashboard changes.
- Secrets (service role, gateway, webhook, AI keys) are server-side only. Provide `.env.example` with names only.
- Git flow: feature/* → develop → main. Vercel previews per branch; production deploys from main. Auth, RLS, payments, orders, migrations, billing, loyalty, and incentive changes must be tested before merging to main.
- Environments: development, staging, production. Never mix demo and production data.
- Database standards: UUID keys, foreign keys, constraints, indexes, timestamps, soft-delete/archive for anything historically referenced.
- Transactions snapshot values at the time they happen (item name, price, variants, add-ons, discounts, loyalty, incentive). Later menu or rule changes never rewrite history.
- Realtime only where live sync matters: orders, assignment, confirmation, kitchen status, diner tracking, payment status.

## 3. Identity and access model
Access = Identity (Supabase Auth) + Profile + Membership (which org) + Role + Permissions + Scope (which restaurant/branches). Login alone grants nothing.

User types:
- Platform: Super Admin, Admin, Support, Finance, Template/Content, Discovery. Individual accounts only. Super Admin requires a strong credential or passkey plus mandatory MFA; sensitive actions require re-authentication.
- Restaurant: Owner/Admin, Manager, Branch Manager, Waiter, Kitchen, Order Staff, Finance/Reporting, New Staff. Every person has an individual identity; no shared accounts.
- Diner: registered (mobile + OTP) or guest.

Granular permissions (enforced server-side) include: view/manage orders, create waiter orders, confirm table orders, kitchen access, view/edit menu, manage promotions/frames/gallery, view/manage/adjust loyalty, view analytics, view financial reports, export, manage staff, assign roles, manage branches/payments/website/QR/settings.

Branch scope: staff may be scoped to one, selected, or all branches. A waiter at Branch A cannot read Branch B orders.

Routing after login is decided by backend authorization, not frontend labels.

Security: rate limiting, OTP expiry/attempt limits/cooldown, brute-force protection, session expiry and revocation, new-device detection, logout all devices. Owners re-authenticate for gateway, phone, admin-role, financial, security, and sensitive loyalty changes. All of these events are audited.

## 4. Staff onboarding (two-gate model)
1. Admin invites staff with name + mobile (E.164) + optional intended branch (a note only, not authorization). The person is created as **New Staff**.
2. A WhatsApp message delivers a secure, random, single-use, expiring (configurable 24–72h), restaurant-bound, phone-bound token. WhatsApp is delivery, not authentication. Resend, cancel, and replace are supported; cancel invalidates the token.
3. Opening the link sends an OTP to the original invited number. The number can't be changed during activation, and forwarding the link grants nothing.
4. After OTP, staff creates a 6-digit PIN (hashed, never plaintext), with optional passkey.
5. Status becomes Verified / Awaiting Role Assignment. **New Staff has zero operational permissions, immutably**: no orders, kitchen, menu, customers, reports, settings, anything. RLS enforces this. They see only a pending screen, basic account/security, and logout.
6. Admin is notified ("New Staff Verified"), reviews, and assigns role + branch + permissions. Only then do they become Active.

Statuses (separate from role): Invitation Sent, Verification Pending, Verified/New Staff, Awaiting Role, Active, Expired, Cancelled, Locked, Disabled, Removed.
Returning login: mobile + PIN/passkey; OTP only on new devices. Forgot PIN: OTP → new PIN → revoke old sessions. Phone changes require management intervention and are audited.
Shared devices: staff switcher (name → PIN), auto-lock, device revocation; every action stays attributed to the individual.

## 5. Tenancy and privacy
Each restaurant is a tenant. A restaurant can never read another's staff, orders, payments, customers, loyalty, reports, settings, or internal data. A restaurant sees only a diner's activity with that restaurant. Restaurants can't read Discovery internals.

## 6. Plans and billing
- Annual billing only. Silver $120/yr, Gold $180/yr (shown as $10/$15 per month equivalent). Extra branch $60/yr. All prices configurable in Platform Admin. [Decision: billing currency USD vs OMR]
- First-time restaurants get 2 months free with no card, once per restaurant.
- Silver: website, QR menu, AI menu creation, unlimited categories/items, 5 images + 1 video per item, gallery, free templates, custom domain, social/WhatsApp, sharing, unlimited staff and roles, basic analytics, 1 branch, ordering, gateway connectivity, core loyalty.
- Gold: Silver + promotions/carousel, Frames, premium templates, advanced analytics and reports, priority WhatsApp support.
- Entitlements are centralized in the database and managed by Platform Admin. No scattered plan checks.
- Lifecycle: Trial → Active → Past Due → Grace (21 days, configurable) → Suspended → Retention (~6 months, configurable; data and domain config preserved) → Expiring → Deleted. Returning restaurants restart annual billing without a second free trial.

## 7. Restaurant website
- Default URL gomenu.om/{slug}. Slug history is kept with permanent redirects.
- Custom domains (root, www, subdomain): enter → DNS instructions → verify → SSL → active. Statuses: Not Connected, DNS Required, Verifying, Connected, SSL Pending, Active, Error, Disconnected. Unique mapping, canonical URL. One restaurant, one data source, many entry addresses.
- Mobile-first. Shows identity, menu, media, promotions, Frames, gallery, branches, hours, open/closed status (from hours with manual override), contact, WhatsApp, social links, ordering, diner account, loyalty, languages.
- 9 launch templates (3 free, 3 Gold, 3 paid one-time purchase), genuinely different in layout, not color swaps. Templates are managed as records (add, price, activate, preview) so more can be added. Purchases record restaurant, template, date, price, currency, reference, status.
- Templates are presentation only: switching never touches data. Restaurants preview templates with their own content. Menu display styles are separate from templates.
- Every template has a standardized, prominent **GO** button: single branch → maps; multi-branch → choose branch → maps. Clicks tracked.
- Sharing of restaurant, item, and promotion via native share and WhatsApp.
- Performance: responsive and compressed images, lazy loading, video posters, no video preloading, caching.

## 8. Menu, media and content
- One master menu with unlimited categories and items, ordering, availability, variants, options, add-ons, translations. Branches override visibility/availability without duplicating the menu.
- Item fields: name, description, price, up to 5 images (one cover, reorderable), 1 video, calories, allergens, dietary tags, spice level.
- Four separate media systems: item media, Gallery (permanent restaurant photos/videos), Frames, Promotions.
- Frames (Gold): story-style, not reels. Image or short video + caption + optional item/promotion link + branch targeting + translation. Expire 24h after publishing, enforced server-side. Analytics: views, completion, clicks, add-to-cart, attributed orders and value.
- Promotions (Gold): cards, banners, carousel, date range, branch targeting, item links, translations, analytics.
- AI menu import from PDF or image → extracted categories, items, prices → restaurant reviews before publishing. AI translation per item, category, or full menu, with review. AI credits: ~100 items free, then pay-as-you-go; Platform Admin manages allocation and pricing.
- Languages: admin UI in English and Arabic. Platform enables available website languages; restaurants activate theirs. Full RTL support.

## 9. QR
- General QR: public restaurant context (posters, social, packaging). No table identity.
- Table QR: restaurant + branch + table, using a non-predictable token resolved server-side (never /table/14). It establishes context, not physical presence. Regenerating invalidates the old token. QR routing is GoMenu-controlled and stable, so domain or slug changes never require reprinting.
- Admin creates tables, generates, downloads, prints, activates, deactivates, and regenerates QR codes.

## 10. Order engine
One engine for all sources (website, general QR, table QR, waiter) and service types (table, car, pickup; delivery later).

Order records restaurant, branch, number, source, service type, created by, assigned waiter, responsibility history, table or car plate/description, customer, item snapshots, notes, totals, payment status, order status, timestamps.

Order status (New, Accepted/Confirmed, Preparing, Ready, Served, Completed; Rejected, Cancelled, Refunded) and payment status (Unpaid, Pending, Paid, Failed, Partially Refunded, Refunded) are always separate fields.

Restaurants toggle online ordering and online payment independently. With ordering off, the website and menu still work.

**Waiter confirmation** (setting, default ON): table-QR orders wait for a waiter to physically verify and confirm. Unconfirmed orders never reach the kitchen. Reject reasons: not at table, invalid QR, duplicate, customer cancelled, other. Rejected orders produce no kitchen ticket, sale, loyalty, incentive, or income.

**Assignment modes:** (A) manager assigns manually; (B) by table/section; (C) open to active waiters, where first to accept wins atomically and others see "Already accepted"; (D) no confirmation, straight to kitchen. Waiters have shift on/off per branch. Managers can assign, reassign, unassign, take over, and cancel, with history preserved (created by, assigned, handled by, served by, completed by).

**Waiter-created orders:** table or car (plate required). The creator is the default responsible waiter. Edits before preparation are normal; after preparation starts, edits are controlled, audited (before/after), and alert the kitchen.

**Kitchen display:** same login system, tablet-optimized, oldest first, timers, delay warnings, audible alerts. New → Preparing → Ready; Ready notifies the waiter.

**Diner tracking** (guest or registered): Placed → Waiting for confirmation (if enabled) → Confirmed → Preparing → Ready → Served → Completed, synced via Realtime.

**Payment timing** (per service type): pay before serving or after. Suggested defaults: table after, car before, pickup before preparation. When confirmation is required, payment is allowed only after confirmation.

## 11. Payments
- Each restaurant connects its own merchant gateway; funds settle to the restaurant, and GoMenu doesn't hold customer funds. [THAWANI gateway, Omani Company]
- Platform manages gateways (country, currency, sandbox/production, methods, webhooks, status: Draft, Testing, Active, Disabled, Retired). Restaurants see only gateways eligible for their market, plan, and status. Restaurant connection statuses: Not Connected, Connected, Verification Required, Error, Disabled.
- Methods: cards, Apple Pay, Google Pay, local methods; offline (cash, card at restaurant) is recorded separately.
- Payment success is confirmed only by verified, idempotent webhooks, never the browser redirect.
- Refunds (full or partial) update payment, order, income, loyalty, incentive, and audit.
- Platform privately stores gateway commercial terms.

## 12. Diner account, reorder and loyalty
- Guests can browse, view the menu, and track their current order. Registered diners get profile, preferences, favorites, saved orders (user-made combos), past orders (historical, immutable), notifications, privacy controls. The same identity will be used by Discovery later.
- Reorder: past order → validate against current menu → Check & Edit (highlight price changes, unavailable items, allow edits) → place as a new order with current prices, optionally linked "reordered from #...".
- Loyalty is restaurant-specific: points, stamps, item rewards, optional tiers. Rewards: free item, fixed or % discount, free add-on, BOGO, bonus points, member-only. Campaigns: multipliers, thresholds, category bonus, welcome, birthday (opt-in), win-back, respecting consent.
- Immutable loyalty ledger (earned, bonus, redeemed, reversed, expired, manual adjustment with reason and staff). Idempotent, protected against duplicate earn/redeem and replayed events. Earned only on qualifying completion/payment.

## 13. GoMenu order incentive
- A platform fee charged to restaurants on qualifying orders, not shown to diners. Global on/off.
- Per-item amount and/or per-order amount (either, both, or neither), with an optional cap: final = MIN(item + order, cap). Rules have currency, effective dates, eligible sources/service types/plans/restaurants, refund behavior, and restaurant overrides. Architect for a future percentage model.
- Earned only on the configured qualifying event; excludes rejected, cancelled, failed, and test orders.
- Immutable ledger storing raw amounts, cap, final, rule version, and status (Pending, Earned, Reversed, Settled). Calculation is decoupled from collection method.
- Restaurant report: Reports → GoMenu Incentives.

## 14. Analytics and reports
- All analytics come from structured events (website_view, menu_view, item_view, frame_view, promotion_click, qr_scan, go_click, add_to_cart, checkout_started, order_created … payment_completed, loyalty_earned/redeemed) and real order data. No decorative charts.
- Filters: preset ranges, custom ranges, previous-period comparison, all/single/compare branches.
- Areas: website, QR, menu, sales, orders, waiter (using responsibility history, not just creator), kitchen, customers (own restaurant only), promotions, Frames, conversion funnel.
- Silver vs Gold analytics is an entitlement over the same data.
- Income report (call it Income or Revenue, never Profit): received, gross, outstanding, refunded, net, broken down by branch, service, source, payment method, item, waiter, with drill-down and PDF/CSV/print export, permission-gated.
- Test and admin activity are excluded from production analytics.

## 15. Audit
- Restaurant activity log: who, role, branch, action, object, before/after, time, device. Covers auth, orders, payments, refunds, shifts, kitchen, menu, website, staff, permissions, settings, loyalty, promotions, frames, gallery, branches. Nobody can edit or delete audit history.
- Full order timeline from scan to completion.
- Protected platform audit: plans, pricing, suspensions, entitlements, gateways, incentives, roles, feature flags, Discovery.

## 16. Discovery (private, pre-launch)
- Visible only to authorized platform admins; invisible to restaurants, staff, diners, and the public.
- Admin: taxonomy (location, cuisine, food category, place type, seating, vibe, view, facilities, price level, etc., all translatable and orderable), restaurant readiness (Not Ready, Needs Data, Needs Classification, Ready, Featured Eligible, Hidden, Blocked), ranking signals, featured and collections, moderation, mobile app preview on real data, test-diner mode.
- Filters use OR within a category and AND across categories. If there are no exact matches, show clearly separated alternatives instead of silently loosening filters.
- Restaurant-owned data is kept separate from GoMenu internal metadata; restaurants can't influence ranking.
- Feature flags: System, Admin, Preview, Public Web, Diner Access, API. Pre-launch state: Admin and Preview on, others off. Launch requires a high-level, audited admin action.

## 17. Open decisions
- Frontend framework confirmation
- Billing currency and payment processor for GoMenu subscriptions
- Launch payment gateway(s) for restaurants in Oman
- WhatsApp Business / OTP provider
- AI provider for menu import and translation
- Tax/VAT handling
- MVP cut line (which phases are required for launch)

## 18. Build phases (each ends with tests passing, RLS verified, demo data seeded, merged to develop)
1. Foundation: repo, branches, Vercel, env config, design system as code, schema, migrations, auth, profiles, tenancy, RLS, roles/permissions, branch scope, storage, realtime, audit.
2. Acquisition: marketing site, registration, onboarding, trial, subscriptions, platform admin foundation.
3. Restaurant core: dashboard, settings, branches, staff and New Staff flow, menu, AI import, credits, languages, media, website config, domains.
4. Customer experience: mobile website, 9 templates, menu styles, gallery, Frames, promotions, GO, QR, sharing, diner account.
5. Operations: cart, checkout, order engine, table QR, confirmation, waiter, assignment, kitchen, tracking, payment timing, gateways, refunds.
6. Retention and monetization: past/saved orders, reorder, loyalty, incentives.
7. Analytics and reporting.
8. Private Discovery.
9. Integration and quality: tenant/branch isolation tests, payment security, historical accuracy, entitlements, responsive and RTL checks, all UI states.
