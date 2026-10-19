-- Members' account status for the pool's commissioner (Admin → Roster): sign-in email,
-- whether they chose a password (user_metadata.password_set; see 20261017000024), whether
-- they confirmed their name, and when they last signed in. Commissioner of that pool only.
create or replace function pool_member_accounts(p_pool_id uuid)
returns table (user_id uuid, email text, password_set boolean, name_confirmed boolean, last_sign_in_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can see members'' accounts';
  end if;
  return query
    select m.user_id,
           u.email::text,
           coalesce((u.raw_user_meta_data->>'password_set')::boolean, false),
           coalesce(p.name_confirmed, false),
           u.last_sign_in_at
    from pool_members m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.id = m.user_id
    where m.pool_id = p_pool_id;
end;
$$;

revoke execute on function pool_member_accounts(uuid) from public, anon;
grant execute on function pool_member_accounts(uuid) to authenticated;
