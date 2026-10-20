-- NCAA Tournament bracket (basketball). The commissioner sets the 64-team field (after the
-- First Four) in four regions; every entry fills out a bracket before the first-round tip;
-- the commissioner enters each game's winner and every bracket scores at once.
--
-- Layout: slot = region * 16 + position, region 0–3 (regions 0 & 1 meet in one national
-- semifinal, 2 & 3 in the other). Positions run in bracket order, so first-round game g plays
-- slots 2g and 2g+1: seeds 1,16 · 8,9 · 5,12 · 4,13 · 6,11 · 3,14 · 7,10 · 2,15.
-- Games: round 1 has 32 (game g), round 2 has 16 … round 6 (the final) has 1; game g in
-- round r is played by the winners of games 2g and 2g+1 in round r−1.
-- Picks and results are jsonb maps {"r-g": team_id}.
-- Scoring: a correct pick earns points by round and by the winner's seed (upsets pay more);
-- see bracket_round_points. It's its own line in the standings.

create table if not exists brackets (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  name text not null default 'NCAA Tournament' check (char_length(btrim(name)) between 1 and 80),
  week int not null check (week >= 1),
  lock_at timestamptz not null,
  regions text[] not null check (array_length(regions, 1) = 4),
  created_at timestamptz not null default now()
);
create index if not exists brackets_pool_idx on brackets (pool_id);

create table if not exists bracket_teams (
  bracket_id uuid not null references brackets(id) on delete cascade,
  slot smallint not null check (slot between 0 and 63),
  team_id uuid not null references teams(id),
  primary key (bracket_id, slot),
  unique (bracket_id, team_id)
);

create table if not exists bracket_results (
  bracket_id uuid primary key references brackets(id) on delete cascade,
  results jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists bracket_entries (
  bracket_id uuid not null references brackets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  picks jsonb not null default '{}',
  points numeric(6,1) not null default 0,
  correct int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bracket_id, user_id)
);

alter table brackets enable row level security;
alter table bracket_teams enable row level security;
alter table bracket_results enable row level security;
alter table bracket_entries enable row level security;

drop policy if exists brackets_read on brackets;
create policy brackets_read on brackets for select using (is_pool_member(pool_id));
drop policy if exists bracket_teams_read on bracket_teams;
create policy bracket_teams_read on bracket_teams for select using (
  exists (select 1 from brackets b where b.id = bracket_id and is_pool_member(b.pool_id)));
drop policy if exists bracket_results_read on bracket_results;
create policy bracket_results_read on bracket_results for select using (
  exists (select 1 from brackets b where b.id = bracket_id and is_pool_member(b.pool_id)));
-- Your own bracket (and the entry you co-manage) always; everyone's once the bracket locks.
drop policy if exists bracket_entries_read on bracket_entries;
create policy bracket_entries_read on bracket_entries for select using (
  user_id = auth.uid()
  or exists (
    select 1 from brackets b
    where b.id = bracket_id
      and ((b.lock_at <= now() and is_pool_member(b.pool_id))
        or exists (select 1 from entry_managers em
                   where em.pool_id = b.pool_id and em.owner_id = bracket_entries.user_id and em.manager_id = auth.uid())))
);
grant select on brackets, bracket_teams, bracket_results, bracket_entries to authenticated;

-- Seed for a position in a region (bracket order).
create or replace function bracket_seed(p_slot int) returns int
language sql immutable as $$
  select (array[1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15])[1 + p_slot % 16];
$$;

-- Points for correctly picking the winner of a round-p_round game, by the winner's seed.
create or replace function bracket_round_points(p_round int, p_seed int) returns numeric
language sql immutable as $$
  select case p_round
    when 1 then case when p_seed <= 8 then 2 when p_seed <= 12 then 3 when p_seed <= 14 then 4 else 5 end
    when 2 then case when p_seed <= 4 then 3 when p_seed <= 6 then 4 when p_seed <= 12 then 5 when p_seed <= 14 then 6 else 7 end
    when 3 then case when p_seed <= 2 then 5 when p_seed <= 4 then 6 when p_seed <= 6 then 7 when p_seed <= 8 then 8 when p_seed <= 12 then 9 else 10 end
    when 4 then case when p_seed = 1 then 7 when p_seed = 2 then 8 when p_seed <= 4 then 9 when p_seed <= 6 then 10 when p_seed <= 8 then 11 when p_seed <= 12 then 12 else 13 end
    when 5 then case when p_seed = 1 then 10 when p_seed = 2 then 12 when p_seed <= 4 then 14 when p_seed <= 6 then 15 when p_seed <= 8 then 16 when p_seed <= 12 then 18 else 20 end
    when 6 then case when p_seed = 1 then 12 when p_seed = 2 then 14 when p_seed <= 4 then 16 when p_seed <= 6 then 18 when p_seed <= 8 then 20 when p_seed <= 12 then 22 else 24 end
    else 0
  end;
$$;

-- Null if p_map (picks or results) is consistent with the bracket, else what's wrong: every key
-- is a real game, and every team is one that could be in that game (a first-round team, or
-- the map's own winner of one of the two games feeding it).
create or replace function bracket_check(p_bracket_id uuid, p_map jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_key text;
  v_val text;
  v_r int;
  v_g int;
  v_ok boolean;
begin
  for v_key, v_val in select key, value #>> '{}' from jsonb_each(coalesce(p_map, '{}')) loop
    if v_key !~ '^[1-6]-\d{1,2}$' then return 'Unknown game ' || v_key; end if;
    v_r := split_part(v_key, '-', 1)::int;
    v_g := split_part(v_key, '-', 2)::int;
    if v_g >= (32 >> (v_r - 1)) then return 'Unknown game ' || v_key; end if;
    if v_val is null or v_val = '' then continue; end if;
    if v_r = 1 then
      v_ok := exists (select 1 from bracket_teams where bracket_id = p_bracket_id
                      and slot in (2 * v_g, 2 * v_g + 1) and team_id::text = v_val);
    else
      v_ok := v_val in (coalesce(p_map ->> ((v_r - 1) || '-' || (2 * v_g)), ''),
                        coalesce(p_map ->> ((v_r - 1) || '-' || (2 * v_g + 1)), ''));
    end if;
    if not v_ok then
      return 'A pick doesn''t follow the bracket (round ' || v_r || ')';
    end if;
  end loop;
  return null;
end;
$$;

-- p_map with every pick that no longer fits the bracket removed, along with the later-round
-- picks that depended on it (used when the commissioner changes the field).
create or replace function bracket_prune(p_bracket_id uuid, p_map jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb := '{}';
  v_r int;
  v_g int;
  v_val text;
begin
  for v_r in 1..6 loop
    for v_g in 0..(32 >> (v_r - 1)) - 1 loop
      v_val := p_map ->> (v_r || '-' || v_g);
      if v_val is null or v_val = '' then continue; end if;
      if (v_r = 1 and exists (select 1 from bracket_teams where bracket_id = p_bracket_id
                               and slot in (2 * v_g, 2 * v_g + 1) and team_id::text = v_val))
         or (v_r > 1 and v_val in (coalesce(v_out ->> ((v_r - 1) || '-' || (2 * v_g)), ''),
                                   coalesce(v_out ->> ((v_r - 1) || '-' || (2 * v_g + 1)), ''))) then
        v_out := v_out || jsonb_build_object(v_r || '-' || v_g, v_val);
      end if;
    end loop;
  end loop;
  return v_out;
end;
$$;

-- Re-scores every bracket in a tournament from its results.
create or replace function grade_bracket(p_bracket_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_results jsonb;
begin
  select results into v_results from bracket_results where bracket_id = p_bracket_id;
  update bracket_entries e
  set points = coalesce(s.points, 0), correct = coalesce(s.correct, 0)
  from (
    select e2.user_id,
           sum(bracket_round_points(split_part(r.key, '-', 1)::int, bracket_seed(bt.slot))) as points,
           count(*)::int as correct
    from bracket_entries e2
    join jsonb_each_text(coalesce(v_results, '{}')) r on (e2.picks ->> r.key) = r.value
    join bracket_teams bt on bt.bracket_id = p_bracket_id and bt.team_id::text = r.value
    where e2.bracket_id = p_bracket_id
    group by e2.user_id
  ) s
  where e.bracket_id = p_bracket_id and e.user_id = s.user_id;
  -- Brackets with no correct picks yet.
  update bracket_entries e set points = 0, correct = 0
  where e.bracket_id = p_bracket_id
    and not exists (select 1 from jsonb_each_text(coalesce(v_results, '{}')) r where (e.picks ->> r.key) = r.value);
end;
$$;

-- Commissioner: create (p_id null) or edit the bracket and its field. p_team_ids is the 64
-- teams in slot order (region by region, bracket order within each region).
create or replace function save_bracket(
  p_pool_id uuid, p_id uuid, p_name text, p_week int, p_lock_at timestamptz, p_regions text[], p_team_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
  v_sport text;
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can set up the bracket';
  end if;
  if coalesce(array_length(p_regions, 1), 0) <> 4 or exists (select 1 from unnest(p_regions) r where btrim(coalesce(r, '')) = '') then
    raise exception 'Name all four regions';
  end if;
  if coalesce(array_length(p_team_ids, 1), 0) <> 64 or array_position(p_team_ids, null) is not null then
    raise exception 'Fill in all 64 teams';
  end if;
  if (select count(distinct t) from unnest(p_team_ids) t) <> 64 then
    raise exception 'A team is in the bracket twice';
  end if;
  select sport into v_sport from pools where id = p_pool_id;
  if exists (select 1 from unnest(p_team_ids) t(id) left join teams tm on tm.id = t.id where tm.id is null or tm.sport <> v_sport) then
    raise exception 'Every team must be a % team', v_sport;
  end if;

  if v_id is null then
    insert into brackets (pool_id, name, week, lock_at, regions)
    values (p_pool_id, coalesce(nullif(btrim(p_name), ''), 'NCAA Tournament'), p_week, p_lock_at, p_regions)
    returning id into v_id;
    insert into bracket_results (bracket_id) values (v_id);
  else
    update brackets
    set name = coalesce(nullif(btrim(p_name), ''), name), week = p_week, lock_at = p_lock_at, regions = p_regions
    where id = v_id and pool_id = p_pool_id;
    if not found then raise exception 'Bracket not found'; end if;
  end if;

  -- Replace the field. Picks and results on a team that's no longer in its spot are dropped,
  -- with the later picks that depended on them; everything else stays.
  delete from bracket_teams where bracket_id = v_id;
  insert into bracket_teams (bracket_id, slot, team_id)
  select v_id, (o - 1)::smallint, t from unnest(p_team_ids) with ordinality as x(t, o);
  update bracket_entries set picks = bracket_prune(v_id, picks), updated_at = now()
  where bracket_id = v_id and bracket_check(v_id, picks) is not null;
  update bracket_results set results = bracket_prune(v_id, results), updated_at = now()
  where bracket_id = v_id and bracket_check(v_id, results) is not null;
  perform grade_bracket(v_id);

  insert into audit_log (pool_id, actor_id, action, detail)
  values (p_pool_id, auth.uid(), 'save_bracket', jsonb_build_object('bracket_id', v_id));
  return v_id;
end;
$$;

create or replace function delete_bracket(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid;
begin
  select pool_id into v_pool from brackets where id = p_id;
  if v_pool is null or not is_commissioner(v_pool) then raise exception 'Bracket not found'; end if;
  delete from brackets where id = p_id;
  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_pool, auth.uid(), 'delete_bracket', jsonb_build_object('bracket_id', p_id));
end;
$$;

-- Commissioner: the winners so far, as {"r-g": team_id}. Every bracket re-scores.
create or replace function set_bracket_results(p_id uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid;
  v_err text;
  v_clean jsonb;
begin
  select pool_id into v_pool from brackets where id = p_id;
  if v_pool is null or not is_commissioner(v_pool) then raise exception 'Bracket not found'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into v_clean
  from jsonb_each(coalesce(p_results, '{}')) where coalesce(value #>> '{}', '') <> '';
  v_err := bracket_check(p_id, v_clean);
  if v_err is not null then raise exception '%', v_err; end if;
  insert into bracket_results (bracket_id, results, updated_at) values (p_id, v_clean, now())
  on conflict (bracket_id) do update set results = excluded.results, updated_at = now();
  perform grade_bracket(p_id);
end;
$$;

-- A player's bracket (the whole thing each save). Open until the lock; a co-manager saves the
-- entry they run; the commissioner can save any player's, even after the lock.
create or replace function submit_bracket(p_bracket_id uuid, p_picks jsonb, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_b brackets%rowtype;
  v_user uuid;
  v_manager boolean;
  v_on_behalf boolean;
  v_err text;
  v_clean jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_b from brackets where id = p_bracket_id;
  if not found or not is_pool_member(v_b.pool_id) then raise exception 'Bracket not found'; end if;

  v_user := coalesce(p_user_id, auth.uid());
  v_manager := v_user <> auth.uid() and exists (
    select 1 from entry_managers where pool_id = v_b.pool_id and owner_id = v_user and manager_id = auth.uid());
  v_on_behalf := v_user <> auth.uid() and not v_manager;
  if v_on_behalf and not is_commissioner(v_b.pool_id) then
    raise exception 'Only the commissioner can fill out another player''s bracket';
  end if;
  if not exists (select 1 from pool_members where pool_id = v_b.pool_id and user_id = v_user) then
    raise exception 'You don''t have an entry in this pool';
  end if;
  if not v_on_behalf and v_b.lock_at <= now() then
    raise exception 'Brackets are locked';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}') into v_clean
  from jsonb_each(coalesce(p_picks, '{}')) where coalesce(value #>> '{}', '') <> '';
  v_err := bracket_check(p_bracket_id, v_clean);
  if v_err is not null then raise exception '%', v_err; end if;

  insert into bracket_entries (bracket_id, user_id, picks, updated_at)
  values (p_bracket_id, v_user, v_clean, now())
  on conflict (bracket_id, user_id) do update set picks = excluded.picks, updated_at = now();
  perform grade_bracket(p_bracket_id);
end;
$$;

revoke execute on function grade_bracket(uuid) from public, anon, authenticated;
revoke execute on function bracket_check(uuid, jsonb) from public, anon, authenticated;
revoke execute on function bracket_prune(uuid, jsonb) from public, anon, authenticated;
revoke execute on function save_bracket(uuid, uuid, text, int, timestamptz, text[], uuid[]) from public, anon;
revoke execute on function delete_bracket(uuid) from public, anon;
revoke execute on function set_bracket_results(uuid, jsonb) from public, anon;
revoke execute on function submit_bracket(uuid, jsonb, uuid) from public, anon;
grant execute on function save_bracket(uuid, uuid, text, int, timestamptz, text[], uuid[]) to authenticated;
grant execute on function delete_bracket(uuid) to authenticated;
grant execute on function set_bracket_results(uuid, jsonb) to authenticated;
grant execute on function submit_bracket(uuid, jsonb, uuid) to authenticated;
