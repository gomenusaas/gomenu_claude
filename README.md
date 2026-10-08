# GoMenu

Multi-tenant SaaS for restaurants: website, QR menu, ordering, staff operations, payments,
loyalty and reporting. The business rules live in [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md), which
is the source of truth.

**Status: Phase 1 (Foundation).** Phase 2 does not start until it is confirmed.

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
| Owner, Muscat Grill (Demo) | email `owner@demo.gomenu.test` / `GoMenuDemo!2026`, or mobile `+96899000001` + OTP from the outbox |
| Owner, Sohar Café (Demo) | `owner2@demo.gomenu.test` / `GoMenuDemo!2026` |
| Manager / Waiter (Qurum only) / Kitchen | `+96899000002` / `+96899000003` / `+96899000004` + OTP |
| New Staff awaiting a role | `+96899000005` + OTP → lands on the pending screen |

> Behind a registry that blocks `public.ecr.aws`, start the stack with
> `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io pnpm db:start`.

## Tests

```bash
pnpm test:db            # pgTAP: 500+ assertions on RLS, isolation, onboarding, audit
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

## Known limitations and follow-ups

- **Audit vs. privacy.** Full snapshots kept forever cannot be erased. This conflicts with the
  diner privacy controls in §12 and needs a retention policy before Phase 6.
- **Message delivery.** No real sender exists yet. Invitation links (raw tokens) sit in
  `private.message_outbox`, which only the service role can read, until a sender delivers them.
  The sender should clear the token from the payload after delivery.
- **Phase 3 items not built:** PIN login, new-device detection, staff switcher, auto-lock,
  logout on all devices, forgot-PIN, owner re-authentication for sensitive actions, Super Admin
  MFA enrolment UI, and application-level rate limiting beyond Supabase Auth's built-ins.
- **Pending screen** checks for a role every 30 seconds instead of using Realtime. This is
  deliberate: New Staff have no realtime channel access.
- **A verified New Staff member can still create their own restaurant** via `create_restaurant`.
  That gives them nothing in the restaurant that invited them (tested), but the UI does not
  offer it to them.
- **Database superuser.** Audit immutability holds against every application role. A database
  superuser could still disable triggers, which is a platform-operations control.
