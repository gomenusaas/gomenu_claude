# GoMenu

Multi-tenant SaaS for restaurants: website, QR menu, ordering, staff operations, payments,
loyalty and reporting. The business rules live in [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md), which
is the source of truth.

**Status: Phase 4 (Customer experience) complete.** Phase 5 does not start until it is confirmed.

Phase 4 added the public mobile website with 9 templates, menu display styles, item pages,
the GO button, sharing, offers (promotions), Frames, general and table QR codes, and the diner
account (see [Phase 4](#phase-4-customer-experience)).

Phase 3 added shared-device security (PIN lock and staff switcher, trusted devices,
re-authentication), staff management, restaurant settings, branches and opening hours,
languages, the master menu with media, the gallery, AI menu import and translation with
credits, website settings and custom domains (see [Phase 3](#phase-3-restaurant-core)).

Phase 2 added the marketing site, full registration and onboarding, the free trial, annual
subscriptions with the billing lifecycle, and the platform admin foundation (see
[Phase 2](#phase-2-acquisition)).

Phase 1 is done when:

| Criterion | Proven by |
|---|---|
| A restaurant owner can register and log in | `tests/e2e/phase1.spec.ts` (mobile OTP registration → restaurant; mobile OTP and email+password login) |
| Staff can be invited and land in New Staff with provably zero data access | `supabase/tests/database/030-new-staff-zero-access.test.sql`, `apps/web/tests/integration/new-staff.test.ts`, e2e |
| Automated tests prove Restaurant A cannot read Restaurant B's data | `supabase/tests/database/020-tenant-isolation.test.sql`, `apps/web/tests/integration/tenant-isolation.test.ts` |

---

## Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, deployed on Vercel.
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime). Supabase is the only source of
  truth. Authorization is enforced in Postgres (RLS + `SECURITY DEFINER` RPCs) and server code.
- **Monorepo:** pnpm workspaces.

```
apps/web/                 Next.js app
  app/                    routes (login, register, onboarding, /r/[id], invite, pending, ...)
  app/actions/            server actions (every write goes through a database RPC)
  lib/auth/context.ts     post-login routing, decided by the database (get_my_context)
  lib/i18n/               English + Arabic (RTL) dictionaries
  lib/supabase/           server (user session) and admin (service role, server-only) clients
  lib/messaging/          WhatsApp/SMS outbox abstraction
  tests/integration/      Vitest tests against the real Supabase API
  tests/e2e/              Playwright browser tests
packages/ui/              design system: tokens → CSS variables → Tailwind theme, components
supabase/
  config.toml             local stack config (phone OTP via Send SMS hook)
  migrations/             every schema/RLS/function change, in order
  seed.sql                DEV/DEMO data only
  tests/database/         pgTAP suite (RLS, isolation, New Staff, onboarding, audit)
scripts/test-db.sh        runs the pgTAP suite with psql
```

## Run it locally

Prerequisites: Node 22+, pnpm 10, Docker, `psql`.

```bash
pnpm install
pnpm db:start                      # local Supabase: applies migrations + dev seed
cp apps/web/.env.example apps/web/.env.local
# fill from `pnpm exec supabase status`; set NEXT_PUBLIC_APP_URL=http://localhost:3000
# and GOMENU_DEV_OUTBOX=true
pnpm dev                           # http://localhost:3000
```

No SMS or WhatsApp provider is needed locally. OTP codes and invitation links are written to
`private.message_outbox` and shown at **http://localhost:3000/dev/outbox**.

Demo logins from the seed:

| Who | How |
|---|---|
| Platform Super Admin | `/platform/login`: `root@demo.gomenu.test` / `GoMenuDemo!2026`, then enrol an authenticator app |
| Platform Finance | `finance@demo.gomenu.test` / `GoMenuDemo!2026` + authenticator app |
| Owner, Muscat Grill (Demo), in its trial | email `owner@demo.gomenu.test` / `GoMenuDemo!2026`, or mobile `+96899000001` + OTP from the outbox |
| Owner, Sohar Café (Demo), on a paid Silver plan | `owner2@demo.gomenu.test` / `GoMenuDemo!2026` |
| Manager / Waiter (Qurum only) / Kitchen | `+96899000002` / `+96899000003` / `+96899000004` + OTP |
| New Staff awaiting a role | `+96899000005` + OTP → lands on the pending screen |
| Visitor / diner | http://localhost:3000/demo-muscat-grill (any mobile number signs in as a diner) |
| Table QR (Qurum, T1–T3) | http://localhost:3000/q/demo-muscat-grill-table-t1 (fixed demo tokens) |

> Behind a registry that blocks `public.ecr.aws`, start the stack with
> `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io pnpm db:start`.

## Tests

```bash
pnpm test:db            # pgTAP: 1,774 assertions on RLS, isolation, onboarding, audit, billing, lifecycle, menu, AI, domains, website, QR
pnpm test:integration   # Vitest against Auth / PostgREST / Storage / Realtime
pnpm build && PW_CHROMIUM_PATH=... pnpm test:e2e   # Playwright, mobile viewport
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, every migration on a fresh local
Supabase, the pgTAP suite, a check that generated types are current, integration tests, the
build and e2e on every push and pull request.

### How RLS is proven

- **Catalog-driven, so future tables are covered automatically.** The tests enumerate tables
  from the Postgres catalog rather than a hand-written list:
  - Every table with a `restaurant_id` is checked for SELECT, INSERT, UPDATE and DELETE by
    each Restaurant A persona against real Restaurant B rows.
  - Every public table is checked for New Staff, an invitee mid-verification, an outsider and
    a user with no phone. They read zero rows (only their own profile) and cannot write.
- **Positive controls.** B's owner does see B's rows, so a "zero rows" result means something.
- **Guardrails.** RLS must be enabled and forced on every table. `anon` has no table grants.
  Every table either carries `restaurant_id` or is on a reviewed list. Every
  `SECURITY DEFINER` function pins `search_path`. Client-callable RPCs and private helpers must
  match a reviewed allowlist. A new table or function that skips these fails CI.
- **Through the real API too.** Integration tests sign in with real phone OTPs and query
  PostgREST, Storage and Realtime (both postgres_changes and private broadcast channels).
- **Mutation-checked.** Removing the `status = 'active'` check from the permission helper makes
  the New Staff suite fail.

## Security model (Phase 1)

- **Access** = identity + membership (restaurant) + role + permissions + branch scope.
  `private.has_permission(restaurant, permission, branch)` is the single check used by policies.
  It is true only for an **active** membership whose role is not New Staff, which holds the
  permission (role or grant override, minus deny overrides), and whose scope covers the branch.
- **New Staff = zero permissions, immutably.** This is enforced at four layers:
  1. Policies require `status = 'active'`.
  2. Triggers stop the New Staff role from ever receiving a permission.
  3. A New Staff membership can never be active, receive overrides, or receive branch access.
  4. The pending screen reads only its own status via `get_my_context()`.
- **Writes go through RPCs.** `invite_staff`, `assign_staff_role`, `create_restaurant` and the
  others check permissions explicitly and write the audit row in the same transaction. Clients
  have no direct write grants on memberships, roles, invitations or audit.
- **Escalation guards.** You cannot change your own role. Only an owner can grant the Owner
  role. You cannot assign permissions or a branch scope wider than your own. Owner-only
  permissions (payments, billing, ownership) can never go into another role or an override.
  A restaurant always keeps at least one active owner.
- **Invitations.**
  - Tokens have 256 bits of randomness and only their SHA-256 hash is stored.
  - Each token is single-use and expires after a configurable 24–72h.
  - A token is bound to its restaurant and phone number. The browser never chooses or sees
    the full number.
  - OTPs go to the invited number, and accepting requires that exact verified phone, so a
    forwarded link grants nothing.
  - Resending or cancelling invalidates older tokens.
- **PIN:** 6 digits, hashed with bcrypt and never stored as plaintext. Weak PINs are rejected.
  Repeated wrong entries of an existing PIN lock it for 15 minutes.
- **Audit:** append-only for every role, including `postgres` and `service_role`. Triggers block
  UPDATE, DELETE and TRUNCATE. Each row keeps a full actor snapshot (name, phone, email, role),
  IP, user agent and device header, and rows are kept forever.
- **Platform staff** have no RLS access to tenant data. Super Admin, with an MFA session
  (`aal2`), can read a tenant only through `platform_get_restaurant_overview(reason)`. That
  function writes a platform audit row before returning any data.
- **Storage:** object paths start with `{restaurant_id}/`. A public bucket holds website media
  and a private bucket holds internal files. Both buckets use the same permission checks.
- **Realtime:** postgres_changes follow table RLS. Private broadcast topics
  `restaurant:{id}` and `restaurant:{id}:branch:{id}` require an active membership in scope.

## Phase 2: Acquisition

### What's included
- **Marketing site** (`/`, `/features`, `/pricing`, `/contact`, `/terms`, `/privacy`) in
  English and Arabic. Prices and plan features are read live from the database. Terms and
  Privacy are **drafts that need legal review**.
- **Registration:** the owner verifies their mobile, then creates the restaurant. They must
  accept the Terms (the version and time are recorded). Web addresses used by app/marketing
  routes are reserved. The owner then lands on a setup checklist: details → branch → team →
  plan.
- **Free trial:** 2 months of Gold features. Only one automatic trial per verified owner
  mobile, ever. Platform Admin can grant an exception, which is audited.
- **Plans and entitlements:** stored centrally in the database.
  - `private.has_feature()` and `private.branch_limit()` are the only plan checks; there is no
    "is Gold" logic in the code.
  - Silver includes 1 branch, with extra branches at $60/yr. Gold has unlimited branches.
  - Prices are versioned, and invoices and periods keep the price that applied when they were
    issued.
- **Billing without a payment processor (decision P2-Q1):**
  - The owner chooses a plan and gets an invoice. Tax is configurable and set to 0% for now.
  - Finance records the bank transfer in Platform Admin. Recording is idempotent per
    reference, so a payment can't be applied twice.
  - Recording a payment activates or extends coverage. Paying during the trial starts the
    paid year when the trial ends.
  - Extra branches and upgrades are prorated over the rest of the annual term. Downgrades take
    effect at renewal.
- **Lifecycle engine** (`private.run_billing_lifecycle`, run hourly by pg_cron). Every
  duration below can be changed in Platform Admin → Settings:

  | State | When | What happens |
  |---|---|---|
  | Trial / Active | covered by a trial or paid period | normal |
  | Past Due | 0–7 days after coverage ends | normal + renewal banner; renewal invoice issued |
  | Grace | next 21 days | normal + "overdue" banner |
  | Suspended | next 30 days | **public site offline, owners read-only, staff blocked** |
  | Retention | next 180 days | same as Suspended; data and domain config kept |
  | Expiring | next 30 days | same + final warnings |
  | Deleted | after that | no access for anyone (data purge job: later phase) |

  Every transition is written to the restaurant audit and the platform audit, and notifies
  the owners. A **tenant write guard** trigger blocks user writes while a restaurant is not
  writable. A guardrail test fails CI if any tenant table lacks the guard and is not on the
  reviewed exception list.
- **Platform admin** (`/platform`):
  - Sign-in is email + password + authenticator app. MFA is required for every platform role
    and is enforced in the database (`aal2`).
  - Pages: overview, restaurants (listing and detail are audited), invoices (record or void
    payments), plans and prices, entitlement matrix, per-restaurant overrides, trial
    exceptions, manual suspension, settings, platform staff and the platform audit log.
  - Each RPC checks the caller's role. The console is English-only.

### First Super Admin on a hosted environment
Create the user in Supabase Auth with a strong password and a confirmed email, then run once
(SQL editor or `psql`). Record the run, because there must be no undocumented dashboard
changes:
```sql
insert into public.platform_staff (user_id, role)
select id, 'super_admin' from auth.users where email = '<their email>';
```
On first sign-in at `/platform/login` they must enrol an authenticator app. After that, they
add other staff from Platform Admin → Staff.

## Phase 3: Restaurant core

### What's included
- **Shared-device security.** Logging in with a mobile code makes the browser a *trusted
  device*. The device cookie (`gm_device`) is a random, httpOnly token; the database stores
  only its hash. **Lock** (button, or automatic after the restaurant's idle time) parks the
  session: the refresh token is sealed with AES-256-GCM (`GOMENU_SESSION_KEY`) in
  `private.device_sessions` and the browser's auth cookies are cleared. `/lock` lists the
  people parked on this device. A correct PIN (with lockout after repeated failures, every
  failure audited) restores that person's own session. An email+password login never trusts
  a device, so locking it logs out instead.
- **Re-authentication.** Sensitive changes (PIN, staff phone, PIN reset, owner/admin role
  changes, security settings) require a mobile code from the last 10 minutes. The form links
  to `/reauth`, which returns the person to where they were.
- **Devices and sessions:** `/account` lists trusted devices (revoke one) and has *Log out of
  all devices*, which ends every session including parked ones.
- **Staff management:** change role, disable/enable, lock, remove, change mobile (the new
  number must verify again) and reset PIN; all audited.
- **Settings:** profile (tagline/description per language, contacts, social links, time zone,
  invitation lifetime), logo and cover (compressed to WebP in the browser), languages, and the
  shared-device auto-lock time.
- **Branches:** details, map link and coordinates, weekly hours (overnight periods allowed),
  a manual open/closed override with an optional end time (in the restaurant's time zone),
  live open/closed status, and archiving. The plan's branch limit is enforced in the database.
- **Languages:** the platform enables languages (`/platform/languages`); each restaurant turns
  on the ones it wants. English and Arabic are on by default.
- **Menu:** one master menu per restaurant. Categories and items have per-language text,
  ordering, show/hide, sold out, archive (never delete), allergens, dietary tags, spice
  level, calories, variants, option groups/add-ons and per-branch availability. Prices are
  integers in minor units of the restaurant currency (OMR has 3 decimals).
- **Media:** photos are resized and compressed to WebP in the browser; videos up to 15 MB with
  a poster frame. Per-item image/video limits and the gallery come from the plan.
- **AI (Claude).** *Import*: upload a PDF or photo of a menu; Claude reads categories, items
  and prices; the owner edits and unticks, then publishes. *Translation*: the whole menu or a
  category into an active language; results are saved as **AI drafts** until a person marks
  them reviewed (editing a draft's text also counts as reviewing it). **Credits:** 1 credit =
  1 item imported, or 1 item translated into one language. New restaurants get 100 free
  credits; packs of 100 are bought on the billing page (an invoice, applied when Finance
  records payment). Platform Admin can adjust credits, and the adjustment is audited.
- **Website settings:** web address (old addresses keep redirecting), menu style, sections,
  ordering/payment toggles (saved now; ordering arrives in Phase 5), SEO text, published flag.
  The public website came in Phase 4.
- **Custom domains (Gold):** add a domain → the DNS records to create → automatic checks
  (when the page is viewed, at most once a minute, and by a daily cron) → *Active* → *Main
  address*. A domain can belong to one restaurant only.
- **Dashboard:** real numbers (menu, sold out, drafts to review, staff, AI credits, website,
  branch open/closed), each part shown only with the matching permission.

### How Claude is used
`apps/web/lib/ai/` holds a small provider interface with two implementations:
- `anthropic.ts` uses the official SDK with model `claude-opus-5-5`, streaming,
  structured JSON output validated with zod, and explicit handling of `refusal` and
  `max_tokens` stop reasons. Images and PDFs are sent as image/document blocks.
  **The server-side refusal fallback is enabled** (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`): if Claude declines a request on policy grounds, the API
  retries it on Anthropic's recommended fallback model within the same call instead of failing
  the import.
- `fake.ts` is deterministic (`GOMENU_AI_PROVIDER=fake`) and is used by every automated test.

The browser never talks to Claude. The import file goes to private storage under
`{restaurant}/imports/`; the job is created as the signed-in person (permission, plan and
credit checks in the database); only the AI result is recorded with the service role, through
RPCs that browsers cannot call (`complete_menu_import`, `complete_translation`,
`fail_ai_job`). Credits are charged per item in the same transaction.

### How custom domains work
`apps/web/lib/domains/` has a Vercel implementation (Domains API: add to the project, read
verification and DNS configuration, verify, remove) and a stand-in used when `VERCEL_TOKEN`
is not set. Statuses are recorded through the service-role-only `set_domain_status`.
`vercel.json` schedules `/api/cron/domains` daily (Vercel Hobby allows daily crons; on Pro it
can run more often). Requests must carry `Authorization: Bearer $CRON_SECRET`.

### Phase 3 settings to add on Vercel
`GOMENU_SESSION_KEY` (`openssl rand -base64 32`), `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`
(scoped to the team), `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `CRON_SECRET`. Mark all of them
as sensitive. Leave `GOMENU_AI_PROVIDER` unset in hosted environments.

## Phase 4: Customer experience

### What's included
- **Public website** at `/{slug}` (old slugs redirect permanently) and on custom domains.
  Mobile-first; shows identity, offers, Frames, the menu, gallery, branches with hours and
  live open/closed status, contact, WhatsApp and social links. Language switcher across the
  restaurant's active languages, with right-to-left layout for Arabic. A branch picker applies
  branch availability and branch-targeted offers and Frames. Only the restaurant's *reviewed*
  translations are shown; unreviewed AI drafts fall back to the default language.
- **9 templates** (spec §7), genuinely different layouts on the same data:
  free — Classic, Minimal, Cards; Gold — Showcase, Bold, Street; paid one-time — Elegant,
  Magazine, Café. Templates are database records Platform manages (add, price, activate). Paid
  ones are bought with an invoice and unlock when Finance records the payment. If a plan no
  longer includes the chosen template, the website falls back to Classic without changing the
  saved choice. **Menu display styles** (list, grid, compact) are a separate setting.
- **Preview** (`/preview/{restaurant}`): staff with website management see the website before
  publishing, in any template, with their own content.
- **GO button** in every template: one branch opens maps; several branches ask which one.
  **Sharing**: native share sheet or WhatsApp, for the restaurant and for each dish.
  Every dish has its own page with photos, video, variants, options and allergens.
- **Offers (promotions, Gold)**: card, banner or carousel; dates in the restaurant's time zone;
  branch targeting; dish link; image; views and clicks counted.
- **Frames (Gold)**: story-style photos and short videos with caption, dish link and branch
  targeting. The server sets the publishing time and expires them exactly 24 hours later.
  Views, watched-to-the-end and clicks are counted.
- **QR codes** (spec §9): every code encodes `/q/{random token}` on GoMenu, never a slug, domain
  or table number, so nothing is reprinted after an address change. General codes (posters,
  social) and table codes per branch; download PNG/SVG; printable sheet; regenerate (the old
  code stops working at once), deactivate, delete. A table scan stores the table context for
  the visit (shown to the diner now, used for ordering in Phase 5). It establishes context,
  not physical presence.
- **Diner account** (spec §12): sign in with mobile + code from any restaurant page and come
  back to the same page. `/me` shows favorites (restaurants and dishes), name, preferred
  language, privacy controls (don't link my visits to my account; offers opt-in) and "delete my
  favorites and preferences". Restaurants cannot read diners' favorites.
- **Analytics events** (spec §14) are recorded from now on through one validated,
  rate-limited function: website, menu and item views, QR scans, GO clicks, shares, Frame and
  offer views/clicks. Staff and platform activity is flagged internal and excluded. No personal
  data unless the diner is signed in and hasn't opted out. Reports arrive in Phase 7.

### How the public website stays safe and fast
- Visitors never get table access: everything comes from `public_site()`, which returns only a
  published website of a publicly available restaurant. Suspended restaurants show "temporarily
  unavailable" and nothing else.
- Responses are cached and tagged per restaurant; any save in the dashboard refreshes them at
  once, and anything else (a Frame expiring, a branch opening) shows within 30 seconds.
- Images are lazy-loaded; videos never preload and show a poster.

### Custom domains in production
`proxy.ts` serves `/` and `/item/*` on any host that isn't the app's own (`NEXT_PUBLIC_APP_URL`,
`*.vercel.app`, or the comma-separated `GOMENU_APP_HOSTS`) from the restaurant that owns the
domain, and redirects other domains of that restaurant to its main address. Other paths
(sign-in, `/me`, `/q/...`) work on any host. Domain lookups are cached for 60 seconds per
server instance.

## Design system

`packages/ui/tokens/tokens.json` is the single source of design values. `pnpm tokens` turns it
into CSS variables (light, dark and Arabic font) and a Tailwind v4 `@theme`. Components only
reference token names and use logical properties, so RTL works without per-component work.

**The token values are placeholders** until the Claude Design export arrives. Replacing them
there restyles the whole app.

## Deploying (dev project `xqcrerkervzeyzjtmruk`, Vercel `gomenu_claude`)

Nothing here has been deployed yet. To bring the dev environment up:

1. **Database**
   ```bash
   pnpm exec supabase link --project-ref xqcrerkervzeyzjtmruk
   pnpm exec supabase db push        # applies supabase/migrations
   psql "$DEV_DB_URL" -f supabase/seed.sql   # dev only, never staging/production
   ```
2. **Auth settings** (record every change here; no undocumented dashboard changes):
   - MFA: authenticator app (TOTP) enrolment and verification enabled. Platform staff need it.
   - `pg_cron` is created by the migrations. Confirm the `gomenu-billing-lifecycle` job exists
     in the `cron.job` table.
   - Phone provider on.
   - Phone and email confirmations **required**.
   - Send SMS hook → Postgres function `private.hook_send_sms`. In dev this delivers into the
     outbox. Staging and production need a sender for the chosen provider.
   - SMTP set up, so email confirmation for the email + password login works.
   - Strict rate limits. The raised limits in `config.toml` are for local tests only, so do
     not `supabase config push` them.
3. **Vercel:** set the project root directory to `apps/web`. Add the variables from
   `apps/web/.env.example`, with `SUPABASE_SERVICE_ROLE_KEY` marked as sensitive. Set
   `GOMENU_DEV_OUTBOX=true` only in the dev environment.
4. **Git flow:** per decision Q7, Phase 1 was built on `claude/gomenu-spec-review-gudn4c`. You
   handle `feature/*` → `develop` → `main`.

## Decisions log (Phase 1 review)

| # | Decision |
|---|---|
| Q1 | Design reference: placeholder tokens now; swap in the Claude Design export later |
| Q2 | Phase 1 includes bare owner sign-up and invite → OTP → PIN → New Staff (pulled forward from Phases 2/3) |
| Q3 | Next.js App Router + TypeScript |
| Q4 | Owners log in with mobile + OTP **and** email + password on one identity |
| Q5 | PIN is created now and stored hashed; PIN login, lockout, devices, staff switcher and auto-lock come in Phase 3 |
| Q6 | WhatsApp/OTP provider is decided later; a pluggable outbox is used meanwhile |
| Q7 | Work stays on the session branch; branching and merging are yours |
| Q8 | One `new_staff` status covers Verified, New Staff and Awaiting Role |
| Q9 | Owner and Admin are separate roles; the last owner cannot be removed |
| Q10 | Custom roles per restaurant, plus per-person grant/deny overrides |
| Q11 | Super Admin only, MFA session, every tenant read audited; other platform roles have no tenant access |
| Q12 / In1 | Audit is kept forever with a full actor snapshot (name, phone, email) |
| Q13 | Restaurant = tenant; there is no organization level |
| Q14 | Hosted projects exist: Supabase dev `xqcrerkervzeyzjtmruk`, Vercel `gomenu_claude` |
| P2-Q1 | No subscription processor yet: Finance records payments manually; processor is pluggable later. Prices shown in USD |
| P2-Q2 | Silver $120/yr, Gold $180/yr, extra branch $60/yr (configurable records) |
| P2-Q3 | Gold includes unlimited branches |
| P2-Q4 | The trial unlocks full Gold |
| P2-Q5 | One automatic trial per verified owner mobile, ever; Platform can grant audited exceptions |
| P2-Q6 | Suspended: site offline, owner read-only, staff blocked |
| P2-Q7 | Platform staff: email + password + authenticator app (MFA) for every platform role |
| P2-Q8 | Tax configurable, 0% until confirmed |
| P2-Q9 | WhatsApp/SMS provider still undecided |
| P2-Q10 | Marketing copy drafted in EN+AR; Terms/Privacy are drafts for legal review |
| P3-Q1 | All of Phase 3 delivered at once |
| P3-Q2 | AI provider: Anthropic Claude |
| P3-Q3 | 1 credit = 1 menu item (imported, or translated into one language) |
| P3-Q4 | Custom domains through the Vercel Domains API |
| P3-Q5 | PIN unlock is bound to a trusted device |
| P3-Q6 | Recommended defaults, applied without further questions: re-authentication = a mobile code within 10 minutes; EN+AR enabled on the platform and restaurants activate their own; images compressed to WebP in the browser; videos ≤ 15 MB; Claude and Vercel behind provider interfaces with deterministic stand-ins for tests |
| P4 (defaults, applied without further questions as instructed) | Paid templates: one-time price set per template by Platform (seed: $49), bought by invoice and unlocked on payment. QR: general + table codes and table management now; table *ordering* in Phase 5. Diner account: profile, language, favorites, privacy controls now; past/saved orders in Phases 5–6. Analytics events recorded now; reports in Phase 7. Templates use the placeholder design tokens |

## Known limitations and follow-ups

**Phase 4**
- **The 9 templates use the placeholder design tokens.** Layouts are genuinely different; the
  visual styling will be redone from the Claude Design export.
- **A template added in Platform without a matching layout** in the app renders as Classic
  (the platform page flags it "No layout yet"). New layouts are code.
- **Diner data and Discovery:** favorites, preferences and visit history belong to one
  universal identity, ready for Discovery; there is no diner account deletion yet (the same
  identity may be staff, and order history arrives in Phase 5). "Delete my favorites and
  preferences" covers what exists today. This needs the retention policy already noted.
- **Offers and Frames analytics** show raw counts; the attributed-orders part of the spec
  arrives with ordering and reports.
- **QR scans are counted per scan**, not per unique visitor; scans by staff are excluded.
- **Locally**, run `pnpm db:reset` (it also clears Next's data cache) rather than
  `supabase db reset`, or the website may show cached data from before the reset.

**Phase 3**
- **One opening period per day** in the hours editor (the database accepts several; the UI
  edits one). Split shifts need a second row in the UI.
- **Imports run inside the request** (up to 300 s on Vercel). Very long PDFs can hit
  `max_tokens`; the owner sees a message asking to split the file. A background queue would
  remove this limit.
- **No real AI or Vercel calls were made while building this.** Both are covered by their
  stand-ins; the Claude and Vercel code paths need one manual check on the dev environment
  with real keys.
- **HTTPS status** is inferred: Vercel issues certificates automatically once DNS points at
  it, and a domain is marked *Active* when HTTPS answers (otherwise *SSL pending*).
- **Locking needs a trusted device.** If someone signed in with email + password, Lock logs
  them out (they can sign in with a mobile code to make the device trusted).
- **Re-authentication on hosted environments:** GoTrue allows one code per number every 60 s,
  so someone who logs in and immediately opens a sensitive form may be asked to wait a minute.

**Phase 2**
- **Who on the platform can see restaurants (my reading of Q11).** A restaurant's billing
  account (name, slug, status, plan, invoices, payments) counts as platform data. Super Admin,
  Admin, Finance and Support can see it, and every listing or detail view is audited. Tenant
  operational data (staff, branches, audit) is still Super Admin only, through the audited
  overview RPC.
- **A restaurant created without a trial** (the owner's mobile already used one) starts in Past
  Due. It runs through Past Due and Grace (about 28 days) before suspension, and has no plan
  features until it pays. Tighten this if that window is too generous.
- **Deleted** is a status only. Purging data needs a retention/erasure policy, which is also
  needed for the audit-vs-privacy conflict.
- **No real payment processor** (P2-Q1) and **no real WhatsApp/SMS sender** (P2-Q9): hosted
  owners can only be activated by Finance recording payments, and OTPs only work through
  `/dev/outbox` on dev.
- The platform console is English-only.
- Invoices are on-screen records only (no PDF yet); bank details come from the
  `bank_transfer_instructions` setting.

**Phase 1**

- **Audit vs. privacy.** Full snapshots kept forever cannot be erased. This conflicts with the
  diner privacy controls in §12 and needs a retention policy before Phase 6.
- **Message delivery.** No real sender exists yet. Invitation links (raw tokens) sit in
  `private.message_outbox`, which only the service role can read, until a sender delivers them.
  The sender should clear the token from the payload after delivery.
- **Done in Phase 3:** PIN unlock, staff switcher, auto-lock, log out of all devices,
  re-authentication. *Forgot PIN* = log in with a mobile code and set a new PIN in `/account`
  (managers can also reset a staff member's PIN). Still open: alerts when a new device signs in,
  and application-level rate limiting beyond Supabase Auth and the PIN lockout.
- **Pending screen** checks for a role every 30 seconds instead of using Realtime. This is
  deliberate: New Staff have no realtime channel access.
- **A verified New Staff member can still create their own restaurant** via `create_restaurant`.
  That gives them nothing in the restaurant that invited them (tested), but the UI does not
  offer it to them.
- **Database superuser.** Audit immutability holds against every application role. A database
  superuser could still disable triggers, which is a platform-operations control.
