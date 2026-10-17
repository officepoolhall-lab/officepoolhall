-- ESPN ingestion (HANDOFF.md §6.4). Called by the sync-schedule / poll-scores Edge
-- Functions with the service role.

-- ESPN marks unannounced tip times with timeValid=false and a midnight-ET placeholder.
-- The slate editor warns about these: a pick on one locks at the placeholder.
alter table games add column time_tbd boolean not null default false;

-- Upsert teams and games from an ESPN feed in one transaction.
--   p_teams: [{espn_id, name, short_name, abbreviation, logo_url, conference}]
--   p_games: [{espn_id, season, home_espn_id, away_espn_id, start_at, time_tbd, status,
--              home_score, away_score, neutral_site, tv_network, home_rank, away_rank}]
-- Returns the ids of games in the feed that are final, for grading.
create or replace function ingest_espn(p_sport text, p_teams jsonb, p_games jsonb)
returns setof uuid
language plpgsql security definer set search_path = public as $$
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
                     home_score, away_score, espn_id, tv_network, home_rank, away_rank)
  select p_sport, g.season, h.id, a.id, coalesce(g.neutral_site, false), g.start_at, coalesce(g.time_tbd, false),
         g.status, g.home_score, g.away_score, g.espn_id, g.tv_network, g.home_rank, g.away_rank
  from jsonb_to_recordset(coalesce(p_games, '[]')) as g(
    espn_id text, season int, home_espn_id text, away_espn_id text, start_at timestamptz, time_tbd boolean,
    status text, home_score int, away_score int, neutral_site boolean, tv_network text, home_rank int, away_rank int)
  join teams h on h.sport = p_sport and h.espn_id = g.home_espn_id
  join teams a on a.sport = p_sport and a.espn_id = g.away_espn_id
  on conflict (espn_id) do update set
    -- Once a game has started (by our clock) its start_at never moves: moving it later
    -- would unfreeze picks that other players have already seen.
    start_at = case when games.start_at <= now() then games.start_at else excluded.start_at end,
    time_tbd = case when games.start_at <= now() then games.time_tbd else excluded.time_tbd end,
    status = excluded.status,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    neutral_site = excluded.neutral_site,
    tv_network = coalesce(excluded.tv_network, games.tv_network),
    -- Ranks are "AP rank at slate time": freeze them once the game is on a published slate.
    home_rank = case when exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
                                  where sg.game_id = games.id and s.status <> 'draft')
                     then games.home_rank else excluded.home_rank end,
    away_rank = case when exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
                                  where sg.game_id = games.id and s.status <> 'draft')
                     then games.away_rank else excluded.away_rank end,
    updated_at = now();

  return query
    select g.id from games g
    where g.espn_id in (select e->>'espn_id' from jsonb_array_elements(coalesce(p_games, '[]')) e)
      and g.status = 'final';
end;
$$;

revoke execute on function ingest_espn(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function ingest_espn(text, jsonb, jsonb) to service_role;

-- Commissioner maps an unmatched Odds API name to a team.
create or replace function resolve_team_match(p_queue_id bigint, p_team_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_q team_match_queue%rowtype;
begin
  if not exists (select 1 from pool_members where user_id = auth.uid() and role = 'commissioner') then
    raise exception 'Only a commissioner can match teams';
  end if;
  select * into v_q from team_match_queue where id = p_queue_id for update;
  if not found then
    raise exception 'Queue item not found';
  end if;
  if v_q.source = 'odds_api' then
    update teams set odds_api_name = v_q.raw_name where id = p_team_id and sport = v_q.sport;
    if not found then
      raise exception 'Team not found for %', v_q.sport;
    end if;
  end if;
  update team_match_queue set resolved = true where id = p_queue_id;
end;
$$;
