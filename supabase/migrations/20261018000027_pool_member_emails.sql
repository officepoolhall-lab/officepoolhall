-- Members' sign-in emails for the pool's commissioner (Admin → Roster). Emails live in
-- auth.users, which the app can't read; this hands back only this pool's members, and only
-- to its commissioner.
create or replace function pool_member_emails(p_pool_id uuid)
returns table (user_id uuid, email text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can see members'' emails';
  end if;
  return query
    select m.user_id, u.email::text
    from pool_members m
    join auth.users u on u.id = m.user_id
    where m.pool_id = p_pool_id;
end;
$$;

revoke execute on function pool_member_emails(uuid) from public, anon;
grant execute on function pool_member_emails(uuid) to authenticated;
