-- Major championships pools (Masters, PGA Championship, U.S. Open, The Open).
-- A golf pool's settings.golf_format is 'season' (one-and-done, the default) or 'majors'.
-- Majors settings live in settings.majors (see lib/golfMajors.ts for the shape and defaults):
--   contest 'tiers' | 'salary'; standings 'cumulative' | 'each';
--   tiers: { count 4|6|8, picks int[], counting int, scoring 'to_par'|'earnings', source };
--   salary: { budget, roster, weight }.
-- Each major is a golf_events row (golf_events.major says which). For each one the admin saves
-- a field: every golfer with world rank, odds, tier (tier contests) and salary (salary cap),
-- then opens picks. Entries pick a lineup of golfers (golf_lineups), checked against the rules
-- by submit_golf_lineup. Scores are worked out in the app from golf_results.

alter table golf_events add column if not exists major text
  check (major in ('masters','pga','us_open','open'));

-- Results: score to par, out of the event (missed cut / withdrew / disqualified), holes played,
-- strokes per round, and hole-by-hole scores (salary cap fantasy points; rostered golfers only).
alter table golf_results add column if not exists to_par int;
alter table golf_results add column if not exists out boolean not null default false;
alter table golf_results add column if not exists thru int;
alter table golf_results add column if not exists rounds int[];
alter table golf_results add column if not exists scorecard jsonb;

-- A major's field as the pool's admin set it up.
create table if not exists golf_field (
  event_id uuid not null references golf_events(id) on delete cascade,
  espn_golfer_id text not null,
  golfer_name text not null,
  world_rank int,
  odds int,            -- American odds to win (e.g. 450 for +450)
  tier int check (tier between 1 and 8),
  salary int check (salary between 0 and 100000),
  primary key (event_id, espn_golfer_id)
);

-- An entry's golfers for one major.
create table if not exists golf_lineups (
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  event_id uuid not null,
  espn_golfer_id text not null,
  golfer_name text not null,
  tier int,
  salary int,
  picked_at timestamptz not null default now(),
  foreign key (event_id, pool_id) references golf_events(id, pool_id) on delete cascade,
  primary key (event_id, user_id, espn_golfer_id)
);
create index if not exists golf_lineups_pool on golf_lineups (pool_id, user_id);

-- Odds to win each major, from The Odds API (DraftKings), stored by the golf-odds function.
-- One row per golfer name per tournament market (odds_key, e.g. golf_masters_tournament_winner).
create table if not exists golf_odds (
  odds_key text not null,
  golfer_name text not null,
  price int not null,
  bookmaker text not null default 'draftkings',
  updated_at timestamptz not null default now(),
  primary key (odds_key, golfer_name)
);

alter table golf_field enable row level security;
alter table golf_lineups enable row level security;
alter table golf_odds enable row level security;

create policy golf_field_read on golf_field for select
  using (exists (select 1 from golf_events e where e.id = golf_field.event_id and is_pool_member(e.pool_id)));

-- Own lineup (and co-managed ones) any time; everyone's once the major has started.
create policy golf_lineups_read on golf_lineups for select
  using (user_id = auth.uid()
         or golf_is_manager(pool_id, user_id)
         or (is_pool_member(pool_id) and exists (
               select 1 from golf_events e
               where e.id = golf_lineups.event_id and (e.start_at <= now() or e.status in ('in_progress','final')))));

create policy golf_odds_read on golf_odds for select using (auth.uid() is not null);

grant select on golf_field, golf_lineups, golf_odds to authenticated;

-- Results ingest: now also to-par, out, thru and rounds. Upserts instead of replacing, so the
-- scorecards stored separately (ingest_golf_scorecards) survive each poll; golfers who've left
-- the leaderboard are removed.
create or replace function ingest_golf_results(p_event_id uuid, p_status text, p_results jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('scheduled','in_progress','final','canceled') then
    raise exception 'Unknown event status: %', p_status;
  end if;
  if (select status from golf_events where id = p_event_id) = 'final' then
    raise exception 'This event is final; its results are frozen';
  end if;

  delete from golf_results
  where event_id = p_event_id
    and espn_golfer_id not in (select r->>'espn_golfer_id' from jsonb_array_elements(p_results) r);

  insert into golf_results (event_id, espn_golfer_id, golfer_name, pos, earnings, to_par, out, thru, rounds)
  select p_event_id,
         r->>'espn_golfer_id',
         r->>'golfer_name',
         r->>'pos',
         coalesce(nullif(r->>'earnings', '')::numeric, 0),
         nullif(r->>'to_par', '')::int,
         coalesce((r->>'out')::boolean, false),
         nullif(r->>'thru', '')::int,
         case when jsonb_typeof(r->'rounds') = 'array'
              then array(select nullif(x, 'null')::int from jsonb_array_elements_text(r->'rounds') x)
         end
  from jsonb_array_elements(p_results) r
  on conflict (event_id, espn_golfer_id) do update
    set golfer_name = excluded.golfer_name,
        pos = excluded.pos,
        earnings = excluded.earnings,
        to_par = excluded.to_par,
        out = excluded.out,
        thru = excluded.thru,
        rounds = excluded.rounds;

  update golf_events set status = p_status where id = p_event_id;
end $$;

-- Hole-by-hole scores for some golfers in an event: [{espn_golfer_id, scorecard}].
create or replace function ingest_golf_scorecards(p_event_id uuid, p_cards jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select status from golf_events where id = p_event_id) = 'final' then
    raise exception 'This event is final; its results are frozen';
  end if;
  update golf_results r
  set scorecard = c->'scorecard'
  from jsonb_array_elements(p_cards) c
  where r.event_id = p_event_id and r.espn_golfer_id = c->>'espn_golfer_id';
end $$;

-- Commissioner: replace a major's field (tiers, salaries, ranks, odds) while picks are still
-- open or not yet open. Lineups already made are kept; a golfer whose tier or salary changed
-- keeps the values saved with the lineup until the entry saves again.
create or replace function golf_admin_save_field(p_event_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event golf_events%rowtype;
begin
  select * into v_event from golf_events where id = p_event_id for update;
  if not found or not is_commissioner(v_event.pool_id) then
    raise exception 'Tournament not found';
  end if;
  if v_event.status <> 'scheduled' or (v_event.start_at is not null and v_event.start_at <= now()) then
    raise exception 'This tournament has started; its field can''t change';
  end if;

  delete from golf_field where event_id = p_event_id;
  insert into golf_field (event_id, espn_golfer_id, golfer_name, world_rank, odds, tier, salary)
  select p_event_id,
         r->>'espn_golfer_id',
         r->>'golfer_name',
         nullif(r->>'world_rank', '')::int,
         nullif(r->>'odds', '')::int,
         nullif(r->>'tier', '')::int,
         nullif(r->>'salary', '')::int
  from jsonb_array_elements(p_rows) r
  where nullif(r->>'espn_golfer_id', '') is not null;

  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_event.pool_id, auth.uid(), 'golf_save_field',
          jsonb_build_object('event_id', p_event_id, 'golfers', jsonb_array_length(p_rows)));
end $$;

-- Commissioner: open picks for a major now (or close them again by passing false).
create or replace function golf_admin_open_picks(p_event_id uuid, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event golf_events%rowtype;
begin
  select * into v_event from golf_events where id = p_event_id for update;
  if not found or not is_commissioner(v_event.pool_id) then
    raise exception 'Tournament not found';
  end if;
  if p_open and not exists (select 1 from golf_field where event_id = p_event_id) then
    raise exception 'Save the field before opening picks';
  end if;
  -- Closed again: an opening time far ahead keeps it shut until reopened.
  update golf_events set picks_open_at = case when p_open then now() else 'infinity'::timestamptz end
  where id = p_event_id;
end $$;

-- Save an entry's lineup for one major, checked against the pool's rules.
create or replace function submit_golf_lineup(p_event_id uuid, p_golfer_ids text[], p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event golf_events%rowtype;
  v_user uuid;
  v_on_behalf boolean;
  v_settings jsonb;
  v_contest text;
  v_picks jsonb;
  v_tier_count int;
  v_need int;
  v_have int;
  v_budget int;
  v_roster int;
  v_total int;
  v_ids text[];
  i int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into v_event from golf_events where id = p_event_id;
  if not found or not is_pool_member(v_event.pool_id) then
    raise exception 'Tournament not found';
  end if;

  v_user := coalesce(p_user_id, auth.uid());
  if not exists (select 1 from pool_members where pool_id = v_event.pool_id and user_id = v_user) then
    raise exception 'You don''t have an entry in this pool';
  end if;
  v_on_behalf := v_user <> auth.uid() and not golf_is_manager(v_event.pool_id, v_user);
  if v_on_behalf and not is_commissioner(v_event.pool_id) then
    raise exception 'Only the commissioner can enter picks for another player';
  end if;
  if not v_on_behalf and not golf_event_open(v_event) then
    if v_event.status = 'scheduled' and (v_event.start_at is null or now() < v_event.start_at) then
      raise exception 'Picks for this tournament aren''t open yet';
    end if;
    raise exception 'Picks for this tournament are locked';
  end if;

  v_ids := array(select distinct x from unnest(p_golfer_ids) x where nullif(btrim(x), '') is not null);
  if cardinality(v_ids) <> cardinality(p_golfer_ids) then
    raise exception 'Each golfer can be picked only once';
  end if;
  if exists (select 1 from unnest(v_ids) x
             where not exists (select 1 from golf_field f where f.event_id = p_event_id and f.espn_golfer_id = x)) then
    raise exception 'One of those golfers isn''t in this tournament''s field';
  end if;

  select settings into v_settings from pools where id = v_event.pool_id;
  v_contest := coalesce(v_settings->'majors'->>'contest', 'tiers');

  if v_contest = 'salary' then
    v_budget := coalesce((v_settings->'majors'->'salary'->>'budget')::int, 50000);
    v_roster := coalesce((v_settings->'majors'->'salary'->>'roster')::int, 8);
    if cardinality(v_ids) <> v_roster then
      raise exception 'Pick % golfers', v_roster;
    end if;
    if exists (select 1 from golf_field f where f.event_id = p_event_id and f.espn_golfer_id = any (v_ids) and f.salary is null) then
      raise exception 'One of those golfers has no salary yet';
    end if;
    select sum(salary) into v_total from golf_field f where f.event_id = p_event_id and f.espn_golfer_id = any (v_ids);
    if v_total > v_budget then
      raise exception 'That lineup is $% over the budget', to_char(v_total - v_budget, 'FM999,999');
    end if;
  else
    v_tier_count := coalesce((v_settings->'majors'->'tiers'->>'count')::int, 6);
    v_picks := coalesce(v_settings->'majors'->'tiers'->'picks',
                        case v_tier_count when 4 then '[2,2,2,2]'::jsonb when 8 then '[1,1,1,1,1,1,1,1]'::jsonb
                                          else '[1,1,1,1,1,3]'::jsonb end);
    if exists (select 1 from golf_field f where f.event_id = p_event_id and f.espn_golfer_id = any (v_ids) and f.tier is null) then
      raise exception 'One of those golfers isn''t in a tier';
    end if;
    for i in 1 .. jsonb_array_length(v_picks) loop
      v_need := (v_picks->>(i - 1))::int;
      select count(*) into v_have from golf_field f
      where f.event_id = p_event_id and f.espn_golfer_id = any (v_ids) and f.tier = i;
      if v_have <> v_need then
        raise exception 'Pick % from Tier % (you have %)', v_need, i, v_have;
      end if;
    end loop;
    if cardinality(v_ids) <> (select sum(x::int) from jsonb_array_elements_text(v_picks) x) then
      raise exception 'That lineup doesn''t match the tiers';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || v_user::text, 0));
  delete from golf_lineups where event_id = p_event_id and user_id = v_user;
  insert into golf_lineups (pool_id, user_id, event_id, espn_golfer_id, golfer_name, tier, salary)
  select v_event.pool_id, v_user, p_event_id, f.espn_golfer_id, f.golfer_name, f.tier, f.salary
  from golf_field f
  where f.event_id = p_event_id and f.espn_golfer_id = any (v_ids);
end $$;

-- Service role: store odds from The Odds API. p_rows: [{golfer_name, price}].
create or replace function ingest_golf_odds(p_odds_key text, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from golf_odds where odds_key = p_odds_key;
  insert into golf_odds (odds_key, golfer_name, price)
  select p_odds_key, r->>'golfer_name', (r->>'price')::int
  from jsonb_array_elements(p_rows) r
  where nullif(r->>'golfer_name', '') is not null and nullif(r->>'price', '') is not null
  on conflict (odds_key, golfer_name) do update set price = excluded.price, updated_at = now();
end $$;

revoke all on function golf_admin_save_field(uuid, jsonb) from public, anon;
revoke all on function golf_admin_open_picks(uuid, boolean) from public, anon;
revoke all on function submit_golf_lineup(uuid, text[], uuid) from public, anon;
grant execute on function golf_admin_save_field(uuid, jsonb) to authenticated;
grant execute on function golf_admin_open_picks(uuid, boolean) to authenticated;
grant execute on function submit_golf_lineup(uuid, text[], uuid) to authenticated;

revoke all on function ingest_golf_results(uuid, text, jsonb) from public, authenticated, anon;
revoke all on function ingest_golf_scorecards(uuid, jsonb) from public, authenticated, anon;
revoke all on function ingest_golf_odds(text, jsonb) from public, authenticated, anon;
grant execute on function ingest_golf_results(uuid, text, jsonb) to service_role;
grant execute on function ingest_golf_scorecards(uuid, jsonb) to service_role;
grant execute on function ingest_golf_odds(text, jsonb) to service_role;

-- Commissioner: add one of the four majors to a Majors pool (ESPN's tournament id), or remove
-- one nobody has picked for yet.
create or replace function golf_admin_add_major(p_pool_id uuid, p_major text, p_espn_id text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_order int;
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can change the tournaments';
  end if;
  if p_major not in ('masters','pga','us_open','open') then
    raise exception 'Unknown major';
  end if;
  if nullif(btrim(p_espn_id), '') is null or btrim(p_espn_id) !~ '^\d+$' then
    raise exception 'Enter ESPN''s tournament id (the number in its leaderboard link)';
  end if;
  if exists (select 1 from golf_events where pool_id = p_pool_id and major = p_major) then
    raise exception 'That major is already in this pool';
  end if;
  -- Calendar order: Masters, PGA Championship, U.S. Open, The Open.
  v_order := array_position(array['masters','pga','us_open','open'], p_major);
  insert into golf_events (pool_id, espn_id, name, sort_order, major)
  values (p_pool_id, btrim(p_espn_id), coalesce(nullif(btrim(p_name), ''), p_major), v_order, p_major)
  returning id into v_id;
  return v_id;
end $$;

create or replace function golf_admin_remove_major(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event golf_events%rowtype;
begin
  select * into v_event from golf_events where id = p_event_id;
  if not found or not is_commissioner(v_event.pool_id) or v_event.major is null then
    raise exception 'Tournament not found';
  end if;
  if exists (select 1 from golf_lineups where event_id = p_event_id) then
    raise exception 'Entries have already picked for this major';
  end if;
  delete from golf_events where id = p_event_id;
end $$;

revoke all on function golf_admin_add_major(uuid, text, text, text) from public, anon;
revoke all on function golf_admin_remove_major(uuid) from public, anon;
grant execute on function golf_admin_add_major(uuid, text, text, text) to authenticated;
grant execute on function golf_admin_remove_major(uuid) to authenticated;

-- DraftKings odds for the pools' upcoming majors, twice a day (golf-odds needs ODDS_API_KEY).
select cron.schedule('golf-odds', '23 5,17 * * *', $$select public.invoke_edge_function('golf-odds')$$);
