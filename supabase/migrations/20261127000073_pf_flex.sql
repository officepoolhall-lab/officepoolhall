-- Playoff Fantasy: flex spots (settings.playoff_fantasy.flex), each taking a running back, wide
-- receiver or tight end beyond their own spots. The season roster's save checks them; weekly
-- lineups are checked by the server (lib/pfWeekly.ts).

create or replace function submit_pf_lineup(p_pool_id uuid, p_player_ids text[], p_user_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_rules jsonb;
  v_commish boolean;
  v_manager boolean;
  v_lock timestamptz;
  v_count int;
  v_found int;
  v_pos record;
  v_spots int;
  v_over int := 0;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select settings->'playoff_fantasy' into v_rules from pools where id = p_pool_id and settings->>'format' = 'playoff_fantasy';
  if v_rules is null then raise exception 'This isn''t a Playoff Fantasy pool'; end if;

  v_commish := exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = p_pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only set your own lineup'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_user) then
    raise exception 'That entry isn''t in this pool';
  end if;

  v_lock := nullif(v_rules->>'lock_at', '')::timestamptz;
  if v_lock is not null and v_lock <= now() and not (v_commish and v_user <> v_me) then
    raise exception 'Lineups are locked';
  end if;

  p_player_ids := coalesce(p_player_ids, '{}');
  v_count := coalesce(array_length(p_player_ids, 1), 0);
  if (select count(distinct x) from unnest(p_player_ids) x) <> v_count then
    raise exception 'Each player can only be picked once';
  end if;
  select count(*) into v_found from pf_players where pool_id = p_pool_id and espn_id = any (p_player_ids);
  if v_found <> v_count then raise exception 'Every pick has to be a player in the pool''s player list'; end if;

  -- One player from each team.
  if exists (
    select 1 from pf_players where pool_id = p_pool_id and espn_id = any (p_player_ids) group by team_id having count(*) > 1
  ) then
    raise exception 'Only one player from each team';
  end if;

  -- No more at a position than the roster has spots; running backs, wide receivers and tight
  -- ends past theirs fill the flex spots (settings.playoff_fantasy.flex).
  for v_pos in
    select pos, count(*) as n from pf_players where pool_id = p_pool_id and espn_id = any (p_player_ids) group by pos
  loop
    v_spots := coalesce(nullif(v_rules->'roster'->>v_pos.pos, '')::int, 0);
    if v_pos.n > v_spots then
      if v_pos.pos not in ('RB', 'WR', 'TE') then
        raise exception 'Too many at % for this roster', v_pos.pos;
      end if;
      v_over := v_over + (v_pos.n - v_spots);
    end if;
  end loop;
  if v_over > coalesce(nullif(v_rules->>'flex', '')::int, 0) then
    raise exception 'Too many running backs, receivers and tight ends: the flex spots are full';
  end if;

  insert into pf_lineups (pool_id, user_id, player_ids, edited_by, updated_at)
  values (p_pool_id, v_user, p_player_ids, case when v_user <> v_me and v_commish then v_me end, now())
  on conflict (pool_id, user_id) do update
    set player_ids = excluded.player_ids, edited_by = excluded.edited_by, updated_at = now();
end;
$$;

revoke execute on function submit_pf_lineup(uuid, text[], uuid) from public, anon;
grant execute on function submit_pf_lineup(uuid, text[], uuid) to authenticated;
