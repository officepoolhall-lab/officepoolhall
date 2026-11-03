-- Scores follow the team, not ESPN's home/away label.
--
-- A game's home and away teams are fixed when it is first stored, and picks are saved by side
-- ('home' or 'away'), so the stored sides must not change. But ESPN sometimes lists the two
-- teams the other way round (common on neutral courts), and the 20261017000008 upsert wrote
-- ESPN's home score into whichever team is stored as home. A game could then show the wrong
-- score and grade the wrong side as the winner. This version maps ESPN's scores and AP ranks
-- to the stored sides by team id. Same contract and start-time rules as 20261017000008.
-- Games already stored with swapped scores are not corrected here; see the repair notes.

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
    home_score = case when games.home_team_id = excluded.home_team_id then excluded.home_score else excluded.away_score end,
    away_score = case when games.home_team_id = excluded.home_team_id then excluded.away_score else excluded.home_score end,
    neutral_site = excluded.neutral_site,
    tv_network = coalesce(excluded.tv_network, games.tv_network),
    venue = coalesce(excluded.venue, games.venue),
    -- Ranks are "AP rank at slate time": freeze them once the game is on a published slate.
    home_rank = case when exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
                                  where sg.game_id = games.id and s.status <> 'draft')
                     then games.home_rank else case when games.home_team_id = excluded.home_team_id then excluded.home_rank else excluded.away_rank end end,
    away_rank = case when exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
                                  where sg.game_id = games.id and s.status <> 'draft')
                     then games.away_rank else case when games.home_team_id = excluded.home_team_id then excluded.away_rank else excluded.home_rank end end,
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
