# Generated Supabase types

This folder holds `database.types.ts`, generated directly from your live
Supabase schema — **not hand-written**, so it can't silently drift from
what's actually deployed (which matters here since schema changes can be
made via the Supabase dashboard, not just through the `.sql` files in this
repo).

## Generate it

One-time setup:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

Then, any time the schema changes:

```bash
npm run gen:types
```

This writes `database.types.ts` here. **Commit the generated file** —
don't require Supabase CLI auth just to build the app.

## Using the types

```ts
import type { Database } from '@/shared/types/database.types'

type Booking = Database['public']['Tables']['bookings']['Row']
type BookingInsert = Database['public']['Tables']['bookings']['Insert']
```

The codebase is already TypeScript (see `docs/adr/0006-typescript-migration.md`),
but this file doesn't exist yet, so every feature's `api.ts` currently
hand-declares its own row/input interfaces instead — a deliberate stand-in,
not the end state. Once you generate this file, two things should change:

1. `shared/lib/supabase.ts`: `createClient<Database>(url, key)` instead of
   the untyped `createClient(url, key)` (there's a `// TODO` marking the spot).
2. Each feature's `api.ts`: replace its hand-written interfaces with
   `Database['public']['Tables']['<table>']['Row']`/`['Insert']`, so the
   frontend types stay synchronized with the database by construction
   instead of by someone remembering to update both places.
