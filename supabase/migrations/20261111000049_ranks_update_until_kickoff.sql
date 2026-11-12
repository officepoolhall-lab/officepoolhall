-- Team ranks on a game (shown beside team names on My Picks, the Scoreboard and the Grid)
-- used to freeze once the game went on a published slate. A slate is published before the
-- College Football Playoff committee's Tuesday release (and the AP poll's Sunday one), so
-- that week's games kept last week's ranks. Ranks aren't used in scoring, so they now follow
-- ESPN (which switches to the CFP rankings once they're out) until the game kicks off, and
-- hold from then on, so a past game keeps the rank it was played at.
-- Otherwise identical to ingest_espn in 20261017000008_pool_rules.sql.
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
    status = excluded.status,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    neutral_site = excluded.neutral_site,
    tv_network = coalesce(excluded.tv_network, games.tv_network),
    venue = coalesce(excluded.venue, games.venue),
    -- Ranks follow the feed until kickoff, then hold.
    home_rank = case when games.status = 'scheduled' then excluded.home_rank else games.home_rank end,
    away_rank = case when games.status = 'scheduled' then excluded.away_rank else games.away_rank end,
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
