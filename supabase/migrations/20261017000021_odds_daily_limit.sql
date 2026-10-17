-- The Odds API costs credits per call, and lines only matter when a slate is published,
-- so pull at most once per sport per day (Central). The first caller of the day — the
-- morning cron job or a commissioner's "Refresh lines" — inserts that day's row; any
-- later call sees the row and skips. One call covers every bookmaker the pools use.
create table odds_pulls (
  sport text not null check (sport in ('ncaab','ncaaf')),
  pull_date date not null default (now() at time zone 'America/Chicago')::date,
  pulled_at timestamptz not null default now(),
  bookmakers text[],
  events int,
  lines int,
  quota_remaining int,
  primary key (sport, pull_date)
);
alter table odds_pulls enable row level security;
-- No policies: written and read by the sync-lines Edge Function (service role).

-- Was every 2 hours; once each morning is plenty with the daily limit (13:00 UTC = 8 CDT / 7 CST).
select cron.unschedule('sync-lines');
select cron.schedule('sync-lines', '0 13 * * *', $$select public.invoke_edge_function('sync-lines')$$);
