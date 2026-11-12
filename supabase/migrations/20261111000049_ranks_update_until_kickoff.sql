-- Team ranks on a game (shown beside team names on My Picks, the Scoreboard and the Grid)
-- used to freeze once the game went on a published slate, which is before the AP poll
-- (Monday) and the CFP rankings (Tuesday), so a week's games kept last week's ranks. Ranks
-- aren't used in scoring, so they now always match ESPN's for that game, including games
-- already played (re-read by the sync-ranks function).
-- Both sports: one ingest serves football and basketball.
-- Final games keep their status and scores. Otherwise identical to ingest_espn in 20261102000037_ingest_score_sides.sql (scores and
-- ranks mapped to the stored sides by team id).

create or replace function ingest_espn(p_sport text, p_teams jsonb, p_games jsonb)
returns setof uuid
language plpgsql security definer set search_path = public as $$
declare
  v_slate_id uuid;
begin
  insert into teams (sport, espn_id, name, short_name, abbreviation, logo_url, conference, odds_api_name)
  select p_sport, t.espn_id, t.name, t.short_name, t.abbreviation, t.logo_url, t.conference,
         t.name   -- best guess; The Odds API usually uses ESPN's display name. Fix mismatches in the admin queue.
  from jsonb_to_recordset(coalesce(p_teams, '[]')) as t(
    espn_id text, name text, short_name text, abbreviation text, logo_url text, conference text)
  where t.espn_id is not null
  on conflict (sport, espn_id) do update set
    name = excluded.name,
    short_name = excluded.short_name,
    abbreviation = excluded.abbreviation,
    logo_url = coalesce(excluded.logo_url, teams.logo_url),
    conference = coalesce(excluded.conference, teams.conference);

  insert into games (sport, season, home_team_id, away_team_id, neutral_site, start_at, time_tbd, status,
                     home_score, away_score, espn_id, tv_network, home_rank, away_rank, venue)
  select p_sport, g.season, h.id, a.id, coalesce(g.neutral_site, false), g.start_at, coalesce(g.time_tbd, false),
         g.status, g.home_score, g.away_score, g.espn_id, g.tv_network, g.home_rank, g.away_rank, g.venue
  from jsonb_to_recordset(coalesce(p_games, '[]')) as g(
    espn_id text, season int, home_espn_id text, away_espn_id text, start_at timestamptz, time_tbd boolean,
    status text, home_score int, away_score int, neutral_site boolean, tv_network text, home_rank int, away_rank int,
    venue text)
  join teams h on h.sport = p_sport and h.espn_id = g.home_espn_id
  join teams a on a.sport = p_sport and a.espn_id = g.away_espn_id
  on conflict (espn_id) do update set
    start_at = case
      when excluded.time_tbd and games.manual_time then games.start_at
      when game_time_frozen(games.id, games.start_at, games.time_tbd, games.status,
                            excluded.start_at, excluded.time_tbd, excluded.status) then games.start_at
      else excluded.start_at end,
    time_tbd = case
      when excluded.time_tbd and games.manual_time then false
      when game_time_frozen(games.id, games.start_at, games.time_tbd, games.status,
                            excluded.start_at, excluded.time_tbd, excluded.status) then games.time_tbd
      else excluded.time_tbd end,
    manual_time = case
      when excluded.time_tbd and games.manual_time then true
      when game_time_frozen(games.id, games.start_at, games.time_tbd, games.status,
                            excluded.start_at, excluded.time_tbd, excluded.status) then games.manual_time
      else false end,
    -- A game already final (and graded) keeps its status and scores: re-reading past days for
    -- ranks must not change a result without re-grading it.
    status = case when games.status = 'final' then games.status else excluded.status end,
    home_score = case when games.status = 'final' then games.home_score
                      when games.home_team_id = excluded.home_team_id then excluded.home_score else excluded.away_score end,
    away_score = case when games.status = 'final' then games.away_score
                      when games.home_team_id = excluded.home_team_id then excluded.away_score else excluded.home_score end,
    neutral_site = excluded.neutral_site,
    tv_network = coalesce(excluded.tv_network, games.tv_network),
    venue = coalesce(excluded.venue, games.venue),
    -- Ranks are whatever ESPN shows for the game (mapped to the stored sides), always.
    home_rank = case when games.home_team_id = excluded.home_team_id then excluded.home_rank else excluded.away_rank end,
    away_rank = case when games.home_team_id = excluded.home_team_id then excluded.away_rank else excluded.home_rank end,
    updated_at = now();

  -- A moved tip can move a first-day group's deadline on an open slate.
  for v_slate_id in
    select distinct s.id
    from slates s
    join slate_games sg on sg.slate_id = s.id
    join games g on g.id = sg.game_id
    where s.status = 'open'
      and g.espn_id in (select e->>'espn_id' from jsonb_array_elements(coalesce(p_games, '[]')) e)
  loop
    perform refresh_slate_locks(v_slate_id);
  end loop;

  return query
    select g.id from games g
    where g.espn_id in (select e->>'espn_id' from jsonb_array_elements(coalesce(p_games, '[]')) e)
      and g.status = 'final';
end;
$$;

-- Every hour, re-read the last 8 days and the next 3 (sync-ranks), so new polls reach this
-- week's games, played or not. cron.schedule with an existing name replaces that job.
select cron.schedule('sync-ranks', '17 * * * *', $$select public.invoke_edge_function('sync-ranks', '{"back": 8, "days": 3}')$$);
