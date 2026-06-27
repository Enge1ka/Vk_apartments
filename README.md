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

   See [docs/database.md](docs/database.md) for the full schema reference.

5. Start development:

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
