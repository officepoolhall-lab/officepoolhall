-- Commissioner view of who has finished picking. Counts only — never the picks
-- themselves, which stay hidden until each game starts.
create or replace function slate_progress(p_slate_id uuid)
returns table (user_id uuid, display_name text, picks int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from slates s where s.id = p_slate_id and is_commissioner(s.pool_id)) then
    raise exception 'Only the commissioner can view this';
  end if;
  return query
    select m.user_id, pr.display_name, count(p.id)::int
    from slates s
    join pool_members m on m.pool_id = s.pool_id
    join profiles pr on pr.id = m.user_id
    left join picks p on p.slate_id = s.id and p.user_id = m.user_id
    where s.id = p_slate_id
    group by m.user_id, pr.display_name
    order by count(p.id), pr.display_name;
end;
$$;
