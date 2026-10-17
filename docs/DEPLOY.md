# Deploying The Office Pool Hall

One-time setup for production. Free tiers throughout (Supabase Free, Vercel Hobby,
Resend Free, The Odds API Free) — see `docs/data-sources.md` for quotas.

## 1. Supabase project
1. Create the project at supabase.com (region near Central US). Note the **project ref**
   (Project Settings → General) and the **anon** and **service_role** keys (Project Settings → API).
2. Link this repo locally (once per machine):
   ```sh
   npx supabase login
   npx supabase link --project-ref <ref>
   ```
3. Migrations. Either:
   - **GitHub integration** (already connected): pushing `main` applies `supabase/migrations/*`.
   - or by hand: `npx supabase db push`.
   The seed (`supabase/seed.sql`, fake users and games) is **local only** and never runs in production.
4. Edge Functions + their secret:
   ```sh
   npx supabase functions deploy sync-schedule
   npx supabase functions deploy poll-scores
   npx supabase functions deploy sync-lines
   npx supabase secrets set ODDS_API_KEY=<key from the-odds-api.com>
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.)
5. Let pg_cron call the functions — run once in the SQL editor:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<service_role key>', 'service_role_key');
   ```
   Check the jobs: `select jobname, schedule from cron.job;` and recent runs:
   `select * from cron.job_run_details order by start_time desc limit 20;`
6. Auth (Authentication → URL Configuration):
   - Site URL: `https://<your domain>`
   - Redirect URLs: `https://<your domain>/**`
7. Email templates (Authentication → Email Templates): paste
   `supabase/templates/magic_link.html` into **Magic Link** and
   `supabase/templates/confirmation.html` into **Confirm signup**. The hosted project does not
   read `config.toml`. These use `token_hash` links so sign-in works even when the email
   opens in a different browser (common on phones).

## 2. Email via Resend
Supabase's built-in sender is for testing only (heavily rate-limited), so real players need
custom SMTP.
1. Resend → Domains → add your domain. It lists DNS records (MX + SPF TXT on `send`,
   DKIM TXT at `resend._domainkey`, optional DMARC TXT).
2. **Namecheap** → Domain List → Manage → **Advanced DNS**:
   - Host field takes only the subdomain part (`send`, `resend._domainkey`) — Namecheap appends the domain.
   - The MX record goes under **Mail Settings → Custom MX**. If you use Namecheap email
     forwarding on the root domain, check that switching to Custom MX doesn't disable it.
   - Back in Resend, click Verify (usually < 30 min).
3. Supabase → Authentication → **SMTP Settings**: enable custom SMTP —
   host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key,
   sender e.g. `picks@<your domain>`, name "The Office Pool Hall".

## 3. Vercel
1. Import the GitHub repo in Vercel (framework: Next.js, defaults are fine).
2. Environment variables (Production + Preview):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only — never prefix with `NEXT_PUBLIC_`) |
   | `NEXT_PUBLIC_APP_URL` | `https://<your domain>` |
   | `SENTRY_DSN` | optional |
3. Domain: Vercel → Project → Settings → Domains → add it, then in Namecheap Advanced DNS
   add exactly the records Vercel shows (typically an `A` record for `@` and a `CNAME` for `www`).

## 4. First run (before Week 1)
1. Sign in at your domain with your email (magic link).
2. Start the pool at `/pools/new` (NCAAB Confidence Pool preset).
   The person who creates it is the commissioner.
3. Admin → Slate → New week → **Sync ESPN schedule** → add games → Publish.
4. Admin → Roster → copy the invite link → text it to the group.

## Checks
- `npm test` (unit), `npm run test:db` (pgTAP: grading, RLS, pick locks — needs `supabase start`).
- If scores stop updating: `select * from cron.job_run_details order by start_time desc limit 10;`
  and the function logs in the Supabase dashboard (Edge Functions → poll-scores → Logs).
  Commissioners can always fix a result under Admin → Results.
