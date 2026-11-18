-- Hand an imported entry to its real owner (Splash import: scripts/import/splash).
--
-- Imported entries are accounts with a placeholder address (…@<something>.invalid) that nobody
-- can sign in with. The commissioner gives one an email (and optionally a name):
--   * a new email: the entry's account takes it, and the person signs in with an emailed code
--     like anyone else, landing on the entry with all its picks;
--   * an email that already has an account here: the entry (membership, picks, scores and any
--     tournament, bracket or golf picks in this pool) moves onto that account, and the
--     placeholder account is deleted if it belongs to no other pool.
-- Returns 'assigned' or 'merged'.

create or replace function assign_entry_email(
  p_pool_id uuid,
  p_user_id uuid,
  p_email text,
  p_first_name text default null,
  p_last_name text default null
) returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last text := nullif(trim(coalesce(p_last_name, '')), '');
  v_name text;
  v_old text;
  v_target uuid;
  v_slates uuid[];
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can add emails to entries.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_email like '%.invalid' then
    raise exception 'Enter a valid email address.';
  end if;
  v_name := nullif(concat_ws(' ', v_first, v_last), '');

  select u.email into v_old
  from auth.users u
  join pool_members m on m.user_id = u.id and m.pool_id = p_pool_id
  where u.id = p_user_id;
  if v_old is null then
    raise exception 'That entry isn''t in this pool.';
  end if;
  if v_old not like '%.invalid' then
    raise exception 'That entry already signs in as %.', v_old;
  end if;

  select id into v_target from auth.users where lower(email) = v_email and id <> p_user_id limit 1;

  -- A new email: the entry's own account takes it.
  if v_target is null then
    update auth.users
    set email = v_email,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || case when v_name is null then '{}'::jsonb else jsonb_build_object('display_name', v_name) end,
        updated_at = now()
    where id = p_user_id;
    update auth.identities
    set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email, 'email_verified', true),
        updated_at = now()
    where user_id = p_user_id and provider = 'email';
    if v_name is not null then
      -- They confirm (or fix) it the first time they sign in.
      update profiles
      set display_name = v_name, first_name = coalesce(v_first, first_name), last_name = coalesce(v_last, last_name), name_confirmed = false
      where id = p_user_id;
    end if;
    return 'assigned';
  end if;

  -- An existing account: move the entry onto it, unless it already has its own entry here.
  select coalesce(array_agg(id), '{}') into v_slates from slates where pool_id = p_pool_id;
  if exists (select 1 from picks where user_id = v_target and slate_id = any (v_slates))
     or exists (select 1 from tournament_picks tp join tournaments t on t.id = tp.tournament_id where t.pool_id = p_pool_id and tp.user_id = v_target)
     or exists (select 1 from golf_picks where pool_id = p_pool_id and user_id = v_target)
     or exists (select 1 from golf_lineups where pool_id = p_pool_id and user_id = v_target) then
    raise exception '% already has picks of their own in this pool, so this entry can''t be moved onto that account.', v_email;
  end if;

  insert into pool_members (pool_id, user_id, role, paid, joined_at)
  select pool_id, v_target, 'player', paid, joined_at from pool_members where pool_id = p_pool_id and user_id = p_user_id
  on conflict (pool_id, user_id) do update
    set paid = pool_members.paid or excluded.paid,
        joined_at = least(pool_members.joined_at, excluded.joined_at);

  update picks set user_id = v_target where user_id = p_user_id and slate_id = any (v_slates);
  delete from slate_scores where user_id = v_target and slate_id = any (v_slates);
  update slate_scores set user_id = v_target where user_id = p_user_id and slate_id = any (v_slates);
  update tournament_picks set user_id = v_target
  where user_id = p_user_id and tournament_id in (select id from tournaments where pool_id = p_pool_id);
  delete from bracket_entries where user_id = v_target and bracket_id in (select id from brackets where pool_id = p_pool_id)
    and exists (select 1 from bracket_entries b where b.user_id = p_user_id and b.bracket_id = bracket_entries.bracket_id);
  update bracket_entries set user_id = v_target
  where user_id = p_user_id and bracket_id in (select id from brackets where pool_id = p_pool_id);
  update golf_picks set user_id = v_target where pool_id = p_pool_id and user_id = p_user_id;
  update golf_lineups set user_id = v_target where pool_id = p_pool_id and user_id = p_user_id;
  delete from entry_managers where pool_id = p_pool_id and owner_id = p_user_id and manager_id = v_target;
  update entry_managers set owner_id = v_target where pool_id = p_pool_id and owner_id = p_user_id;

  delete from pool_members where pool_id = p_pool_id and user_id = p_user_id;
  -- The placeholder account goes once it's in no pool.
  if not exists (select 1 from pool_members where user_id = p_user_id) then
    delete from auth.identities where user_id = p_user_id;
    delete from auth.users where id = p_user_id;
  end if;
  return 'merged';
end;
$$;

revoke execute on function assign_entry_email(uuid, uuid, text, text, text) from public, anon;
grant execute on function assign_entry_email(uuid, uuid, text, text, text) to authenticated;
