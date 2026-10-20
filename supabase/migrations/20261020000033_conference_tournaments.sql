-- Conference tournaments: a third scoring style, 'champion_only' — the correct champion is
-- worth 5, nothing else scores. Places allowed per style now come from one function.

alter table tournaments drop constraint if exists tournaments_scoring_check;
alter table tournaments add constraint tournaments_scoring_check
  check (scoring in ('third_place', 'semifinals', 'champion_only'));

-- The finishing places a scoring style uses.
create or replace function tournament_places(p_scoring text) returns text[]
language sql immutable as $$
  select case p_scoring
    when 'semifinals' then array['champion', 'runner_up', 'semifinal']
    when 'champion_only' then array['champion']
    else array['champion', 'runner_up', 'third', 'fourth']
  end;
$$;

create or replace function tournament_place_points(p_scoring text, p_placement text) returns numeric
language sql immutable as $$
  select case
    when p_placement is null or not (p_placement = any (tournament_places(p_scoring))) then 0
    when p_placement = 'champion' then 5
    when p_placement = 'runner_up' then 3
    when p_placement = 'third' then 2
    when p_placement = 'fourth' then 1
    when p_placement = 'semifinal' then 1.5
    else 0
  end;
$$;

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

  -- A changed scoring style may leave places it doesn't use.
  update tournament_teams tt
  set placement = null
  from tournaments t
  where tt.tournament_id = v_id and t.id = v_id
    and tt.placement is not null and not (tt.placement = any (tournament_places(t.scoring)));
  perform grade_tournament(v_id);

  insert into audit_log (pool_id, actor_id, action, detail)
  values (p_pool_id, auth.uid(), 'save_tournament', jsonb_build_object('tournament_id', v_id, 'name', p_name, 'teams', array_length(p_team_ids, 1)));
  return v_id;
end;
$$;

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

  if exists (select 1 from tournament_teams where tournament_id = p_id and placement is not null
             and not (placement = any (tournament_places(v_t.scoring)))) then
    raise exception 'That place isn''t part of this tournament''s scoring';
  end if;
  -- Each place holds one team, except the two losing semifinalists.
  foreach v_place in array tournament_places(v_t.scoring) loop
    select count(*) into v_n from tournament_teams where tournament_id = p_id and placement = v_place;
    if v_n > (case when v_place = 'semifinal' then 2 else 1 end) then
      raise exception 'Too many teams marked %', replace(v_place, '_', '-');
    end if;
  end loop;

  perform grade_tournament(p_id);
  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_t.pool_id, auth.uid(), 'set_tournament_results', jsonb_build_object('tournament_id', p_id, 'placements', p_placements));
end;
$$;
