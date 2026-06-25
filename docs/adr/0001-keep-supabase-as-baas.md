# ADR 0001: Keep Supabase as the backend instead of building a custom server

## Status
Accepted

## Context

The original refactor brief asked for Clean Architecture, DDD, CQRS, Unit
of Work, a repository pattern, controllers, and a layered backend
(Domain/Application/Infrastructure/Presentation). The actual codebase is a
~3,300-line React SPA that uses Supabase for Postgres, Auth, Row Level
Security, and `SECURITY DEFINER` RPCs — there is no Express/Nest/etc.
server, and the app has no need for one beyond what Supabase already
provides.

## Decision

Keep Supabase as the backend. Do not introduce a custom API server, an
ORM, a migrations framework beyond plain `.sql` files, or backend-layer
patterns (DDD bounded contexts, CQRS, Unit of Work) that assume a server
process the team would have to build, deploy, and operate.

## Consequences

- Patterns like "repository" and "application service" are approximated
  by conventions instead (one `api.js` per table — see
  [architecture.md](../architecture.md#table-ownership) — and validators/
  hooks instead of a service layer), not implemented as literal classes.
- Atomicity for multi-step writes (recording a payment, transitioning a
  booking's status) is achieved with Postgres `SECURITY DEFINER` functions
  (`record_payment`, `update_booking_status`) rather than an app-level Unit
  of Work, since Supabase's client has no multi-statement transaction API
  from the browser.
- Authorization for anything more granular than "authenticated or not" is
  enforced in RLS policies and RPCs, not in application middleware.
- If the product ever needs a custom server (background jobs, third-party
  webhooks, heavier compute), that would be a new ADR and a real
  architectural shift — not a default to design around speculatively today.

## Alternatives considered

- **Build a custom backend to host the requested patterns.** Rejected:
  this would mean inventing infrastructure that doesn't serve the product
  today, contradicting the YAGNI/KISS principles also requested in the
  same brief, and meaningfully increasing what a small operation has to
  run and maintain.
