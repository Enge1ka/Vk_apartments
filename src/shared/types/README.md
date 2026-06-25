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

Once this repo migrates to TypeScript, every feature's `api.js` (→
`api.ts`) should import its table's `Row`/`Insert`/`Update` types from
here instead of hand-declaring interfaces, so the frontend types stay
synchronized with the database by construction.
