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
  app/                   App.jsx — router, lazy-loaded routes, top-level providers
  components/            Cross-feature navigation chrome with no data of its own
                          (AppLayout, BottomNav, More) — not a "feature" because
                          it doesn't own a table or a business concept.
  features/
    <feature>/
      api.js              The ONLY file allowed to call supabase.from('<table>')
                           for that table (see "Table ownership" below).
      validators.js        Form validation (zod schemas or plain functions).
      use<Thing>.js         Hooks that compose api.js calls + React state.
      selectors.js          Pure aggregation/derivation functions (Reports only —
                           extracted because that page's "business logic" is
                           non-trivial grouping/summing, not just a fetch).
      components/
        <Thing>Page.jsx     The default-exported page component.
        <SubComponent>.jsx  Page-local presentational pieces.
      *.test.js / *.test.jsx  Co-located with what they test.
  shared/
    ui/                   Button, Card, Dialog, Input, Label, Select, Badge —
                           generic, feature-agnostic primitives.
    lib/                  supabase client, bookingUtils (formatting), cn,
                           receiptGenerator.
    hooks/                useSupabaseQuery — the fetch/loading/error/refetch
                           hook every feature's data-loading hook is built on.
    constants/            status.js — the single source of truth for booking/
                           payment/apartment status enums and their badge
                           variants (mirrors the DB CHECK constraints).
    components/           ErrorBoundary.
  test/                   Vitest setup (jest-dom matchers).
```

## Table ownership

Each Postgres table has exactly one feature's `api.js` that's allowed to
query it directly:

| Table | Owner |
|---|---|
| `auth.users` / `profiles` | `features/auth/api.js` |
| `locations` | `features/locations/api.js` |
| `apartments` | `features/apartments/api.js` |
| `clients` | `features/clients/api.js` |
| `bookings` | `features/bookings/api.js` |
| `payments` | `features/payments/api.js` |

Other features call into the owning feature's `api.js` rather than
querying the table themselves — e.g. `payments/api.js` calls
`listApartmentIds()` from `apartments/api.js` and
`listBookingIdsForApartments()` from `bookings/api.js` to scope payments
by location, instead of joining across tables itself. `dashboard` and
`reports` own no table at all; they're pure composition over the other
features' `api.js` functions plus their own derived view-model (a hook in
`dashboard`, a hook + `selectors.js` in `reports`, since its aggregation
logic is substantial enough to warrant its own pure, tested module).

**Watch for cycles.** `bookings/api.js` deliberately does not import
`features/payments/api.js`, even though creating a booking can involve
recording its first payment — because `payments/api.js` already imports
from `bookings/api.js` (to resolve booking IDs for location-scoping). The
"create booking, then optionally record its first payment" sequence is
orchestrated by `NewBookingPage` itself instead, since that's page-level
workflow, not something either feature's data layer should own.

## Conventions

- **`api.js` functions throw, they don't return `{ data, error }`.** Callers
  (hooks or components) catch and surface the error; nothing silently
  swallows a Supabase error.
- **Validation lives in `validators.js`**, not inline in the component. Most
  use `zod`; a few (payment-amount-vs-balance, cancellation reason) are
  plain functions because they don't fit a schema cleanly or have
  different semantics depending on context (e.g. an initial booking
  payment may be `0`; a payment against an existing balance may not).
- **`useSupabaseQuery(queryFn, deps)`** replaces the hand-rolled
  `useState(loading/error/data) + useEffect` pattern that used to be
  duplicated in every page.
- **Status enums and their badge variants** live once in
  `shared/constants/status.js`, imported by both forms (`<Select>` options)
  and list/detail views (`Badge` color), instead of each page defining its
  own status-to-color map.
- **No business logic in page components.** Booking creation, payment
  recording, status transitions, and report aggregation all live in
  `api.js`/`selectors.js`/hooks; components wire user interaction to those
  functions and render the result.

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

See [docs/adr/](adr/) for the reasoning behind the four biggest structural
decisions in this refactor.
