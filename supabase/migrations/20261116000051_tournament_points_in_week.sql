-- In-season tournament champion picks count toward the week they're set in (added to that
-- week's slate_scores by grade_slate). Conference tournaments ('champion_only') and the NCAA
-- bracket stay separate. grade_tournament regrades the pool's weeks when results change.

create or replace function grade_slate(p_slate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_confidence boolean;
  v_minus boolean;
  v_upset jsonb;
  v_last numeric;
  v_complete boolean;
  v_closed boolean;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or v_slate.status = 'draft' then
    return;
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;
  v_confidence := jsonb_typeof(v_settings->'confidence') = 'object';
  v_minus := v_confidence and coalesce(v_settings->'confidence'->>'wrong_pick', 'zero') = 'minus_points';
  v_upset := case when jsonb_typeof(v_settings->'upset_bonus'->'tiers') = 'array'
                  then v_settings->'upset_bonus'->'tiers' end;
  -- grade_game also regrades open slates as games finish. A player with no picks yet can
  -- still pick, so a week only counts as missed once picks have closed.
  v_closed := v_slate.status in ('locked', 'graded');

  with eff as (
    select
      sg.game_id,
      sg.locked_home_spread,
      -- TODO(brooks): postponed games stay ungraded until played or voided by the commissioner.
      (sg.voided or g.status = 'cancelled') as is_void,
      sg.override_home_score is not null
        or (g.status = 'final' and g.home_score is not null and g.away_score is not null) as is_final,
      coalesce(sg.override_home_score, g.home_score) - coalesce(sg.override_away_score, g.away_score) as margin
    from slate_games sg
    join games g on g.id = sg.game_id
    where sg.slate_id = p_slate_id
  ),
  graded as (
    select
      p.id,
      p.confidence,
      case
        when e.is_void then 'void'
        when not e.is_final then null
        when v_settings->>'pick_type' = 'ats' then
          case
            when e.locked_home_spread is null then null   -- shouldn't happen: publish freezes every line
            when e.margin + e.locked_home_spread = 0 then 'push'
            when (e.margin + e.locked_home_spread > 0) = (p.picked_side = 'home') then 'win'
            else 'loss'
          end
        else
          case
            when e.margin = 0 then 'push'                 -- basketball can't tie; football can in theory
            when (e.margin > 0) = (p.picked_side = 'home') then 'win'
            else 'loss'
          end
      end as result
    from picks p
    join eff e on e.game_id = p.game_id
    where p.slate_id = p_slate_id
  )
  update picks p
  set result = g.result
  from graded g
  where p.id = g.id;

  -- Base points; bonus starts at 0 for every graded pick (recomputed from scratch each run).
  -- TODO(brooks): a cancelled/postponed-and-voided game scores 0 for everyone (RULES.md Q5).
  update picks p
  set points = case
        when p.result is null then null
        when p.result = 'void' then 0
        when v_confidence then case
          when p.result = 'win' then coalesce(p.confidence, 0)
          when p.result = 'loss' and v_minus then -coalesce(p.confidence, 0)
          else 0 end
        else coalesce((v_settings->'scoring'->>p.result)::numeric, 0)
      end,
      bonus = case when p.result is null then null else 0 end
  where p.slate_id = p_slate_id;

  if v_upset is not null then
    with weight as (
      -- TODO(brooks): the split is by points (confidence) as the guidelines say, not by
      -- number of players (RULES.md Q2). Flat pools have no points, so each pick counts 1.
      select game_id,
             sum(case when picked_side = 'home' then w else 0 end) as home_pts,
             sum(case when picked_side = 'away' then w else 0 end) as away_pts
      from (select game_id, picked_side,
                   (case when v_confidence then coalesce(confidence, 0) else 1 end)::numeric as w
            from picks where slate_id = p_slate_id) x
      group by game_id
    ),
    split as (
      -- No bonus on an even split or when nobody took the other side.
      select game_id,
             case when home_pts < away_pts then 'home' else 'away' end as minority,
             greatest(home_pts, away_pts) / (home_pts + away_pts) as share
      from weight
      where home_pts <> away_pts and least(home_pts, away_pts) > 0
    ),
    award as (
      -- TODO(brooks): strictly greater than the tier's share, so exactly 80/90/95% falls
      -- in the lower bracket (RULES.md Q1).
      select s.game_id, s.minority,
             (select (t->>'bonus')::numeric
              from jsonb_array_elements(v_upset) t
              where s.share > (t->>'min_share')::numeric
              order by (t->>'min_share')::numeric desc
              limit 1) as bonus
      from split s
    )
    -- result = 'win' already means the game is final and not void.
    update picks p
    set bonus = a.bonus, points = p.points + a.bonus
    from award a
    where p.slate_id = p_slate_id and p.game_id = a.game_id
      and p.picked_side = a.minority and p.result = 'win' and a.bonus is not null;
  end if;

  insert into slate_scores (slate_id, user_id, points, bonus, wins, losses, pushes, missed)
  select p_slate_id, m.user_id,
         coalesce(sum(p.points), 0),
         coalesce(sum(p.bonus), 0),
         count(*) filter (where p.result = 'win'),
         count(*) filter (where p.result = 'loss'),
         count(*) filter (where p.result = 'push'),
         -- TODO(brooks): a member who joined after the week's deadline never had a chance
         -- to pick, so the week isn't "missed" for them: they score 0, not last place.
         v_closed and count(p.id) = 0
           and m.joined_at < coalesce(v_slate.lock_at, v_slate.window_end)
  from pool_members m
  left join picks p on p.slate_id = p_slate_id and p.user_id = m.user_id
  where m.pool_id = v_slate.pool_id
  group by m.user_id, m.joined_at
  on conflict (slate_id, user_id) do update
    set points = excluded.points, bonus = excluded.bonus, wins = excluded.wins,
        losses = excluded.losses, pushes = excluded.pushes, missed = excluded.missed;

  -- A member with no picks at all scores the week's last place (which can be negative).
  -- Members who made even one pick are scored on their picks. Last place is among
  -- members who picked (a late joiner's empty 0 isn't a finish).
  if v_settings->>'missed_week' = 'last_place' then
    select min(ss.points) into v_last
    from slate_scores ss
    join pool_members m on m.pool_id = v_slate.pool_id and m.user_id = ss.user_id
    where ss.slate_id = p_slate_id
      and exists (select 1 from picks p where p.slate_id = p_slate_id and p.user_id = ss.user_id);
    if v_last is not null then
      update slate_scores set points = v_last
      where slate_id = p_slate_id and missed;
    end if;
  end if;

  -- In-season tournament champion picks (not conference tournaments, scored separately)
  -- count toward the week they're set in. Their points are null until the champion is in.
  update slate_scores ss
  set points = ss.points + t.pts
  from (
    select tp.user_id, sum(tp.points) as pts
    from tournament_picks tp
    join tournaments t on t.id = tp.tournament_id
    where t.pool_id = v_slate.pool_id and t.week = v_slate.week
      and t.scoring <> 'champion_only' and tp.points is not null
    group by tp.user_id
  ) t
  where ss.slate_id = p_slate_id and ss.user_id = t.user_id;

  select bool_and(
           sg.voided or g.status = 'cancelled' or sg.override_home_score is not null
           or (g.status = 'final' and g.home_score is not null and g.away_score is not null))
    into v_complete
  from slate_games sg join games g on g.id = sg.game_id
  where sg.slate_id = p_slate_id;

  if v_slate.status = 'locked' and v_complete then
    update slates set status = 'graded' where id = p_slate_id;
  elsif v_slate.status = 'graded' and not v_complete then
    update slates set status = 'locked' where id = p_slate_id;
  end if;
end;
$$;

create or replace function grade_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_scoring text;
  v_done boolean;
  v_slate uuid;
begin
  select scoring into v_scoring from tournaments where id = p_tournament_id;
  v_done := exists (select 1 from tournament_teams where tournament_id = p_tournament_id and placement = 'champion');
  update tournament_picks p
  set points = case when v_done then tournament_place_points(v_scoring, tt.placement) end
  from tournament_teams tt
  where p.tournament_id = p_tournament_id and tt.tournament_id = p.tournament_id and tt.team_id = p.team_id;

  -- In-season tournaments count toward their week's score: regrade the pool's published
  -- weeks (all of them, so a tournament moved to another week leaves its old one too).
  if v_scoring <> 'champion_only' then
    for v_slate in
      select s.id from slates s join tournaments t on t.pool_id = s.pool_id
      where t.id = p_tournament_id and s.status <> 'draft'
    loop
      perform grade_slate(v_slate);
    end loop;
  end if;
end;
$$;

-- Bring every published week up to date now.
do $$
declare v uuid;
begin
  for v in select id from slates where status <> 'draft' loop
    perform grade_slate(v);
  end loop;
end $$;
