# The Office Pool Hall

Season-long college pick'em pools among friends: an NCAAB confidence pool (pick winners,
assign 5/4/3/2/1 points) and an NCAAF against-the-spread supercontest, run from one engine
configured per pool. Next.js (App Router) + Tailwind + Supabase.

- Build spec: `docs/HANDOFF.md`
- Design system: `docs/design.md`
- Data sources and quotas: `docs/data-sources.md`
- Production setup: `docs/DEPLOY.md`

## Local setup

Needs Node 22+ and Docker.

```sh
npm install
npx supabase start              # local Postgres/Auth/Storage; prints URL + keys
cp .env.example .env.local      # paste the anon + service_role keys from `supabase start`
npx supabase db reset           # applies migrations + seed (fake pool, 5 users, 3 weeks of games)
npx supabase functions serve --env-file .env.local   # ESPN/odds sync functions (separate terminal)
npm run dev                     # http://localhost:3000
```

Sign in as a seeded user (`brooks@example.com` is the commissioner; also `noah@`, `alex@`,
`jordan@`, `sam@` — all `@example.com`). Emails land in Mailpit: http://127.0.0.1:54324.

## Tests

```sh
npm test          # unit tests (settings validation, DST-aware week windows)
npm run test:db   # pgTAP: grading, row-level security, per-game pick locks
```

## How it fits together

| Where | What |
|---|---|
| `supabase/migrations/` | Schema, RLS, and the rules that matter: `submit_picks` (validation + per-game locks using DB time), `grade_slate`, `publish_slate` (freezes ATS lines), `close_slates` |
| `supabase/functions/` | Edge Functions: `sync-schedule` (ESPN), `poll-scores` (ESPN, grades finals), `sync-lines` (The Odds API). Scheduled by pg_cron. |
| `lib/poolSettings.ts` | Everything that varies by pool (zod schema + presets) |
| `app/p/[slug]/picks/` | Pick screen |
| `app/p/[slug]/admin/` | Commissioner tools |

After changing the database schema, regenerate types: `npm run db:types`.
