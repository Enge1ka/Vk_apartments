# ADR 0003: Atomic Postgres RPCs over multi-step client-side writes

## Status
Accepted

## Context

Two real bugs were found during the audit, both from the same root cause:
a logical "one operation" was implemented as multiple separate
`supabase.from(...).update(...)` calls from the browser, with no
transaction tying them together.

1. **Booking status transitions.** Checking a booking in/out or cancelling
   it updated `bookings.booking_status` and `apartments.status` in two
   separate calls. If the second failed, the booking and its apartment
   went out of sync (e.g. a "checked_out" booking whose apartment stayed
   "occupied" forever).
2. Relatedly, cancellation was only ever hidden from non-admins in the
   UI (`{isAdmin && <option value="cancelled">}`) — the `bookings` RLS
   update policy just checked `true`, so a non-admin could cancel a
   booking by calling the same update directly.

`record_payment()` (added before this refactor, in `supabase-fixes.sql`)
already solved the equivalent problem for payments: lock the booking row,
do every write in one Postgres transaction, derive identity from
`auth.uid()` instead of trusting client-supplied IDs.

## Decision

Add `update_booking_status(p_booking_id, p_new_status, p_notes)` following
the same pattern: `SECURITY DEFINER`, locks the booking row
(`FOR UPDATE OF b`), updates `apartments.status` and
`bookings.booking_status`/`notes` in one transaction, and checks the
caller's role/location server-side (including a hard `RAISE EXCEPTION` if
a non-admin attempts `cancelled`).

Also add a `gist` `EXCLUDE` constraint on `bookings(apartment_id,
daterange(check_in_date, check_out_date))` so the database — not a
client-side check-then-insert that can race — is what actually prevents
two overlapping bookings for the same apartment.

## Consequences

- The client-side overlap check (`hasOverlappingBooking`) is now only a
  fast pre-flight for a friendlier error message; the exclusion constraint
  is the real guard, so the UX degrades gracefully (a clear toast) instead
  of silently allowing a double-booking under concurrent writes.
- Any future booking-status feature must go through
  `update_booking_status()`, not a direct `bookings` update — this is
  enforced by convention (only `bookings/api.js` calls it) rather than by
  RLS, since RLS alone can't express "only via this specific transition
  path."
- Adding a new status transition rule (e.g. a future refund flow) means
  editing the RPC and re-running a migration, not just shipping a client
  change — a deliberate trade-off: the safety property is worth the extra
  step of touching SQL.

## Alternatives considered

- **Wrap the two updates in a client-side retry/rollback.** Rejected:
  there's no real transaction available from the browser; a "rollback"
  would just be another fallible network call, not a guarantee.
- **Enforce cancellation-is-admin-only purely in RLS.** Rejected: RLS
  policies on `bookings` can't easily express "this UPDATE may only set
  `booking_status` to `cancelled` if `auth.uid()`'s profile role is
  admin" without either a much more complex policy or moving the check
  into a function regardless — so the RPC was the simpler, single place
  to put it.
