# ADR 0005: Client-side performance monitoring without a vendor

## Status
Accepted

## Context

Senior-dev review feedback on the architecture refactor asked for
performance monitoring: bundle sizes, page load times, slow queries,
render performance, Core Web Vitals — "optimize based on evidence."
There was no decision yet on an observability vendor (Sentry et al. was
flagged separately as needing a budget/vendor decision the user hadn't
made), so this needed to deliver real signal without assuming one.

## Decision

- **Core Web Vitals** (CLS, FCP, INP, LCP, TTFB): the `web-vitals`
  library, wired up once in `features/monitoring/reportWebVitals.js`.
- **Slow queries**: `shared/hooks/useSupabaseQuery` now times every
  fetch and emits the result through a new generic pub/sub,
  `shared/lib/metrics.js`. Anything over 1000ms always logs a
  `console.warn`, with zero setup required — this works even before the
  rest of this ADR's plumbing exists.
- **Persistence**: a new `performance_metrics` table
  (`supabase-monitoring.sql`), written to via a `log_client_metric()` RPC
  (the user explicitly chose this over "console only" when asked, since
  console output isn't queryable after the fact). Only Core Web Vitals
  and *slow* queries are persisted — not every query on every page load,
  which would be noise.
- **Bundle size**: handled separately, locally, with no backend —
  `rollup-plugin-visualizer` writes `dist/stats.html` on every build.
- **A way to actually see the data**: a read-only "Performance" tab in
  the existing admin Settings page, rather than leaving the table
  write-only. Built specifically so `listMetrics()` (the read path) has a
  real caller — see the "no unused code" note below.

**Explicitly deferred:** render-performance profiling (React's
`<Profiler>` API wrapped around components). Wiring it everywhere would
be a much larger, more invasive change for a benefit Core Web Vitals'
INP/LCP already partially captures; flagged as a gap, not silently
dropped.

## Consequences

- No vendor lock-in, no new paid service, no DSN/API key to manage.
- The `performance_metrics` table is another table to maintain (RLS,
  index, eventual retention/cleanup — there's no automatic pruning yet,
  which will need attention if this runs for a long time).
- This is meaningfully less sophisticated than a real observability
  product: no alerting, no dashboards beyond the one simple tab, no
  correlation with backend traces (there is no backend to trace — see
  ADR 0001). If/when an observability vendor is chosen, `logMetric()` and
  `reportWebVitals()` are the two call sites that would forward to it
  instead of (or in addition to) this table.
- `shared/lib/metrics.js` had to be justified specifically as
  shared-layer code despite "shared doesn't depend on features" usually
  meaning shared has no business logic: it's a generic, feature-agnostic
  event bus with zero knowledge of `performance_metrics` or Supabase —
  the feature-specific part (what to do with an event) lives entirely in
  `features/monitoring/`.

## Alternatives considered

- **Console-only, no persistence.** This was the first option offered;
  the user chose persistence instead specifically so metrics survive
  past the browser session and are queryable later. Console warnings are
  kept anyway, since they're useful during active development regardless
  of what happens with persistence.
- **Log every query, not just slow ones.** Rejected for volume: a
  small-team internal tool's most-visited pages (Dashboard, Reports) fire
  five-plus queries on every load — persisting all of them would make the
  table mostly noise within days, with no proportional benefit over just
  watching for the slow outliers.
