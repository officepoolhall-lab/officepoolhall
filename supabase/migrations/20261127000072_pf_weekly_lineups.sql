-- Playoff Fantasy, weekly style (settings.playoff_fantasy.style = 'weekly', the old NFL.com
-- Playoff Challenge): a lineup per round, 0 = Wild Card ... 3 = Super Bowl. A round with no row
-- uses last round's lineup, carried over. Saved by the server after it checks the change against
-- the playoff schedule (each player locks at his kickoff, or everyone at the round's first), so
-- there's no write access from the browser. Others' lineups are shown by the server only as their
-- players lock; the table itself is readable by the entry's owner, its co-managers and the
-- commissioner.

create table if not exists pf_weekly_lineups (
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  round smallint not null check (round between 0 and 3),
  player_ids text[] not null default '{}',
  edited_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (pool_id, user_id, round)
);
alter table pf_weekly_lineups enable row level security;

drop policy if exists pf_weekly_lineups_read on pf_weekly_lineups;
create policy pf_weekly_lineups_read on pf_weekly_lineups for select using (
  user_id = (select auth.uid())
  or (pool_id::text || ':' || user_id::text) = any ((select my_managed_entries())::text[])
  or pool_id = any ((select my_commissioner_pools())::uuid[])
);
revoke all on pf_weekly_lineups from anon;
grant select on pf_weekly_lineups to authenticated;
