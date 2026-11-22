-- Survivor demo pools: settings.survivor.demo_now shows a demo pool as of an earlier moment
-- (games after it look not started). Picks in such a pool lock against that moment instead of
-- the clock, so the demo can be played. Pools without demo_now are unchanged.

create or replace function submit_survivor_pick(p_slate_id uuid, p_game_id uuid, p_team_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_slate slates%rowtype;
  v_rules jsonb;
  v_commish boolean;
  v_manager boolean;
  v_behalf boolean;
  v_game games%rowtype;
  v_old games%rowtype;
  -- Demo pools only: the moment the pool is shown "as of" (settings.survivor.demo_now).
  v_demo_now timestamptz;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select * into v_slate from slates where id = p_slate_id;
  if not found or v_slate.status = 'draft' then raise exception 'That week isn''t open'; end if;
  select settings->'survivor' into v_rules from pools where id = v_slate.pool_id and settings->>'format' = 'survivor';
  if v_rules is null then raise exception 'This isn''t a Survivor pool'; end if;
  v_demo_now := nullif(v_rules->>'demo_now', '')::timestamptz;

  v_commish := exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = v_slate.pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only make your own pick'; end if;
  if not exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_user) then
    raise exception 'That entry isn''t in this pool';
  end if;
  -- The commissioner fixing someone's pick isn't held to kickoff or to the entry being alive.
  v_behalf := v_commish and v_user <> v_me;

  if v_slate.week < coalesce(nullif(v_rules->>'start_week', '')::int, 1) then
    raise exception 'The pool hasn''t started yet';
  end if;

  select g.* into v_game from slate_games sg join games g on g.id = sg.game_id
  where sg.slate_id = p_slate_id and sg.game_id = p_game_id and not sg.voided;
  if not found then raise exception 'That game isn''t on this week''s slate'; end if;
  if p_team_id is distinct from v_game.home_team_id and p_team_id is distinct from v_game.away_team_id then
    raise exception 'That team isn''t playing in this game';
  end if;

  if not v_behalf then
    if (v_demo_now is null and game_started(v_game.start_at, v_game.time_tbd, v_game.status))
       or (v_demo_now is not null and not v_game.time_tbd and v_game.start_at <= v_demo_now) then
      raise exception 'That game has already started';
    end if;
    select g.* into v_old from survivor_picks p join games g on g.id = p.game_id where p.slate_id = p_slate_id and p.user_id = v_user;
    if found and ((v_demo_now is null and game_started(v_old.start_at, v_old.time_tbd, v_old.status))
                  or (v_demo_now is not null and not v_old.time_tbd and v_old.start_at <= v_demo_now)) then
      raise exception 'Your pick this week is locked: its game has started';
    end if;
    -- (A demo pool shown as of an earlier moment skips this: later real results don't count.)
    if v_demo_now is null and survivor_losses(v_slate.pool_id, v_user) >= coalesce(nullif(v_rules->>'lives', '')::int, 1) then
      raise exception 'This entry has been eliminated';
    end if;
  end if;

  -- Each team once, unless the pool allows repeats.
  if not coalesce((v_rules->>'reuse')::boolean, false) and exists (
    select 1 from survivor_picks where pool_id = v_slate.pool_id and user_id = v_user and team_id = p_team_id and slate_id <> p_slate_id
  ) then
    raise exception 'That team has already been used';
  end if;

  insert into survivor_picks (pool_id, slate_id, user_id, game_id, team_id, edited_by, updated_at)
  values (v_slate.pool_id, p_slate_id, v_user, p_game_id, p_team_id, case when v_behalf then v_me end, now())
  on conflict (slate_id, user_id) do update
    set game_id = excluded.game_id, team_id = excluded.team_id, edited_by = excluded.edited_by, updated_at = now();
end;
$$;

revoke execute on function submit_survivor_pick(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function submit_survivor_pick(uuid, uuid, uuid, uuid) to authenticated;
