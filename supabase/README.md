# Database (Supabase)

- `migrations/` — schema changes, applied in filename order. Production gets them through the
  Supabase ↔ GitHub integration when a change lands on `main` (check the Supabase status on the
  merge commit). By hand: `npx supabase db push`.
- `tests/` — pgTAP tests (`npm run test:db`, needs `supabase start`).
- `functions/` — Edge Functions (score poller, schedule and line sync). Deploy with
  `npx supabase functions deploy <name>`.
- `seed.sql` — local fake data only; never runs in production.

If a migration didn't reach production, its SQL can be pasted into Supabase → SQL Editor;
every migration here is written to be safe to run again.
