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

4. Apply `supabase-schema.sql` to your Supabase project.

   If you already applied the earlier prototype schema, also run `supabase-publish-update.sql` once. It updates Row Level Security so authenticated staff can create locations and apartments from the app.

5. Start development:

   ```bash
   npm run dev
   ```

## Production Build

```bash
npm run build
npm run preview
```

## Deploy To Netlify

This repo includes `netlify.toml` with the Vite build command and SPA redirects.

Before publishing, add these environment variables in Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy:

```bash
npx netlify deploy
npx netlify deploy --prod
```

Use the preview deploy first, confirm login and database access, then publish to production.
