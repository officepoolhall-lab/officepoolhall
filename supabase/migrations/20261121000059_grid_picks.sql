-- The Grid reads every pick on a week. Through the picks_read policy that runs several lookups
-- (pool access, co-manager, game started/locked) for each pick, which for a college basketball
-- week (many games × every entry) means thousands of checks and seconds of load time.
-- grid_picks applies exactly the same rules once per week instead: it checks access to the pool
-- once, works out which games are revealed once, and returns the picks as one JSON array
-- (so there is no 1000-row page limit either).

create or replace function grid_picks(p_slate_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (
    select s.id, s.pool_id, s.status, s.lock_at, p.sport
    from slates s join pools p on p.id = s.pool_id
    where s.id = p_slate_id
  ),
  viewer as (
    select can_view_pool((select pool_id from s)) as ok
  ),
  managed as (
    select em.owner_id
    from entry_managers em
    where em.pool_id = (select pool_id from s) and em.manager_id = auth.uid()
  ),
  revealed as (
    select sg.game_id
    from slate_games sg
    join games g on g.id = sg.game_id
    cross join s
    where sg.slate_id = p_slate_id
      and (select ok from viewer)
      and (s.status = 'graded'
           or game_started(g.start_at, g.time_tbd, g.status)
           or (s.sport = 'ncaab' and (s.status = 'locked'
                 or game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, s.lock_at)))))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', pk.user_id, 'game_id', pk.game_id, 'picked_side', pk.picked_side,
           'confidence', pk.confidence, 'result', pk.result, 'points', pk.points,
           'bonus', pk.bonus, 'edited_by', pk.edited_by)
         order by pk.user_id, pk.game_id), '[]'::jsonb)
  from picks pk
  where pk.slate_id = p_slate_id
    and (pk.user_id = auth.uid()
         or pk.user_id in (select owner_id from managed)
         or pk.game_id in (select game_id from revealed));
$$;

grant execute on function grid_picks(uuid) to authenticated, anon;
