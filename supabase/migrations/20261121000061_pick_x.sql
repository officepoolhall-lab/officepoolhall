-- NCAA Pick X: each entry picks a set number of NCAA Tournament teams and scores every time one
-- of them wins. A Pick X pool is a college basketball pool with settings.format = 'pick_x' and
-- its rules in settings.pick_x:
--   picks   how many teams each entry picks (default 8)
--   scoring { seed: bool, rounds: [6 numbers], bonus: number }: a win in round r is worth
--           (seed, or 1) × rounds[r] + bonus
--   limits  { one_per_seed: bool, max_per_region: int|null, min_seed_total: int|null }
-- The field, the lock time and the winners come from the pool's bracket (brackets,
-- bracket_teams, bracket_results), set on the Commissioner → Bracket page.

create table if not exists pickx_entries (
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  team_ids uuid[] not null default '{}',
  -- The commissioner, when they changed this entry's picks for the player.
  edited_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
alter table pickx_entries enable row level security;

-- Own picks always; the entries the viewer co-manages; everyone's once the bracket locks.
drop policy if exists pickx_entries_read on pickx_entries;
create policy pickx_entries_read on pickx_entries for select using (
  user_id = (select auth.uid())
  or (pool_id::text || ':' || user_id::text) = any ((select my_managed_entries())::text[])
  or (pool_id = any ((select my_viewable_pools())::uuid[])
      and exists (select 1 from brackets b where b.pool_id = pickx_entries.pool_id and b.lock_at <= now())));
grant select on pickx_entries to authenticated;

-- A bracket slot's seed (slot = region * 16 + position in bracket order).
create or replace function pickx_seed(p_slot int) returns int
language sql immutable as $$
  select (array[1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15])[p_slot % 16 + 1];
$$;

/**
 * Save an entry's teams (up to the pool's number). The player, a co-manager of their entry, or
 * the commissioner (who may also change picks after the lock). Checks every rule in
 * settings.pick_x.limits.
 */
create or replace function submit_pickx(p_pool_id uuid, p_team_ids uuid[], p_user_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_settings jsonb;
  v_rules jsonb;
  v_bracket brackets%rowtype;
  v_commish boolean;
  v_manager boolean;
  v_n int;
  v_count int;
  v_slots int[];
  v_max_region int;
  v_min_total int;
begin
  if v_me is null then
    raise exception 'Not signed in';
  end if;
  select settings into v_settings from pools where id = p_pool_id;
  if v_settings is null or coalesce(v_settings->>'format', '') <> 'pick_x' then
    raise exception 'This isn''t a Pick X pool';
  end if;
  v_rules := coalesce(v_settings->'pick_x', '{}'::jsonb);

  v_commish := exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = p_pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then
    raise exception 'You can only make your own picks';
  end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_user) then
    raise exception 'That entry isn''t in this pool';
  end if;

  select * into v_bracket from brackets where pool_id = p_pool_id order by created_at desc limit 1;
  if not found then
    raise exception 'The tournament field isn''t set yet';
  end if;
  -- After the lock only the commissioner, changing someone else's picks.
  if v_bracket.lock_at <= now() and not (v_commish and v_user <> v_me) then
    raise exception 'Picks are locked';
  end if;

  p_team_ids := coalesce(p_team_ids, '{}');
  v_count := coalesce(array_length(p_team_ids, 1), 0);
  v_n := greatest(1, coalesce((v_rules->>'picks')::int, 8));
  if v_count > v_n then
    raise exception 'Pick no more than % teams', v_n;
  end if;
  if (select count(distinct x) from unnest(p_team_ids) x) <> v_count then
    raise exception 'Each team can only be picked once';
  end if;

  select coalesce(array_agg(slot::int), '{}') into v_slots from bracket_teams where bracket_id = v_bracket.id and team_id = any (p_team_ids);
  if coalesce(array_length(v_slots, 1), 0) <> v_count then
    raise exception 'Every pick has to be a team in the tournament field';
  end if;

  if coalesce((v_rules->'limits'->>'one_per_seed')::boolean, false)
     and (select count(distinct pickx_seed(s)) from unnest(v_slots) s) <> v_count then
    raise exception 'Only one team from each seed line';
  end if;

  v_max_region := nullif(v_rules->'limits'->>'max_per_region', '')::int;
  if v_max_region is not null and exists (
    select 1 from unnest(v_slots) s group by s / 16 having count(*) > v_max_region
  ) then
    raise exception 'No more than % teams from one region', v_max_region;
  end if;

  -- The seed total only applies to a full set of picks (a partial save can still be short).
  v_min_total := nullif(v_rules->'limits'->>'min_seed_total', '')::int;
  if v_min_total is not null and v_count = v_n
     and (select sum(pickx_seed(s)) from unnest(v_slots) s) < v_min_total then
    raise exception 'Your seeds have to add up to at least %', v_min_total;
  end if;

  insert into pickx_entries (pool_id, user_id, team_ids, edited_by, updated_at)
  values (p_pool_id, v_user, p_team_ids, case when v_user <> v_me and v_commish then v_me end, now())
  on conflict (pool_id, user_id) do update
    set team_ids = excluded.team_ids, edited_by = excluded.edited_by, updated_at = now();
end;
$$;

grant execute on function submit_pickx(uuid, uuid[], uuid) to authenticated;
