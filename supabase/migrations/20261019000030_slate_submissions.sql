-- Who has submitted picks for a week, without revealing what they picked. Others' picks stay
-- hidden until kickoff (picks_read), so the Grid can't count them itself; this returns only
-- each member's number of picks, to anyone in the pool (members and co-managers).
create or replace function slate_submissions(p_slate_id uuid)
returns table (user_id uuid, picks int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from slates s where s.id = p_slate_id and is_pool_member(s.pool_id)) then
    raise exception 'Slate not found';
  end if;
  return query
    select m.user_id, count(p.id)::int
    from slates s
    join pool_members m on m.pool_id = s.pool_id
    left join picks p on p.slate_id = s.id and p.user_id = m.user_id
    where s.id = p_slate_id
    group by m.user_id;
end;
$$;

revoke execute on function slate_submissions(uuid) from public, anon;
grant execute on function slate_submissions(uuid) to authenticated;
