-- Helper functions, pick validation, slate lifecycle, grading, and RLS (HANDOFF.md §6–§7).
--
-- Rule of thumb: anything that changes game state, picks, or scores goes through a
-- security definer function below. Tables only get direct-write policies where the
-- commissioner is editing a draft.

-- ============ Membership helpers ============
-- security definer so policies on pool_members can call them without recursing.

create or replace function is_pool_member(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from pool_members where pool_id = p and user_id = auth.uid());
$$;

create or replace function is_commissioner(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from pool_members
                 where pool_id = p and user_id = auth.uid() and role = 'commissioner');
$$;

-- Readable "Away @ Home" label for error messages.
create or replace function game_label(p_game_id uuid) returns text
language sql stable set search_path = public as $$
  select coalesce(a.name, '?') || ' @ ' || coalesce(h.name, '?')
  from games g
  left join teams h on h.id = g.home_team_id
  left join teams a on a.id = g.away_team_id
  where g.id = p_game_id;
$$;

-- ATS: push a whole-number spread half a point toward the underdog so it can't push.
-- -3 → -3.5 (favorite must win by 4), +3 → +3.5. Pick'em (0) is left alone.
create or replace function apply_half_point(p_spread numeric, p_force boolean) returns numeric
language sql immutable as $$
  select case
    when not coalesce(p_force, false) or p_spread is null or p_spread = 0 or p_spread <> trunc(p_spread)
      then p_spread
    when p_spread > 0 then p_spread + 0.5
    else p_spread - 0.5
  end;
$$;

-- ============ Pools & invites ============

create or replace function create_pool(
  p_name text, p_slug text, p_sport text, p_season int, p_entry_fee numeric, p_settings jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pool_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into pools (name, slug, sport, season, commissioner_id, entry_fee, settings)
  values (p_name, p_slug, p_sport, p_season, auth.uid(), coalesce(p_entry_fee, 0), p_settings)
  returning id into v_pool_id;

  insert into pool_members (pool_id, user_id, role) values (v_pool_id, auth.uid(), 'commissioner');
  insert into invites (pool_id) values (v_pool_id);

  return v_pool_id;
end;
$$;

-- Redeem an invite token. Returns the pool slug. Joining twice is a no-op.
create or replace function join_pool(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_invite from invites where token = p_token for update;
  if not found then
    raise exception 'That invite link is not valid';
  end if;

  select slug into v_slug from pools where id = v_invite.pool_id;

  if exists (select 1 from pool_members where pool_id = v_invite.pool_id and user_id = auth.uid()) then
    return v_slug;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'That invite link has expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'That invite link has been used up';
  end if;

  insert into pool_members (pool_id, user_id) values (v_invite.pool_id, auth.uid());
  update invites set uses = uses + 1 where id = v_invite.id;

  return v_slug;
end;
$$;

-- pick_type, pick count, and tiers are fixed once any slate has opened (§8 admin/settings).
create or replace function guard_pool_settings() returns trigger
language plpgsql set search_path = public as $$
begin
  if (old.sport, old.settings->'pick_type', old.settings->'picks_per_slate', old.settings->'confidence')
       is distinct from
     (new.sport, new.settings->'pick_type', new.settings->'picks_per_slate', new.settings->'confidence')
     and exists (select 1 from slates where pool_id = new.id and status <> 'draft') then
    raise exception 'Sport, pick type, pick count and confidence tiers can''t change after the first week opens';
  end if;
  return new;
end;
$$;

create trigger pools_guard_settings
  before update on pools
  for each row execute function guard_pool_settings();

-- ============ Picks ============

-- Save a player's full pick set for a slate (§6.2). p_picks is
--   [{ "game_id": uuid, "picked_side": "home"|"away", "confidence": int|null }, ...]
-- and must include the player's existing picks on started games, unchanged.
-- Picks on unstarted games are replaced atomically. p_user_id lets the commissioner
-- enter picks for a player; the same locks apply.
create or replace function submit_picks(p_slate_id uuid, p_picks jsonb, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_user uuid;
  v_game uuid;
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
  left join slate_games sg on sg.slate_id = p_slate_id and sg.game_id = s.game_id
  where sg.game_id is null
  limit 1;
  if found then
    raise exception 'A picked game is not on this slate';
  end if;

  -- Started games are frozen: a submitted pick on a started game must match what's saved...
  select s.game_id into v_game
  from _submitted s
  join games g on g.id = s.game_id
  left join picks p on p.slate_id = p_slate_id and p.user_id = v_user and p.game_id = s.game_id
  where g.start_at <= now()
    and (p.id is null or p.picked_side <> s.picked_side or p.confidence is distinct from s.confidence)
  limit 1;
  if found then
    raise exception '% has started; that pick is locked', game_label(v_game);
  end if;

  -- ...and a saved pick on a started game can't be dropped.
  select p.game_id into v_game
  from picks p
  join games g on g.id = p.game_id
  where p.slate_id = p_slate_id and p.user_id = v_user and g.start_at <= now()
    and not exists (select 1 from _submitted s where s.game_id = p.game_id)
  limit 1;
  if found then
    raise exception '% has started; that pick is locked', game_label(v_game);
  end if;

  -- No new or changed picks on voided games
  select s.game_id into v_game
  from _submitted s
  join slate_games sg on sg.slate_id = p_slate_id and sg.game_id = s.game_id
  join games g on g.id = s.game_id
  where sg.voided and g.start_at > now()
  limit 1;
  if found then
    raise exception '% was voided by the commissioner', game_label(v_game);
  end if;

  -- Count (frozen + unstarted)
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

  -- Write: only unstarted games change.
  delete from picks p
  using games g
  where p.slate_id = p_slate_id and p.user_id = v_user
    and g.id = p.game_id and g.start_at > now()
    and not exists (select 1 from _submitted s where s.game_id = p.game_id);

  insert into picks (slate_id, game_id, user_id, picked_side, confidence)
  select p_slate_id, s.game_id, v_user, s.picked_side, s.confidence
  from _submitted s
  join games g on g.id = s.game_id
  where g.start_at > now()
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

-- Commissioner view of one player's picks (needed to enter picks on their behalf).
create or replace function member_picks(p_slate_id uuid, p_user_id uuid) returns setof picks
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from slates s where s.id = p_slate_id and is_commissioner(s.pool_id)) then
    raise exception 'Only the commissioner can view this';
  end if;
  return query select * from picks where slate_id = p_slate_id and user_id = p_user_id;
end;
$$;

-- ============ Grading (§6.3) ============

-- Grade every pick on a slate and recompute slate_scores. Idempotent; safe to re-run
-- after any score edit, override, or void.
create or replace function grade_slate(p_slate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_confidence boolean;
  v_complete boolean;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or v_slate.status = 'draft' then
    return;
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;
  v_confidence := jsonb_typeof(v_settings->'confidence') = 'object';

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

  update picks p
  set points = case
        when p.result is null then null
        when p.result = 'void' then 0
        when v_confidence then case when p.result = 'win' then coalesce(p.confidence, 0) else 0 end
        else coalesce((v_settings->'scoring'->>p.result)::numeric, 0)
      end
  where p.slate_id = p_slate_id;

  insert into slate_scores (slate_id, user_id, points, wins, losses, pushes)
  select p_slate_id, m.user_id,
         coalesce(sum(p.points), 0),
         count(*) filter (where p.result = 'win'),
         count(*) filter (where p.result = 'loss'),
         count(*) filter (where p.result = 'push')
  from pool_members m
  left join picks p on p.slate_id = p_slate_id and p.user_id = m.user_id
  where m.pool_id = v_slate.pool_id
  group by m.user_id
  on conflict (slate_id, user_id) do update
    set points = excluded.points, wins = excluded.wins,
        losses = excluded.losses, pushes = excluded.pushes;

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

-- Grade every published slate that contains this game. Called by the score poller.
create or replace function grade_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate_id uuid;
begin
  for v_slate_id in
    select s.id from slates s join slate_games sg on sg.slate_id = s.id
    where sg.game_id = p_game_id and s.status <> 'draft'
  loop
    perform grade_slate(v_slate_id);
  end loop;
end;
$$;

-- ============ Slate lifecycle (§6.1) ============

-- Copy the latest captured line (pool's bookmaker) onto every slate game, overwriting.
-- Used for the commissioner's "review frozen lines" step; they can hand-edit after.
create or replace function freeze_slate_lines(p_slate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;
  if v_slate.status <> 'draft' then
    raise exception 'Lines are already frozen for this slate';
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;

  update slate_games sg
  set locked_line_id = l.id,
      locked_home_spread = apply_half_point(l.home_spread, (v_settings->'lines'->>'force_half_point')::boolean)
  from (
    select distinct on (game_id) id, game_id, home_spread
    from game_lines
    where bookmaker = v_settings->'lines'->>'bookmaker' and home_spread is not null
    order by game_id, captured_at desc
  ) l
  where sg.slate_id = p_slate_id and sg.game_id = l.game_id;
end;
$$;

create or replace function publish_slate(p_slate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_n int;
  v_game uuid;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;
  if v_slate.status <> 'draft' then
    raise exception 'This slate is already published';
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;

  select count(*) into v_n from slate_games where slate_id = p_slate_id and not voided;
  if v_n = 0 then
    raise exception 'Add games before publishing';
  end if;
  if v_settings->>'picks_mode' = 'exact' and v_n < (v_settings->>'picks_per_slate')::int then
    raise exception 'This slate has % games but players must pick %', v_n, (v_settings->>'picks_per_slate')::int;
  end if;

  select sg.game_id into v_game
  from slate_games sg join games g on g.id = sg.game_id
  where sg.slate_id = p_slate_id and g.start_at <= now()
  limit 1;
  if found then
    raise exception '% has already started; remove it before publishing', game_label(v_game);
  end if;

  if v_settings->'lock'->>'mode' = 'weekly' and (v_slate.lock_at is null or v_slate.lock_at <= now()) then
    raise exception 'Set a lock time in the future before publishing';
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

-- open → locked once every non-voided game has started, or the weekly lock has passed.
-- Run by pg_cron every 5 minutes; idempotent.
create or replace function close_slates() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  update slates s
  set status = 'locked'
  where s.status = 'open'
    and (
      (s.lock_at is not null and s.lock_at <= now())
      or not exists (
        select 1 from slate_games sg join games g on g.id = sg.game_id
        where sg.slate_id = s.id and not sg.voided and g.start_at > now())
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ============ Commissioner overrides ============

create or replace function void_game(p_slate_id uuid, p_game_id uuid, p_voided boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
begin
  select * into v_slate from slates where id = p_slate_id;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;
  if v_slate.status = 'draft' then
    raise exception 'Remove the game from the draft instead of voiding it';
  end if;

  update slate_games set voided = p_voided where slate_id = p_slate_id and game_id = p_game_id;
  if not found then
    raise exception 'That game is not on this slate';
  end if;

  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_slate.pool_id, auth.uid(), case when p_voided then 'void_game' else 'unvoid_game' end,
          jsonb_build_object('slate_id', p_slate_id, 'game_id', p_game_id));

  perform grade_slate(p_slate_id);
end;
$$;

-- Set (or clear, with nulls) the commissioner's result for a game on one slate.
create or replace function set_result_override(
  p_slate_id uuid, p_game_id uuid, p_home_score int, p_away_score int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
begin
  select * into v_slate from slates where id = p_slate_id;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;
  if v_slate.status = 'draft' then
    raise exception 'This slate is not published yet';
  end if;
  if (p_home_score is null) <> (p_away_score is null) then
    raise exception 'Enter both scores, or clear both';
  end if;

  update slate_games
  set override_home_score = p_home_score, override_away_score = p_away_score
  where slate_id = p_slate_id and game_id = p_game_id;
  if not found then
    raise exception 'That game is not on this slate';
  end if;

  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_slate.pool_id, auth.uid(), 'set_result_override',
          jsonb_build_object('slate_id', p_slate_id, 'game_id', p_game_id,
                             'home_score', p_home_score, 'away_score', p_away_score));

  perform grade_slate(p_slate_id);
end;
$$;

-- Manual game entry for the slate editor (before/alongside ESPN sync).
create or replace function add_manual_game(
  p_pool_id uuid, p_home_team_id uuid, p_away_team_id uuid, p_start_at timestamptz,
  p_neutral_site boolean default false, p_tv_network text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pool pools%rowtype;
  v_game_id uuid;
begin
  select * into v_pool from pools where id = p_pool_id;
  if not found or not is_commissioner(p_pool_id) then
    raise exception 'Pool not found';
  end if;
  if p_home_team_id = p_away_team_id then
    raise exception 'A team can''t play itself';
  end if;
  if exists (select 1 from teams where id in (p_home_team_id, p_away_team_id) and sport <> v_pool.sport) then
    raise exception 'Both teams must be % teams', v_pool.sport;
  end if;

  insert into games (sport, season, home_team_id, away_team_id, start_at, neutral_site, tv_network)
  values (v_pool.sport, v_pool.season, p_home_team_id, p_away_team_id, p_start_at, p_neutral_site, p_tv_network)
  returning id into v_game_id;

  insert into audit_log (pool_id, actor_id, action, detail)
  values (p_pool_id, auth.uid(), 'add_manual_game', jsonb_build_object('game_id', v_game_id));

  return v_game_id;
end;
$$;

-- Internal-only functions: service role (ingestion jobs) and other definer functions.
revoke execute on function grade_slate(uuid) from public, anon, authenticated;
revoke execute on function grade_game(uuid) from public, anon, authenticated;
revoke execute on function close_slates() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
grant execute on function grade_slate(uuid) to service_role;
grant execute on function grade_game(uuid) to service_role;
grant execute on function close_slates() to service_role;

-- ============ Row-level security (§7) ============

alter table pools            enable row level security;
alter table pool_members     enable row level security;
alter table slates           enable row level security;
alter table slate_games      enable row level security;
alter table picks            enable row level security;
alter table slate_scores     enable row level security;
alter table games            enable row level security;
alter table teams            enable row level security;
alter table game_lines       enable row level security;
alter table invites          enable row level security;
alter table profiles         enable row level security;
alter table audit_log        enable row level security;
alter table team_match_queue enable row level security;

-- pools: created via create_pool()
create policy pools_read   on pools for select using (is_pool_member(id));
create policy pools_update on pools for update using (is_commissioner(id)) with check (is_commissioner(id));

-- pool_members: joined via create_pool() / join_pool()
create policy members_read   on pool_members for select using (is_pool_member(pool_id));
create policy members_update on pool_members for update using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));
create policy members_delete on pool_members for delete using (is_commissioner(pool_id));

-- slates: commissioner edits drafts directly; publish/lock/grade go through functions
create policy slates_read on slates for select
  using (is_pool_member(pool_id) and (status <> 'draft' or is_commissioner(pool_id)));
create policy slates_insert on slates for insert
  with check (is_commissioner(pool_id) and status = 'draft');
create policy slates_update on slates for update
  using (is_commissioner(pool_id) and status = 'draft')
  with check (is_commissioner(pool_id) and status = 'draft');
create policy slates_delete on slates for delete
  using (is_commissioner(pool_id) and status = 'draft');

create policy slate_games_read on slate_games for select using (
  exists (select 1 from slates s where s.id = slate_id and is_pool_member(s.pool_id)
          and (s.status <> 'draft' or is_commissioner(s.pool_id))));
create policy slate_games_draft on slate_games for all
  using (exists (select 1 from slates s where s.id = slate_id
                 and s.status = 'draft' and is_commissioner(s.pool_id)))
  with check (exists (select 1 from slates s where s.id = slate_id
                      and s.status = 'draft' and is_commissioner(s.pool_id)));

-- Own picks always; others' picks on a game only once that game has started
-- (or, in weekly mode, once the slate has locked).
create policy picks_read on picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from slates s
    join games g on g.id = picks.game_id
    where s.id = picks.slate_id
      and is_pool_member(s.pool_id)
      and (g.start_at <= now() or s.status in ('locked','graded'))));
-- No insert/update/delete policies on picks: all writes go through submit_picks().

create policy scores_read on slate_scores for select using (
  exists (select 1 from slates s where s.id = slate_id and is_pool_member(s.pool_id)));

create policy games_read    on games      for select using (auth.role() = 'authenticated');
create policy teams_read    on teams      for select using (auth.role() = 'authenticated');
create policy lines_read    on game_lines for select using (auth.role() = 'authenticated');
create policy profiles_read on profiles   for select using (auth.role() = 'authenticated');
create policy profiles_self on profiles   for update using (id = auth.uid()) with check (id = auth.uid());

-- invites: redeemed via join_pool(); the commissioner manages their pool's links
create policy invites_comm on invites for all
  using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));

create policy audit_read on audit_log for select using (is_commissioner(pool_id));

create policy match_queue_read on team_match_queue for select using (auth.role() = 'authenticated');
