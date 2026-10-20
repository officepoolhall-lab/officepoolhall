-- In-season tournament champion picks (basketball: Players Era, Maui Invitational, Paradise
-- Jam…). The commissioner adds each tournament with its field, the week it belongs to and
-- when picks lock (its first tip). Every entry picks one champion per tournament. When the
-- commissioner enters how the field finished, each pick scores by where its team placed:
--   'third_place' events:  champion 5 · runner-up 3 · 3rd-place game winner 2 · its loser 1
--   'semifinals' events:   champion 5 · runner-up 3 · each losing semifinalist 1.5
-- Points are a separate bonus line in the standings, outside the weekly scores.
-- Writes go through the functions below; players never write these tables directly.

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  week int not null check (week >= 1),
  lock_at timestamptz not null,
  scoring text not null default 'third_place' check (scoring in ('third_place', 'semifinals')),
  created_at timestamptz not null default now()
);
create index if not exists tournaments_pool_idx on tournaments (pool_id, lock_at);

create table if not exists tournament_teams (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id uuid not null references teams(id),
  -- Where the team finished; null until results are in (or if it finished outside the scoring places).
  placement text check (placement in ('champion', 'runner_up', 'third', 'fourth', 'semifinal')),
  primary key (tournament_id, team_id)
);

create table if not exists tournament_picks (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null,
  -- Null until the tournament has a champion; then the pick's points (0 if it placed nowhere).
  points numeric(4,1),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, user_id),
  -- Taking a team out of the field removes picks on it.
  foreign key (tournament_id, team_id) references tournament_teams(tournament_id, team_id) on delete cascade
);
create index if not exists tournament_picks_user_idx on tournament_picks (user_id);

alter table tournaments enable row level security;
alter table tournament_teams enable row level security;
alter table tournament_picks enable row level security;

drop policy if exists tournaments_read on tournaments;
create policy tournaments_read on tournaments for select using (is_pool_member(pool_id));

drop policy if exists tournament_teams_read on tournament_teams;
create policy tournament_teams_read on tournament_teams for select using (
  exists (select 1 from tournaments t where t.id = tournament_id and is_pool_member(t.pool_id))
);

-- Your own pick (and the entry you co-manage) always; everyone's once the tournament locks.
-- Like weekly picks, not even the commissioner sees other picks before then.
drop policy if exists tournament_picks_read on tournament_picks;
create policy tournament_picks_read on tournament_picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (
        (t.lock_at <= now() and is_pool_member(t.pool_id))
        or exists (select 1 from entry_managers em
                   where em.pool_id = t.pool_id and em.owner_id = tournament_picks.user_id and em.manager_id = auth.uid())
      )
  )
);

grant select on tournaments, tournament_teams, tournament_picks to authenticated;

-- Points for a finishing place under a tournament's scoring.
create or replace function tournament_place_points(p_scoring text, p_placement text) returns numeric
language sql immutable as $$
  select case
    when p_placement = 'champion' then 5
    when p_placement = 'runner_up' then 3
    when p_scoring = 'third_place' and p_placement = 'third' then 2
    when p_scoring = 'third_place' and p_placement = 'fourth' then 1
    when p_scoring = 'semifinals' and p_placement = 'semifinal' then 1.5
    else 0
  end;
$$;

-- Re-scores every pick from the field's placements: null until a champion is set.
create or replace function grade_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_scoring text;
  v_done boolean;
begin
  select scoring into v_scoring from tournaments where id = p_tournament_id;
  v_done := exists (select 1 from tournament_teams where tournament_id = p_tournament_id and placement = 'champion');
  update tournament_picks p
  set points = case when v_done then tournament_place_points(v_scoring, tt.placement) end
  from tournament_teams tt
  where p.tournament_id = p_tournament_id and tt.tournament_id = p.tournament_id and tt.team_id = p.team_id;
end;
$$;

-- Commissioner: add (p_id null) or edit a tournament and set its field.
create or replace function save_tournament(
  p_pool_id uuid, p_id uuid, p_name text, p_week int, p_lock_at timestamptz, p_scoring text, p_team_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
  v_sport text;
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can set up tournaments';
  end if;
  if coalesce(array_length(p_team_ids, 1), 0) < 2 then
    raise exception 'Add at least two teams to the field';
  end if;
  select sport into v_sport from pools where id = p_pool_id;
  if exists (select 1 from unnest(p_team_ids) t(id) left join teams tm on tm.id = t.id
             where tm.id is null or tm.sport <> v_sport) then
    raise exception 'Every team in the field must be a % team', v_sport;
  end if;

  if v_id is null then
    insert into tournaments (pool_id, name, week, lock_at, scoring)
    values (p_pool_id, btrim(p_name), p_week, p_lock_at, coalesce(p_scoring, 'third_place'))
    returning id into v_id;
  else
    update tournaments
    set name = btrim(p_name), week = p_week, lock_at = p_lock_at, scoring = coalesce(p_scoring, scoring)
    where id = v_id and pool_id = p_pool_id;
    if not found then raise exception 'Tournament not found'; end if;
  end if;

  -- The field: drop teams no longer in it (their picks go too), add new ones.
  delete from tournament_teams where tournament_id = v_id and team_id <> all (p_team_ids);
  insert into tournament_teams (tournament_id, team_id)
  select v_id, t from unnest(p_team_ids) t
  on conflict do nothing;

  -- A changed scoring rule may leave places it doesn't use.
  update tournament_teams tt
  set placement = null
  from tournaments t
  where tt.tournament_id = v_id and t.id = v_id
    and ((t.scoring = 'third_place' and tt.placement = 'semifinal')
      or (t.scoring = 'semifinals' and tt.placement in ('third', 'fourth')));
  perform grade_tournament(v_id);

  insert into audit_log (pool_id, actor_id, action, detail)
  values (p_pool_id, auth.uid(), 'save_tournament', jsonb_build_object('tournament_id', v_id, 'name', p_name, 'teams', array_length(p_team_ids, 1)));
  return v_id;
end;
$$;

create or replace function delete_tournament(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid;
begin
  select pool_id into v_pool from tournaments where id = p_id;
  if v_pool is null or not is_commissioner(v_pool) then
    raise exception 'Tournament not found';
  end if;
  delete from tournaments where id = p_id;
  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_pool, auth.uid(), 'delete_tournament', jsonb_build_object('tournament_id', p_id));
end;
$$;

-- Commissioner: how the field finished, as {team_id: placement or null}. Scores every pick.
create or replace function set_tournament_results(p_id uuid, p_placements jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t tournaments%rowtype;
  v_place text;
  v_n int;
begin
  select * into v_t from tournaments where id = p_id;
  if not found or not is_commissioner(v_t.pool_id) then
    raise exception 'Tournament not found';
  end if;

  update tournament_teams tt
  set placement = nullif(p_placements->>tt.team_id::text, '')
  where tt.tournament_id = p_id;

  -- Each place holds one team, except the two losing semifinalists.
  for v_place in select unnest(case when v_t.scoring = 'semifinals'
                                    then array['champion', 'runner_up', 'semifinal']
                                    else array['champion', 'runner_up', 'third', 'fourth'] end) loop
    select count(*) into v_n from tournament_teams where tournament_id = p_id and placement = v_place;
    if v_n > (case when v_place = 'semifinal' then 2 else 1 end) then
      raise exception 'Too many teams marked %', replace(v_place, '_', '-');
    end if;
  end loop;
  if exists (select 1 from tournament_teams where tournament_id = p_id and placement is not null
             and placement <> all (case when v_t.scoring = 'semifinals'
                                        then array['champion', 'runner_up', 'semifinal']
                                        else array['champion', 'runner_up', 'third', 'fourth'] end)) then
    raise exception 'That place isn''t part of this tournament''s scoring';
  end if;

  perform grade_tournament(p_id);
  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_t.pool_id, auth.uid(), 'set_tournament_results', jsonb_build_object('tournament_id', p_id, 'placements', p_placements));
end;
$$;

-- A player's champion pick (p_team_id null clears it). Open until the tournament locks. A
-- co-manager picks for the entry they run; the commissioner can set any player's pick, even
-- after the lock.
create or replace function submit_tournament_pick(p_tournament_id uuid, p_team_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t tournaments%rowtype;
  v_user uuid;
  v_manager boolean;
  v_on_behalf boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_t from tournaments where id = p_tournament_id;
  if not found or not is_pool_member(v_t.pool_id) then raise exception 'Tournament not found'; end if;

  v_user := coalesce(p_user_id, auth.uid());
  v_manager := v_user <> auth.uid() and exists (
    select 1 from entry_managers where pool_id = v_t.pool_id and owner_id = v_user and manager_id = auth.uid());
  v_on_behalf := v_user <> auth.uid() and not v_manager;
  if v_on_behalf and not is_commissioner(v_t.pool_id) then
    raise exception 'Only the commissioner can pick for another player';
  end if;
  if not exists (select 1 from pool_members where pool_id = v_t.pool_id and user_id = v_user) then
    raise exception 'You don''t have an entry in this pool';
  end if;
  if not v_on_behalf and v_t.lock_at <= now() then
    raise exception '% picks are locked', v_t.name;
  end if;

  if p_team_id is null then
    delete from tournament_picks where tournament_id = p_tournament_id and user_id = v_user;
  else
    if not exists (select 1 from tournament_teams where tournament_id = p_tournament_id and team_id = p_team_id) then
      raise exception 'That team isn''t in the % field', v_t.name;
    end if;
    insert into tournament_picks (tournament_id, user_id, team_id, updated_at)
    values (p_tournament_id, v_user, p_team_id, now())
    on conflict (tournament_id, user_id) do update set team_id = excluded.team_id, updated_at = now();
    perform grade_tournament(p_tournament_id);
  end if;
end;
$$;

revoke execute on function grade_tournament(uuid) from public, anon, authenticated;
revoke execute on function save_tournament(uuid, uuid, text, int, timestamptz, text, uuid[]) from public, anon;
revoke execute on function delete_tournament(uuid) from public, anon;
revoke execute on function set_tournament_results(uuid, jsonb) from public, anon;
revoke execute on function submit_tournament_pick(uuid, uuid, uuid) from public, anon;
grant execute on function save_tournament(uuid, uuid, text, int, timestamptz, text, uuid[]) to authenticated;
grant execute on function delete_tournament(uuid) to authenticated;
grant execute on function set_tournament_results(uuid, jsonb) to authenticated;
grant execute on function submit_tournament_pick(uuid, uuid, uuid) to authenticated;
