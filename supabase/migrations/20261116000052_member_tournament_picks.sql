-- The commissioner's view of one player's champion picks (Admin → Roster → a player's picks),
-- like member_picks for games. Row security hides other players' champion picks until a
-- tournament locks, even from the commissioner, so that page showed "no pick" for everyone.
create or replace function member_tournament_picks(p_pool_id uuid, p_user_id uuid)
returns table (tournament_id uuid, user_id uuid, team_id uuid, points numeric)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can view this';
  end if;
  return query
    select tp.tournament_id, tp.user_id, tp.team_id, tp.points
    from tournament_picks tp join tournaments t on t.id = tp.tournament_id
    where t.pool_id = p_pool_id and tp.user_id = p_user_id;
end;
$$;
revoke execute on function member_tournament_picks(uuid, uuid) from public, anon;
grant execute on function member_tournament_picks(uuid, uuid) to authenticated;
