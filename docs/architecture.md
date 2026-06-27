# Architecture

This is a Vite + React 19 SPA using **Supabase as a full backend-as-a-service**
(Postgres + Auth + RLS + RPC) — there is no custom API server. That fact
drives every decision below: layers that would normally separate
"controller / service / repository / ORM" collapse into a much shorter
chain, because Supabase's client library, RLS policies, and `SECURITY
DEFINER` RPCs already provide the equivalent of a data-access and
authorization layer at the database edge.

## Folder structure

```
src/
  app/                   App.tsx — router, lazy-loaded routes, top-level providers
  components/            Cross-feature navigation chrome with no data of its own
                          (AppLayout, BottomNav, More) — not a "feature" because
                          it doesn't own a table or a business concept.
  features/
    <feature>/
      api.ts              The ONLY file allowed to call supabase.from('<table>')
                           for that table (see "Table ownership" below). Also
                           where that table's row/input TypeScript interfaces
                           live and get exported from.
      validators.ts        Form validation (zod schemas or plain functions).
      use<Thing>.ts         Hooks that compose api.ts calls + React state.
      selectors.ts          Pure aggregation/derivation functions (Reports only —
                           extracted because that page's "business logic" is
                           non-trivial grouping/summing, not just a fetch).
      components/
        <Thing>Page.tsx     The default-exported page component.
        <SubComponent>.tsx  Page-local presentational pieces.
      *.test.ts / *.test.tsx  Co-located with what they test.
  shared/
    ui/                   Button, Card, Dialog, Input, Label, Select, Badge —
                           generic, feature-agnostic primitives.
    lib/                  supabase client, bookingUtils (formatting), cn,
                           receiptGenerator, metrics.ts (generic pub/sub —
                           see "Performance monitoring" below).
    hooks/                useSupabaseQuery — the fetch/loading/error/refetch
                           hook every feature's data-loading hook is built on;
                           also times every query and emits the result via
                           metrics.ts.
    constants/            status.ts — the single source of truth for booking/
                           payment/apartment status enums and their badge
                           variants (mirrors the DB CHECK constraints), plus
                           the TS types derived from them (BookingStatus etc.).
    components/           ErrorBoundary.
    types/                database.types.ts (generated — see "Types" below).
  test/                   Vitest setup (jest-dom matchers).
  vite-env.d.ts           Typed import.meta.env (Vite's own ambient types +
                          this project's actual env var names).
```

## Table ownership

Each Postgres table has exactly one feature's `api.js` that's allowed to
query it directly:

| Table | Owner |
|---|---|
| `auth.users` / `profiles` | `features/auth/api.ts` |
| `locations` | `features/locations/api.ts` |
| `apartments` | `features/apartments/api.ts` |
| `clients` | `features/clients/api.ts` |
| `bookings` | `features/bookings/api.ts` |
| `payments` | `features/payments/api.ts` |
| `performance_metrics` | `features/monitoring/api.ts` |

Other features call into the owning feature's `api.ts` rather than
querying the table themselves — e.g. `payments/api.ts` calls
`listApartmentIds()` from `apartments/api.ts` and
`listBookingIdsForApartments()` from `bookings/api.ts` to scope payments
by location, instead of joining across tables itself. `dashboard` and
`reports` own no table at all; they're pure composition over the other
features' `api.ts` functions plus their own derived view-model (a hook in
`dashboard`, a hook + `selectors.ts` in `reports`, since its aggregation
logic is substantial enough to warrant its own pure, tested module).

**Watch for cycles.** `bookings/api.ts` deliberately does not import
`features/payments/api.ts`, even though creating a booking can involve
recording its first payment — because `payments/api.ts` already imports
from `bookings/api.ts` (to resolve booking IDs for location-scoping). The
"create booking, then optionally record its first payment" sequence is
orchestrated by `NewBookingPage` itself instead, since that's page-level
workflow, not something either feature's data layer should own.

## Conventions

- **`api.ts` functions throw, they don't return `{ data, error }`.** Callers
  (hooks or components) catch and surface the error; nothing silently
  swallows a Supabase error.
- **Validation lives in `validators.ts`**, not inline in the component. Most
  use `zod`; a few (payment-amount-vs-balance, cancellation reason) are
  plain functions because they don't fit a schema cleanly or have
  different semantics depending on context (e.g. an initial booking
  payment may be `0`; a payment against an existing balance may not).
- **`useSupabaseQuery(queryFn, deps)`** replaces the hand-rolled
  `useState(loading/error/data) + useEffect` pattern that used to be
  duplicated in every page.
- **Status enums and their badge variants** live once in
  `shared/constants/status.ts`, imported by both forms (`<Select>` options)
  and list/detail views (`Badge` color), instead of each page defining its
  own status-to-color map.
- **No business logic in page components.** Booking creation, payment
  recording, status transitions, and report aggregation all live in
  `api.ts`/`selectors.ts`/hooks; components wire user interaction to those
  functions and render the result.

## Types

The whole codebase is TypeScript (`strict: true`) — see
`docs/adr/0006-typescript-migration.md` for how and why. Two things worth
knowing before touching any feature's types:

- **Row/input interfaces are hand-written per feature, in that feature's
  `api.ts`**, not generated — `src/shared/types/database.types.ts` doesn't
  exist yet (see `src/shared/types/README.md` for how to generate it).
  Once it does, `shared/lib/supabase.ts` should switch to
  `createClient<Database>(...)`, and each feature's hand-written
  interfaces can be replaced by `Database['public']['Tables']['<table>']['Row']`
  — that's the actual point of generating them, not just a nice-to-have.
- **Tests mocking the Supabase client use `vi.mocked(supabase.from)` /
  `vi.mocked(supabase.rpc)`**, not the real client's types directly — the
  real `.from()`/`.rpc()` are deeply generic Postgrest builder types that
  don't expose `mockReturnValue` etc., and faking them precisely isn't
  worth it. `@typescript-eslint/no-explicit-any` is disabled for
  `*.test.{ts,tsx}` for the same reason: these mocks intentionally use
  loose `any` chain fakes, which doesn't weaken the production code's
  actual type safety.

## Performance monitoring

`shared/lib/metrics.ts` is a tiny, generic pub/sub (`emitMetric`/`onMetric`)
— it has to live in `shared/`, not in `features/monitoring/`, because
`useSupabaseQuery` (also shared) needs to emit a timing event for every
query, and `shared/` can't depend on a feature. `features/monitoring/`
is the only subscriber: `init.ts` (called once from `app/App.tsx`)
forwards slow-query events (>1000ms) and every Core Web Vital
(`reportWebVitals.ts`, via the `web-vitals` library) into
`log_client_metric()`. Without a subscriber, slow queries still print a
`console.warn` — the persistence layer is additive, not required for the
warning to be useful locally.

A read-only "Performance" tab under Settings (admin-only, same place an
admin would look for anything operational) shows the latest Core Web
Vital per metric and the most recent slow queries, so the data actually
gets looked at instead of sitting unread in a table. See
`docs/adr/0005-client-side-performance-monitoring.md`.

Bundle size is handled separately and locally: `rollup-plugin-visualizer`
writes `dist/stats.html` on every `npm run build` — open it to see what's
actually taking up space, no telemetry or backend involved.

## Why not [enterprise pattern X]?

The original brief for this refactor asked for Clean Architecture, DDD,
CQRS, Unit of Work, a repository pattern, and a layered backend. Since
Supabase **is** the backend, most of those patterns would mean building a
server that doesn't exist today purely to host them — see
`docs/adr/0001-keep-supabase-as-baas.md`. What's here instead is the
substance those patterns are meant to deliver, sized to an app this small:
a single owner per table (≈ repository pattern), validation and
business rules out of components (≈ application layer), atomic
multi-step writes via Postgres RPCs instead of app-level transactions
(≈ what Unit of Work gives you in a server you control), and a
feature-based folder structure for high cohesion / low coupling.

## Database

See [database.md](database.md) for tables, RLS, and RPCs.

## ADRs

See [docs/adr/](adr/) for the reasoning behind the biggest structural
decisions in this refactor and the work that followed it.
