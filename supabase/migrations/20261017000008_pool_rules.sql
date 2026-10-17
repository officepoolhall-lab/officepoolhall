-- Pool A rules (docs/RULES.md): per-game pick deadlines (Monday group + Tuesday deadline),
-- commissioner-set tip times, minus points for wrong picks, the upset bonus, and
-- last-place scoring for a missed week.
--
-- Settings are read tolerantly: a pool without the new keys behaves exactly as before
-- (wrong_pick 'zero', no upset_bonus, missed_week 'zero', no first-day deadline).

-- ============ Columns ============

-- Weekly mode's earlier deadline for the window's first day (Monday 5pm); null = none.
alter table slates add column first_day_lock_at timestamptz;

-- Per-game pick deadline, written at publish from the slate's deadlines. Null in per_game
-- mode, where a game locks at its own tip. See effective_lock_at().
alter table slate_games add column lock_at timestamptz;

alter table games add column venue text;  -- 'Las Vegas, NV'; shown for neutral-site games
-- The commissioner set start_at by hand (a TBD game's real tip); ESPN's TBD placeholder
-- must not overwrite it.
alter table games add column manual_time boolean not null default false;

alter table picks add column bonus numeric(5,2);  -- upset bonus, included in points; null = ungraded
alter table slate_scores add column bonus numeric(7,2) not null default 0;
-- No picks at all on the slate (scored per settings.missed_week).
alter table slate_scores add column missed boolean not null default false;

-- ============ Lock helpers ============

-- When a game stops taking picks. A real tip time always wins if it's before the
-- deadline. A TBD game's start_at is ESPN's midnight placeholder, so with a deadline
-- it locks at the deadline instead; without one (per_game mode) the placeholder is
-- all we have.
create or replace function effective_lock_at(p_start timestamptz, p_time_tbd boolean, p_deadline timestamptz)
returns timestamptz
language sql immutable as $$
  select case
    when p_time_tbd then coalesce(p_deadline, p_start)
    else least(p_start, coalesce(p_deadline, p_start))
  end;
$$;

-- Whether a game has stopped taking picks: its effective lock has passed, or ESPN says
-- it's under way or over. ESPN keeps a TBD game's time invalid even after it tips, so
-- without the status check a TBD game could be picked (with the result known) until its
-- deadline.
create or replace function game_locked(p_start timestamptz, p_time_tbd boolean, p_status text, p_deadline timestamptz)
returns boolean
language sql stable as $$
  select p_status in ('in_progress', 'final') or effective_lock_at(p_start, p_time_tbd, p_deadline) <= now();
$$;

-- Whether a game has really tipped (for messages): a passed TBD placeholder isn't a tip.
create or replace function game_started(p_start timestamptz, p_time_tbd boolean, p_status text)
returns boolean
language sql stable as $$
  select p_status in ('in_progress', 'final') or (not p_time_tbd and p_start <= now());
$$;

-- A game's local calendar date in the pool's time zone. ESPN's TBD placeholder is
-- midnight Eastern on the game's date, which is the previous evening in Central, so a
-- TBD game's date is read in Eastern.
create or replace function game_local_date(p_start timestamptz, p_time_tbd boolean, p_tz text)
returns date
language sql stable as $$
  select (p_start at time zone case when p_time_tbd then 'America/New_York' else p_tz end)::date;
$$;

-- (Re)write slate_games.lock_at from the slate's deadlines (weekly mode only):
--   * games on first_day_lock_at's local date lock together at the earlier of that
--     deadline and the first real tip that day ("Monday picks due 5pm, earlier if there
--     are Monday afternoon games");
--   * every other game, including any before the first day (Week 1's Sunday game),
--     locks at the main deadline. Its own tip still wins via effective_lock_at().
-- Called at publish and whenever a slate game's time changes. A deadline that has
-- already passed never moves: that would reopen picks other players can already see.
create or replace function refresh_slate_locks(p_slate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_tz text;
  v_first date;
begin
  select * into v_slate from slates where id = p_slate_id;
  if not found then
    return;
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;
  if coalesce(v_settings->'lock'->>'mode', 'per_game') <> 'weekly' then
    return;
  end if;

  v_tz := coalesce(nullif(v_settings->>'timezone', ''), 'America/Chicago');
  v_first := (v_slate.first_day_lock_at at time zone v_tz)::date;

  with d as (
    select sg.game_id, sg.voided, g.start_at, g.time_tbd,
           game_local_date(g.start_at, g.time_tbd, v_tz) as day
    from slate_games sg join games g on g.id = sg.game_id
    where sg.slate_id = p_slate_id
  ),
  target as (
    select d.game_id,
           case when d.day = v_first then
             -- TODO(brooks): all first-day games lock at that day's first tip (RULES.md Q4),
             -- not each at the earlier of 5pm and its own tip.
             least(v_slate.first_day_lock_at,
                   (select min(f.start_at) from d f where f.day = v_first and not f.time_tbd and not f.voided))
           else v_slate.lock_at end as lock_at
    from d
  )
  update slate_games sg
  set lock_at = t.lock_at
  from target t
  where sg.slate_id = p_slate_id and sg.game_id = t.game_id
    and sg.lock_at is distinct from t.lock_at
    and (sg.lock_at is null or sg.lock_at > now());
end;
$$;

-- ============ Picks ============

-- Same contract as before; "started" is now "locked": a game locks at
-- effective_lock_at(start, tbd, deadline), where the deadline is the game's own
-- slate_games.lock_at, falling back to the slate's lock_at for slates published before
-- per-game deadlines existed.
create or replace function submit_picks(p_slate_id uuid, p_picks jsonb, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_user uuid;
  v_game uuid;
  v_started boolean;
  v_conf int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_slate from slates where id = p_slate_id;
  if not found or not is_pool_member(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;

  v_user := coalesce(p_user_id, auth.uid());
  if v_user <> auth.uid() then
    if not is_commissioner(v_slate.pool_id) then
      raise exception 'Only the commissioner can enter picks for another player';
    end if;
    if not exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_user) then
      raise exception 'That player is not in this pool';
    end if;
  end if;

  if v_slate.status <> 'open' then
    raise exception 'This slate is not open for picks';
  end if;
  -- Every per-game deadline is at or before the slate's, so past it nothing can change.
  if v_slate.lock_at is not null and now() >= v_slate.lock_at then
    raise exception 'Picks for this slate are locked';
  end if;
  if jsonb_typeof(p_picks) is distinct from 'array' then
    raise exception 'picks must be a JSON array';
  end if;

  select settings into v_settings from pools where id = v_slate.pool_id;

  -- One save at a time per player per slate.
  perform pg_advisory_xact_lock(hashtextextended(p_slate_id::text || v_user::text, 0));

  create temp table if not exists _submitted (
    game_id uuid, picked_side text, confidence int
  ) on commit drop;
  truncate _submitted;
  insert into _submitted
    select s.game_id, s.picked_side, s.confidence
    from jsonb_to_recordset(p_picks) as s(game_id uuid, picked_side text, confidence int);

  -- Lock state of every game on the slate, evaluated once.
  create temp table if not exists _locks (
    game_id uuid, voided boolean, locked boolean, started boolean
  ) on commit drop;
  truncate _locks;
  insert into _locks
    select sg.game_id, sg.voided,
           game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, v_slate.lock_at)),
           game_started(g.start_at, g.time_tbd, g.status)
    from slate_games sg join games g on g.id = sg.game_id
    where sg.slate_id = p_slate_id;

  -- Shape
  if exists (select 1 from _submitted where game_id is null or picked_side is null
                                         or picked_side not in ('home','away')) then
    raise exception 'Each pick needs a game and a side (home or away)';
  end if;
  select game_id into v_game from _submitted group by game_id having count(*) > 1 limit 1;
  if found then
    raise exception 'More than one pick on %', game_label(v_game);
  end if;

  -- Every game must be on this slate
  select s.game_id into v_game
  from _submitted s
  left join _locks l on l.game_id = s.game_id
  where l.game_id is null
  limit 1;
  if found then
    raise exception 'A picked game is not on this slate';
  end if;

  -- Locked games are frozen: a submitted pick on a locked game must match what's saved...
  select s.game_id, l.started into v_game, v_started
  from _submitted s
  join _locks l on l.game_id = s.game_id
  left join picks p on p.slate_id = p_slate_id and p.user_id = v_user and p.game_id = s.game_id
  where l.locked
    and (p.id is null or p.picked_side <> s.picked_side or p.confidence is distinct from s.confidence)
  limit 1;
  if found then
    raise exception '% %; that pick is locked', game_label(v_game),
      case when v_started then 'has started' else 'is past its pick deadline' end;
  end if;

  -- ...and a saved pick on a locked game can't be dropped.
  select p.game_id, l.started into v_game, v_started
  from picks p
  join _locks l on l.game_id = p.game_id
  where p.slate_id = p_slate_id and p.user_id = v_user and l.locked
    and not exists (select 1 from _submitted s where s.game_id = p.game_id)
  limit 1;
  if found then
    raise exception '% %; that pick is locked', game_label(v_game),
      case when v_started then 'has started' else 'is past its pick deadline' end;
  end if;

  -- No new or changed picks on voided games
  select s.game_id into v_game
  from _submitted s
  join _locks l on l.game_id = s.game_id
  where l.voided and not l.locked
  limit 1;
  if found then
    raise exception '% was voided by the commissioner', game_label(v_game);
  end if;

  -- Count (frozen + unlocked)
  if (select count(*) from _submitted) > (v_settings->>'picks_per_slate')::int then
    raise exception 'Too many picks: this pool allows %', (v_settings->>'picks_per_slate')::int;
  end if;

  -- Confidence tiers
  if jsonb_typeof(v_settings->'confidence') = 'object' then
    if exists (select 1 from _submitted where confidence is null) then
      raise exception 'Every pick needs a confidence value';
    end if;

    select u.confidence into v_conf
    from (select confidence, count(*) as n from _submitted group by confidence) u
    left join (
      select (t->>'points')::int as points, sum((t->>'count')::int) as allowed
      from jsonb_array_elements(v_settings->'confidence'->'tiers') t
      group by 1
    ) a on a.points = u.confidence
    where a.points is null or u.n > a.allowed
    limit 1;
    if found then
      raise exception 'Too many %-point picks for this pool''s tiers', v_conf;
    end if;
  elsif exists (select 1 from _submitted where confidence is not null) then
    raise exception 'This pool doesn''t use confidence points';
  end if;

  -- Write: only unlocked games change.
  delete from picks p
  using _locks l
  where p.slate_id = p_slate_id and p.user_id = v_user
    and l.game_id = p.game_id and not l.locked
    and not exists (select 1 from _submitted s where s.game_id = p.game_id);

  insert into picks (slate_id, game_id, user_id, picked_side, confidence)
  select p_slate_id, s.game_id, v_user, s.picked_side, s.confidence
  from _submitted s
  join _locks l on l.game_id = s.game_id
  where not l.locked
  on conflict (slate_id, user_id, game_id) do update
    set picked_side = excluded.picked_side,
        confidence = excluded.confidence,
        updated_at = now()
    where (picks.picked_side, picks.confidence)
          is distinct from (excluded.picked_side, excluded.confidence);

  if v_user <> auth.uid() then
    insert into audit_log (pool_id, actor_id, action, detail)
    values (v_slate.pool_id, auth.uid(), 'picks_on_behalf',
            jsonb_build_object('slate_id', p_slate_id, 'user_id', v_user, 'picks', p_picks));
  end if;
end;
$$;

-- ============ Grading ============

-- Grade every pick on a slate and recompute slate_scores. Idempotent; safe to re-run
-- after any score edit, override, or void.
--   base:  confidence → win +N, loss −N with wrong_pick 'minus_points' (else 0), push/void 0;
--          flat → settings.scoring[result].
--   bonus: upset_bonus, for a correct pick on the side the pool put fewer points on.
--   missed_week 'last_place': a member with no picks scores the week's lowest total.
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

-- ============ Slate lifecycle ============

create or replace function publish_slate(p_slate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_weekly boolean;
  v_n int;
  v_game uuid;
  v_started boolean;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;
  if v_slate.status <> 'draft' then
    raise exception 'This slate is already published';
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;
  v_weekly := v_settings->'lock'->>'mode' = 'weekly';

  select count(*) into v_n from slate_games where slate_id = p_slate_id and not voided;
  if v_n = 0 then
    raise exception 'Add games before publishing';
  end if;
  if v_settings->>'picks_mode' = 'exact' and v_n < (v_settings->>'picks_per_slate')::int then
    raise exception 'This slate has % games but players must pick %', v_n, (v_settings->>'picks_per_slate')::int;
  end if;

  if v_weekly and (v_slate.lock_at is null or v_slate.lock_at <= now()) then
    raise exception 'Set a lock time in the future before publishing';
  end if;
  if v_weekly and v_slate.first_day_lock_at is not null and v_slate.first_day_lock_at <= now() then
    raise exception 'Set the first-day lock time in the future before publishing';
  end if;

  -- Per-game deadlines (weekly mode); per_game mode leaves them null.
  perform refresh_slate_locks(p_slate_id);

  -- A game that's already locked can't be published: its picks would be frozen empty.
  select sg.game_id, game_started(g.start_at, g.time_tbd, g.status) into v_game, v_started
  from slate_games sg join games g on g.id = sg.game_id
  where sg.slate_id = p_slate_id
    and game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, v_slate.lock_at))
  limit 1;
  if found then
    raise exception '% %; remove it before publishing', game_label(v_game),
      case when v_started then 'has already started' else 'is already past its pick deadline' end;
  end if;

  if v_settings->>'pick_type' = 'ats' then
    -- Fill any line the commissioner hasn't reviewed with the latest capture.
    update slate_games sg
    set locked_line_id = l.id,
        locked_home_spread = apply_half_point(l.home_spread, (v_settings->'lines'->>'force_half_point')::boolean)
    from (
      select distinct on (game_id) id, game_id, home_spread
      from game_lines
      where bookmaker = v_settings->'lines'->>'bookmaker' and home_spread is not null
      order by game_id, captured_at desc
    ) l
    where sg.slate_id = p_slate_id and sg.game_id = l.game_id and sg.locked_home_spread is null;

    select game_id into v_game
    from slate_games
    where slate_id = p_slate_id and not voided and locked_home_spread is null
    limit 1;
    if found then
      raise exception '% has no line; enter one before publishing', game_label(v_game);
    end if;
  end if;

  update slates set status = 'open', published_at = now() where id = p_slate_id;

  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_slate.pool_id, auth.uid(), 'publish_slate', jsonb_build_object('slate_id', p_slate_id, 'games', v_n));
end;
$$;

-- open → locked once every non-voided game is locked (tip or deadline), or the slate's
-- deadline has passed. Run by pg_cron every 5 minutes; idempotent. Each newly locked
-- slate is regraded: missed weeks are only scored once picks close (see grade_slate).
create or replace function close_slates() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  with closed as (
    update slates s
    set status = 'locked'
    where s.status = 'open'
      and (
        (s.lock_at is not null and s.lock_at <= now())
        or not exists (
          select 1 from slate_games sg join games g on g.id = sg.game_id
          where sg.slate_id = s.id and not sg.voided
            and not game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, s.lock_at)))
      )
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from closed;

  foreach v_id in array v_ids loop
    perform grade_slate(v_id);
  end loop;
  return cardinality(v_ids);
end;
$$;

-- ============ Commissioner: set a game's real tip time ============

-- For TBD games only (a time the commissioner set earlier can be corrected); a real
-- ESPN time can't be overwritten. Games are shared between pools, so this moves the
-- game everywhere: it's refused while the game is on another pool's published slate
-- (that pool's deadlines and visibility would move under it), and once the game is
-- locked on any published slate, since a new time could unlock picks others have seen.
create or replace function set_game_time(p_slate_id uuid, p_game_id uuid, p_start_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_game games%rowtype;
  v_slate_id uuid;
begin
  select * into v_slate from slates where id = p_slate_id;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;
  if v_slate.status not in ('draft', 'open') then
    raise exception 'This slate is locked';
  end if;
  if p_start_at is null or p_start_at <= now() then
    raise exception 'Enter a start time in the future';
  end if;

  select g.* into v_game
  from games g join slate_games sg on sg.game_id = g.id
  where sg.slate_id = p_slate_id and g.id = p_game_id
  for update of g;
  if not found then
    raise exception 'That game is not on this slate';
  end if;

  if not (v_game.time_tbd or v_game.manual_time) then
    raise exception '% already has a time from ESPN', game_label(p_game_id);
  end if;
  if game_started(v_game.start_at, v_game.time_tbd, v_game.status)
     or exists (
       select 1 from slate_games sg join slates s on s.id = sg.slate_id
       where sg.game_id = p_game_id and s.status <> 'draft'
         and game_locked(v_game.start_at, v_game.time_tbd, v_game.status, coalesce(sg.lock_at, s.lock_at))) then
    raise exception '% is already locked; its time can''t change', game_label(p_game_id);
  end if;
  if exists (
       select 1 from slate_games sg join slates s on s.id = sg.slate_id
       where sg.game_id = p_game_id and s.status <> 'draft' and s.pool_id <> v_slate.pool_id) then
    raise exception '% is on another pool''s slate; its time can''t be set here', game_label(p_game_id);
  end if;

  update games
  set start_at = p_start_at, time_tbd = false, manual_time = true, updated_at = now()
  where id = p_game_id;

  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_slate.pool_id, auth.uid(), 'set_game_time',
          jsonb_build_object('slate_id', p_slate_id, 'game_id', p_game_id,
                             'from', v_game.start_at, 'from_tbd', v_game.time_tbd, 'to', p_start_at));

  -- A new tip can move a first-day group's deadline (e.g. a TBD Monday game at 1pm).
  for v_slate_id in
    select s.id from slates s join slate_games sg on sg.slate_id = s.id
    where sg.game_id = p_game_id and s.status = 'open'
  loop
    perform refresh_slate_locks(v_slate_id);
  end loop;
end;
$$;

-- ============ ESPN ingest ============

-- Whether the feed's new start time must be ignored: the game has really started, or
-- the move would unlock it on a published slate where it's already locked (its picks
-- are already visible). A TBD placeholder that has passed isn't a start, so in weekly
-- mode (deadline ahead) a TBD game still takes its real time; in per_game mode the
-- passed placeholder is its lock, and a later real time would reopen it.
create or replace function game_time_frozen(
  p_game_id uuid, p_start timestamptz, p_time_tbd boolean, p_status text,
  p_new_start timestamptz, p_new_time_tbd boolean, p_new_status text
) returns boolean
language sql stable security definer set search_path = public as $$
  select (not p_time_tbd and p_start <= now())
    or exists (
      select 1 from slate_games sg join slates s on s.id = sg.slate_id
      where sg.game_id = p_game_id and s.status <> 'draft'
        and game_locked(p_start, p_time_tbd, p_status, coalesce(sg.lock_at, s.lock_at))
        and not game_locked(p_new_start, p_new_time_tbd, p_new_status, coalesce(sg.lock_at, s.lock_at)));
$$;

-- Same contract as 20261017000004, plus p_games[].venue. Start-time rules:
--   * the commissioner's manual time survives a feed that still says TBD;
--   * otherwise the feed's time is taken (clearing manual_time) unless
--     game_time_frozen(): a game that has really started never moves, and no move may
--     reopen a game that's locked on a published slate.
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
    -- Ranks are "AP rank at slate time": freeze them once the game is on a published slate.
    home_rank = case when exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
                                  where sg.game_id = games.id and s.status <> 'draft')
                     then games.home_rank else excluded.home_rank end,
    away_rank = case when exists (select 1 from slate_games sg join slates s on s.id = sg.slate_id
                                  where sg.game_id = games.id and s.status <> 'draft')
                     then games.away_rank else excluded.away_rank end,
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

revoke execute on function refresh_slate_locks(uuid) from public, anon, authenticated;
grant execute on function refresh_slate_locks(uuid) to service_role;
revoke execute on function game_time_frozen(uuid, timestamptz, boolean, text, timestamptz, boolean, text)
  from public, anon, authenticated;
grant execute on function game_time_frozen(uuid, timestamptz, boolean, text, timestamptz, boolean, text) to service_role;

-- ============ RLS ============

-- Own picks always; others' picks on a game once that game is locked (its tip or its
-- pick deadline), or once the whole slate has locked.
drop policy picks_read on picks;
create policy picks_read on picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from slates s
    join slate_games sg on sg.slate_id = s.id and sg.game_id = picks.game_id
    join games g on g.id = picks.game_id
    where s.id = picks.slate_id
      and is_pool_member(s.pool_id)
      and (s.status in ('locked','graded')
           or game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, s.lock_at)))));
