# VK Luxurious Apartments

Booking, apartment, payment, calendar, client, and reporting management for VK Luxurious Apartments.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Add your Supabase values:

   ```bash
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Apply the SQL migrations to your Supabase project, in order:

   - `supabase-schema.sql` — base tables, RLS, seed data.
   - `supabase-fixes.sql` — `next_booking_ref()`, `record_payment()`.
   - `supabase-publish-update.sql` — RLS update so authenticated staff can create locations and apartments from the app.
   - `supabase-refactor.sql` — `update_booking_status()` and the booking-overlap exclusion constraint.
   - `supabase-monitoring.sql` — `performance_metrics` table and `log_client_metric()`, used by client-side performance monitoring (see below).
   - `supabase-hardening.sql` — revokes the default `PUBLIC` execute grant on the staff-only RPCs.
   - `supabase-error-logging.sql` — widens `performance_metrics.metric_type` to accept `error`, used by the `ErrorBoundary` to report uncaught render errors.
   - `supabase-data-integrity.sql` — adds CHECK constraints on `bookings` (checkout after check-in, `total_amount` matches `rate_per_day × number_of_days`) as a database-level backstop behind the app's own validation.
   - `supabase-realtime.sql` — adds `apartments` and `bookings` to the `supabase_realtime` publication. Required for the Calendar/Dashboard/Apartments pages to live-update when another staff member makes a change — without it, `postgres_changes` subscriptions silently never fire.
   - `supabase-search-path-hardening.sql` — pins `search_path = public` on the `SECURITY DEFINER` functions (`next_booking_ref`, `record_payment`, `update_booking_status`, `log_client_metric`) that didn't already have it, closing a search-path-hijack gap.
   - `supabase-rls-tightening.sql` — drops the permissive `auth_update_bookings` / `auth_insert_payments` policies that let clients bypass the hardened RPCs, constrains booking inserts to fresh unpaid self-owned rows, pins `search_path` on `handle_new_user()`, and caps the anon-writable `log_client_metric()` payload.
   - `supabase-auto-checkout.sql` — adds `auto_checkout_due_bookings()` and a `pg_cron` job that runs at 10:00 Africa/Lusaka daily, checking out any still-checked-in guest whose checkout date has arrived and releasing their apartment. Requires the `pg_cron` extension (enable under Dashboard → Database → Extensions if the `CREATE EXTENSION` line errors).

   See [docs/database.md](docs/database.md) for the full schema reference.

5. **Disable public signups (security-critical).** In the Supabase dashboard, go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". This app is staff-only and every read policy grants access to any authenticated user, so with signups left on (the Supabase default) anyone holding the public anon key — which ships in the client bundle by design — could self-register and read every client, booking, and payment. Create staff accounts yourself under **Authentication → Users**, then set each person's name, role, and location on the app's **Settings** page.

6. Start development:

   ```bash
   npm run dev
   ```

## Tests

```bash
npm run test       # run once
npm run test:watch # watch mode
npm run lint
npm run typecheck  # tsc --noEmit — the whole codebase is TypeScript
```

See [docs/architecture.md](docs/architecture.md) for the codebase layout and conventions.

## Generated types

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run gen:types
```

Writes `src/shared/types/database.types.ts` from your live schema — see
[src/shared/types/README.md](src/shared/types/README.md). Re-run after
any schema change and commit the result.

## Performance monitoring

- **Core Web Vitals** and **slow queries (>1s)** are logged to the
  browser console always, and persisted to the `performance_metrics`
  table (apply `supabase-monitoring.sql` first). View them in the app
  under **Settings → Performance** (admin only).
- **Bundle size**: opt-in only, since the whole `dist/` folder gets
  published — running it on every build would put your bundle breakdown
  at a public URL. Run `ANALYZE=true npm run build` (bash) or
  `$env:ANALYZE='true'; npm run build` (PowerShell), then open the
  resulting `dist/stats.html` locally before deleting `dist/`.

See [docs/adr/0005-client-side-performance-monitoring.md](docs/adr/0005-client-side-performance-monitoring.md).

## Production Build

```bash
npm run build
npm run preview
```

## Deploy To Vercel

This repo includes `vercel.json` with the SPA rewrite and a `www` → apex
redirect for `vkbooking.com`. Vercel auto-detects the Vite build command
and output directory (`npm run build` / `dist`).

Before publishing, add these environment variables in the Vercel project
settings (Production and Preview):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Push to `main` (or open a PR) and Vercel builds and deploys automatically.
Confirm login and database access on the preview deployment before it
promotes to production.
