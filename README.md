# The Office Pool Hall

Season-long college pick'em pools (NCAAB confidence pool, NCAAF ATS supercontest).
Next.js (App Router) + Tailwind + Supabase. Build spec: `docs/HANDOFF.md`.

## Local setup

```sh
npm install
npx supabase start          # needs Docker; prints local URL + keys
cp .env.example .env.local  # paste the anon + service_role keys from `supabase start`
npx supabase db reset       # applies migrations + seed
npm run dev
```

Magic-link emails in local dev land in Mailpit: http://127.0.0.1:54324
