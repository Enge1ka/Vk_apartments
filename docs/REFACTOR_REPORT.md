# Refactor Handoff Report — VK Apartments

**For:** senior dev review
**Branch:** `main` (11 commits, `89aa154` → `c77c354`)
**Scope:** 84 files changed, +4,608/−1,708 lines
**Tests:** 0 → 82 passing (16 test files)
**Lint:** 7 errors → 0 errors (1 pre-existing warning remains, documented below)

---

## 1. Context — why this looks different from the original ask

The original request was a full enterprise rebuild (Clean Architecture,
DDD, CQRS, Unit of Work, controllers, custom backend layers). The actual
app is a ~3,300-line React 19 SPA where **Supabase is the entire
backend** (Postgres + Auth + RLS + RPC) — there's no server we own. I
flagged that mismatch before writing any code; the user agreed to a
**right-sized refactor** instead: keep Supabase as-is, fix the real code
smells and bugs, skip patterns that would mean inventing a backend that
doesn't exist. Reasoning is written up in `docs/adr/0001-keep-supabase-as-baas.md`.

Work was done **feature-by-feature, each commit independently verified**
(test + lint + build + manual module-resolution check) so the app stayed
deployable throughout, per the user's instruction. Full plan and audit
findings: see the plan file referenced in conversation, and
`docs/architecture.md` / `docs/database.md` for the resulting state.

## 2. What changed, structurally

- `src/pages/*` (flat, layer-based) → `src/features/<name>/` (auth,
  apartments, locations, clients, bookings, payments, calendar,
  dashboard, reports, settings), each with `api.js` (sole owner of its
  Supabase table), `validators.js`, hooks, `components/`.
- `src/lib/*` and `src/components/ui/*` → `src/shared/lib/` and
  `src/shared/ui/` (used by every feature, moved once up front to avoid
  two competing import conventions mid-migration).
- New `src/shared/hooks/useSupabaseQuery.js` replaces the
  `useState(loading/error/data) + useEffect` boilerplate that was
  duplicated in essentially every page.
- New `src/shared/constants/status.js` is now the single source of truth
  for booking/payment/apartment status enums + badge colors (previously
  redefined per page).
- Added `zod` (the only new dependency) for form validation — see
  `docs/adr/0004-adopt-zod-for-validation.md`.
- `src/pages/` directory no longer exists.

Full convention writeup, including the **per-table ownership rule** and a
dependency-direction note worth reading before extending `bookings` or
`payments`: **`docs/architecture.md`**.

## 3. Real bugs fixed (not just moved)

These were found during the audit, confirmed by reading the actual code,
and fixed as part of migrating the feature they live in — not a separate
"bug fix" pass:

1. **Booking status desync risk.** Check-in/check-out/cancel did two
   separate, unguarded `UPDATE`s (one on `bookings`, one on `apartments`)
   from the client. If the second failed, a booking could end up
   "checked_out" while its apartment stayed "occupied" forever. Fixed
   with a new `update_booking_status()` Postgres RPC, transactional, same
   locking pattern as the existing `record_payment()`.
2. **Booking overlap race condition.** Two staff could create overlapping
   bookings for the same apartment if both passed the client-side
   "is this apartment free" check in the same race window. Fixed with a
   `gist` `EXCLUDE` constraint on `bookings(apartment_id, daterange(...))`
   — the database now rejects the second insert outright, not just the
   UI. The client-side check is now a fast pre-flight for a nicer error
   message, not the only guard.
3. **Cancellation was UI-only-gated.** The "Cancelled" option was hidden
   from non-admins in the dropdown, but the underlying `bookings` RLS
   update policy just checked `true` — any authenticated non-admin could
   cancel a booking by calling the update directly. `update_booking_status()`
   now checks role server-side.
4. **Dead code removed:** `src/hooks/useApartments.js`, `src/hooks/useBookings.js`
   (both written but never imported by the pages they were for),
   `getStatusColor()` in the old `bookingUtils.js` (unused), and
   `App.css` (leftover Vite scaffold, never imported).

Full reasoning for #1–#3: `docs/adr/0003-atomic-rpcs-over-multi-step-writes.md`.
SQL is in **`supabase-refactor.sql`** (new migration, additive, not yet
applied to any live database — see Section 5).

## 4. Testing added

| Area | Coverage |
|---|---|
| `shared/lib/bookingUtils.js`, `shared/constants/status.js`, `shared/hooks/useSupabaseQuery.js` | Unit tests |
| `features/*/validators.js` | Unit tests per validator (zod schemas and plain functions) |
| `features/*/api.js` | Unit tests against a **mocked Supabase client** (`vi.mock('@/shared/lib/supabase')`) — covers location-scoping short-circuits, the exclusion-violation → friendly-error translation, RPC call shapes |
| `features/auth/useAuth.js` | Regression tests for the auth-ready timeout fallback and the sign-out-races-a-hang behavior (both were prior bug fixes in the original repo — written so they can't silently regress) |
| `NewBookingPage`, `ClientsPage`, `SettingsPage` | Component tests (React Testing Library) for the highest-risk/most-interactive flows |

**Not covered:** end-to-end / Playwright (was a stretch goal in the plan,
not started — no live Supabase instance was available in this session to
run one against). No visual regression testing.

## 5. ⚠️ Needs your action before deploy

This sandbox had **no live Supabase project and no `.env`** — only
`.env.example`. Everything was verified via:
- `npm run test` / `npm run lint` / `npm run build` after every commit
- a mocked-Supabase-client unit test suite
- confirming each new module resolves through Vite's dev server (HTTP 200,
  no transform errors)

**What was NOT verified against a real database:**
- `supabase-refactor.sql` has not been run anywhere. Please apply it to a
  staging Supabase project and confirm: the `btree_gist` extension enables
  cleanly, the exclusion constraint doesn't reject any *existing* booking
  data (if a current dataset already has overlaps, this migration will
  fail to apply — check for that first), and `update_booking_status()`
  behaves correctly for all four status transitions under your actual RLS
  setup.
- No real click-through of the UI against live data — login, create a
  booking, record a payment, check in/out, cancel, run a report. The
  component/unit tests give confidence in the logic; they're not a
  substitute for using the app.
- Bundle size: `npm run build` succeeds but I didn't audit whether
  per-feature code-splitting changed chunk sizes meaningfully (routes were
  already lazy-loaded before this refactor; that didn't change).

## 6. Known remaining gaps (by design — see `docs/architecture.md`)

- No pagination on list pages (`Bookings`, `Payments`, `Clients`) — fine
  at current data volume, flagged as a future concern if the dataset
  grows.
- No e2e tests.
- `src/features/auth/useAuth.js` has one pre-existing lint warning
  (`react-hooks/exhaustive-deps` on stable Zustand setters) — a false
  positive, intentionally left as-is; "fixing" it by adding the setters
  as deps would just re-run the effect on every store update for no
  benefit.
- Audit log (Settings → "Audit Log" tab) is still a placeholder, same as
  before this refactor — out of scope (would need a new DB trigger/table,
  not a refactor of existing code).

## 7. How to review

Recommended order, smallest blast radius first:

1. `docs/architecture.md` + `docs/adr/*` — the reasoning, read before the diff.
2. `git log --oneline 89aa154..HEAD` — each commit is one verified, independently-deployable feature.
3. `supabase-refactor.sql` + `docs/adr/0003-*.md` — the actual behavior-changing part; this is the commit worth the closest read (`1e4b0d7`).
4. Everything else is structural (file moves + thin api.js wrappers around
   the same Supabase calls that existed before).

## 8. Commit log

```
c77c354 Add architecture docs and ADRs; update README for the new structure
f9e2a72 Migrate settings page to features/settings; retire src/pages entirely
f69b017 Migrate reports page to features/reports
15ac0e3 Migrate dashboard page to features/dashboard
2262f56 Migrate calendar page to features/calendar
d16cd67 Migrate payments page to features/payments
1e4b0d7 Migrate bookings to features/bookings; fix status-sync race and overlap race
1b60ba4 Migrate clients page to features/clients
f7af754 Migrate apartments and locations to feature modules with validation
9d07652 Migrate auth feature to features/auth; relocate shared lib and ui kit
8de5664 Add shared foundation layer: test tooling, status constants, error boundary
```
