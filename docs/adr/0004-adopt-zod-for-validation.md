# ADR 0004: Adopt zod for form validation

## Status
Accepted

## Context

Form validation was previously a set of ad hoc `if` chains duplicated
across forms — most notably "payment amount must be positive and not
exceed the outstanding balance," reimplemented separately in
`NewBooking`, `BookingDetail`, and `Payments`. There was no shared,
testable validation layer, and the audit specifically called out "input
validation" as a security/correctness gap.

## Decision

Add `zod` as the one new runtime dependency this refactor introduces, and
centralize validation in each feature's `validators.js`:
`apartments/validators.js`, `locations/validators.js`,
`bookings/validators.js` (zod schemas for the multi-step booking wizard's
client/apartment steps), and `payments/validators.js`
(`validatePaymentAmount`, now shared by every place that records a
payment against an existing balance).

A few validators stay plain functions instead of zod schemas
(`validateInitialPayment`, `validateCancellationReason`) where the rule
doesn't fit a schema cleanly or has different semantics by context — e.g.
a booking's initial payment may legitimately be `0` ("pay later"), while
a payment against an existing balance must be `> 0`. Forcing both through
one schema would have produced a less honest abstraction than two small
functions.

## Consequences

- Every validator is a plain function returning `{ valid, data/value,
  errors/error }`, independent of any UI framework, so each one is
  covered by its own unit tests rather than only being exercised
  indirectly through a component test.
- Numeric form inputs (which arrive from `<input>` as strings) are
  coerced once, inside the schema (`z.preprocess`), instead of `Number(x)`
  scattered through components.
- This is the only new dependency added in the entire refactor —
  deliberately, to avoid the appearance of pulling in a framework for its
  own sake when a few schemas and functions solve the actual problem.

## Alternatives considered

- **Plain hand-written validator functions only, no library.** Considered
  seriously, since the validation rules here are not especially complex.
  Went with zod anyway for the multi-field forms (apartment, the booking
  wizard's client/apartment steps) where a schema is genuinely clearer
  than a chain of `if`s, and because it's a well-established, tiny,
  dependency-free library — not a heavy framework commitment.
- **react-hook-form + a zod resolver.** Rejected: would have meant
  rewriting every form's state management, not just its validation, for a
  codebase this size — out of scope for fixing the validation gap
  specifically.
