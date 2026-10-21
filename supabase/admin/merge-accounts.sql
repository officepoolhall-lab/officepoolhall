-- Merge one person's two accounts: move everything from the OLD account (the email they no
-- longer use) to the NEW account (the email they sign in with now). Pool entries, picks, weekly
-- scores, message board posts, tournament picks and brackets all move; the NEW account keeps
-- its own sign-in, name and password. The OLD account is left empty (delete it at the bottom).
--
-- Paste into Supabase → SQL Editor, fill in the two emails, and run. It stops with an error,
-- changing nothing, if an email isn't found or both accounts are in the same pool.

do $$
declare
  old_email text := 'OLD-EMAIL@example.com';   -- the football entry's email
  new_email text := 'NEW-EMAIL@example.com';   -- the email he signs in with now
  v_old uuid;
  v_new uuid;
  v_shared text;
  v_n int;
begin
  select id into v_old from auth.users where lower(email) = lower(trim(old_email));
  select id into v_new from auth.users where lower(email) = lower(trim(new_email));
  if v_old is null then raise exception 'No account with the email %', old_email; end if;
  if v_new is null then raise exception 'No account with the email %', new_email; end if;
  if v_old = v_new then raise exception 'Those are the same account'; end if;

  -- Both in one pool (as players or co-managers) can't be merged automatically.
  select string_agg(p.name, ', ') into v_shared
  from pools p
  where exists (select 1 from pool_members m where m.pool_id = p.id and m.user_id = v_old
                union all select 1 from entry_managers e where e.pool_id = p.id and e.manager_id = v_old)
    and exists (select 1 from pool_members m where m.pool_id = p.id and m.user_id = v_new
                union all select 1 from entry_managers e where e.pool_id = p.id and e.manager_id = v_new);
  if v_shared is not null then
    raise exception 'Both accounts are in: %. Remove one entry first.', v_shared;
  end if;

  -- Entries: add the NEW account to the OLD one's pools (same role, paid flag, join date)…
  insert into pool_members (pool_id, user_id, role, paid, joined_at)
  select pool_id, v_new, role, paid, joined_at from pool_members where user_id = v_old;
  get diagnostics v_n = row_count;
  raise notice 'Pool entries moved: %', v_n;

  -- …move everything that hangs off the entry or the person…
  update entry_managers   set owner_id = v_new    where owner_id = v_old;
  update entry_managers   set manager_id = v_new  where manager_id = v_old;
  update comanager_invites set owner_id = v_new   where owner_id = v_old;
  update comanager_invites set used_by = v_new    where used_by = v_old;
  update picks set user_id = v_new where user_id = v_old;
  get diagnostics v_n = row_count;
  raise notice 'Picks moved: %', v_n;
  update picks            set edited_by = v_new   where edited_by = v_old;
  update slate_scores     set user_id = v_new     where user_id = v_old;
  update tournament_picks set user_id = v_new     where user_id = v_old;
  update bracket_entries  set user_id = v_new     where user_id = v_old;
  update board_posts      set author_id = v_new   where author_id = v_old;
  update board_replies    set author_id = v_new   where author_id = v_old;
  update audit_log        set actor_id = v_new    where actor_id = v_old;

  -- …then drop the OLD account's now-empty entries.
  delete from pool_members where user_id = v_old;

  if exists (select 1 from pools where commissioner_id = v_old) then
    raise notice 'Note: the old account is still the commissioner of a pool; that was left as is.';
  end if;
  raise notice 'Done. % now has everything from %.', new_email, old_email;
end $$;

-- Optional, once you've checked the football pool: delete the old, now-empty account.
-- delete from auth.users where lower(email) = lower('OLD-EMAIL@example.com');
