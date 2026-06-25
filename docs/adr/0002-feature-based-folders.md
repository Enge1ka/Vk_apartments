# ADR 0002: Feature-based folders over layer-based folders

## Status
Accepted

## Context

The original codebase organized files by technical layer:
`src/pages/*.jsx`, `src/hooks/*.js`, `src/components/*.jsx`,
`src/lib/*.js`. Each page hand-rolled its own Supabase queries, so the
same location-scoping logic (resolve a restricted user's apartment IDs,
then filter bookings/payments by them) was independently reimplemented in
five different pages.

## Decision

Organize by feature/domain concept instead: `src/features/<feature>/` —
`bookings`, `payments`, `apartments`, `locations`, `clients`, `auth`,
`calendar`, `dashboard`, `reports`, `settings` — each with its own
`api.js`, `validators.js`, hooks, and `components/`. Cross-cutting,
feature-agnostic code (the UI kit, `supabase` client, `cn` helper,
`useSupabaseQuery`, status constants) lives in `src/shared/`.

## Consequences

- A feature's data-access, validation, and presentation live together,
  making "what touches the `bookings` table" a one-folder question instead
  of a cross-repo grep.
- Cross-feature reuse is now explicit imports between `api.js` modules
  (e.g. `payments/api.js` imports `listApartmentIds` from
  `apartments/api.js`) instead of copy-pasted query logic — this is what
  eliminated the location-scoping duplication described in the audit.
- It surfaces dependency direction as a real design concern: see ADR 0003
  and the "Watch for cycles" note in architecture.md, which only became
  visible once `bookings` and `payments` could plausibly import each
  other.
- Pages that are pure navigation/composition with no table of their own
  (`Dashboard`, `Reports`, the `More` menu) don't get forced into an
  artificial "owns nothing" feature folder unless they have enough of
  their own logic to warrant one (Reports does, via `selectors.js`;
  `More` doesn't, and stays in `src/components` next to `AppLayout`/
  `BottomNav`).

## Alternatives considered

- **Layer-based folders (`controllers/`, `services/`, `repositories/`).**
  Rejected: this is the structure that was already in place in spirit
  (`pages/`, `hooks/`, `lib/`) and is what produced the duplication this
  refactor is fixing. It also doesn't map cleanly onto a BaaS app with no
  controller layer (see ADR 0001).
