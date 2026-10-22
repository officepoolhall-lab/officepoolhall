-- Guests: people who can view a pool (standings, the Grid, everyone's picks once they're
-- visible, scores, the message board) but never make picks, post or appear as a player.
-- Guests are NOT pool members, so standings, the Grid, the roster and every write path
-- (picks, posts, tournament picks, brackets) leave them out without any change. Only the
-- read policies below let them in: can_view_pool() = member, co-manager or guest.
-- A commissioner shares a guest link (an invite marked guest) from Admin → Roster.

create table if not exists pool_guests (
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
create index if not exists pool_guests_user_idx on pool_guests (user_id);
alter table pool_guests enable row level security;

-- The commissioner sees and removes their pool's guests; a guest sees their own rows
-- (for their list of pools). Guests are added only by join_pool().
drop policy if exists pool_guests_read on pool_guests;
create policy pool_guests_read on pool_guests for select using (user_id = auth.uid() or is_commissioner(pool_id));
drop policy if exists pool_guests_delete on pool_guests;
create policy pool_guests_delete on pool_guests for delete using (is_commissioner(pool_id));
grant select, delete on pool_guests to authenticated;

-- A guest link is an invite with guest = true; the member link stays guest = false.
alter table invites add column if not exists guest boolean not null default false;

create or replace function is_pool_guest(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from pool_guests where pool_id = p and user_id = auth.uid());
$$;

-- Read access: members, co-managers and guests.
create or replace function can_view_pool(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_pool_member(p) or is_pool_guest(p);
$$;

-- ============ Read policies: is_pool_member → can_view_pool ============

drop policy if exists pools_read on pools;
create policy pools_read on pools for select using (can_view_pool(id));

drop policy if exists members_read on pool_members;
create policy members_read on pool_members for select using (can_view_pool(pool_id));

drop policy if exists slates_read on slates;
create policy slates_read on slates for select
  using (can_view_pool(pool_id) and (status <> 'draft' or is_commissioner(pool_id)));

drop policy if exists slate_games_read on slate_games;
create policy slate_games_read on slate_games for select using (
  exists (select 1 from slates s where s.id = slate_id and can_view_pool(s.pool_id)
          and (s.status <> 'draft' or is_commissioner(s.pool_id))));

-- Same as 20261018000029: own picks, the co-managed entry's, and everyone's from kickoff
-- (or once the week is graded). Guests get only the last.
drop policy if exists picks_read on picks;
create policy picks_read on picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from slates s
    join entry_managers em on em.pool_id = s.pool_id
    where s.id = picks.slate_id and em.owner_id = picks.user_id and em.manager_id = auth.uid())
  or exists (
    select 1 from slates s
    join slate_games sg on sg.slate_id = s.id and sg.game_id = picks.game_id
    join games g on g.id = picks.game_id
    where s.id = picks.slate_id
      and can_view_pool(s.pool_id)
      and (s.status = 'graded' or game_started(g.start_at, g.time_tbd, g.status))));

drop policy if exists scores_read on slate_scores;
create policy scores_read on slate_scores for select using (
  exists (select 1 from slates s where s.id = slate_id and can_view_pool(s.pool_id)));

drop policy if exists board_posts_read on board_posts;
create policy board_posts_read on board_posts for select using (can_view_pool(pool_id));
drop policy if exists board_replies_read on board_replies;
create policy board_replies_read on board_replies for select
  using (exists (select 1 from board_posts p where p.id = post_id and can_view_pool(p.pool_id)));

drop policy if exists tournaments_read on tournaments;
create policy tournaments_read on tournaments for select using (can_view_pool(pool_id));
drop policy if exists tournament_teams_read on tournament_teams;
create policy tournament_teams_read on tournament_teams for select using (
  exists (select 1 from tournaments t where t.id = tournament_id and can_view_pool(t.pool_id)));
drop policy if exists tournament_picks_read on tournament_picks;
create policy tournament_picks_read on tournament_picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (
        (t.lock_at <= now() and can_view_pool(t.pool_id))
        or exists (select 1 from entry_managers em
                   where em.pool_id = t.pool_id and em.owner_id = tournament_picks.user_id and em.manager_id = auth.uid())
      )
  )
);

drop policy if exists brackets_read on brackets;
create policy brackets_read on brackets for select using (can_view_pool(pool_id));
drop policy if exists bracket_teams_read on bracket_teams;
create policy bracket_teams_read on bracket_teams for select using (
  exists (select 1 from brackets b where b.id = bracket_id and can_view_pool(b.pool_id)));
drop policy if exists bracket_results_read on bracket_results;
create policy bracket_results_read on bracket_results for select using (
  exists (select 1 from brackets b where b.id = bracket_id and can_view_pool(b.pool_id)));
drop policy if exists bracket_entries_read on bracket_entries;
create policy bracket_entries_read on bracket_entries for select using (
  user_id = auth.uid()
  or exists (
    select 1 from brackets b
    where b.id = bracket_id
      and ((b.lock_at <= now() and can_view_pool(b.pool_id))
        or exists (select 1 from entry_managers em
                   where em.pool_id = b.pool_id and em.owner_id = bracket_entries.user_id and em.manager_id = auth.uid())))
);

-- Who has submitted for a week (counts only): guests see the Grid too.
create or replace function slate_submissions(p_slate_id uuid)
returns table (user_id uuid, picks int)
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from slates s where s.id = p_slate_id and can_view_pool(s.pool_id)) then
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

-- ============ Joining ============

-- 20261018000029 plus guest links: a guest link adds a guest (unless they're already in the
-- pool); a member link turns a guest into a player.
create or replace function join_pool(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_invite from invites where token = p_token for update;
  if not found then
    raise exception 'That invite link is not valid';
  end if;

  select slug into v_slug from pools where id = v_invite.pool_id;

  if exists (select 1 from pool_members where pool_id = v_invite.pool_id and user_id = auth.uid()) then
    return v_slug;
  end if;
  if exists (select 1 from entry_managers where pool_id = v_invite.pool_id and manager_id = auth.uid()) then
    if v_invite.guest then return v_slug; end if;
    raise exception 'You co-manage an entry in this pool, so you can''t join with one of your own';
  end if;
  if v_invite.guest and exists (select 1 from pool_guests where pool_id = v_invite.pool_id and user_id = auth.uid()) then
    return v_slug;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'That invite link has expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'That invite link has been used up';
  end if;

  if v_invite.guest then
    insert into pool_guests (pool_id, user_id) values (v_invite.pool_id, auth.uid());
  else
    delete from pool_guests where pool_id = v_invite.pool_id and user_id = auth.uid();
    insert into pool_members (pool_id, user_id) values (v_invite.pool_id, auth.uid());
  end if;
  update invites set uses = uses + 1 where id = v_invite.id;

  return v_slug;
end;
$$;

-- The pools a guest can view (name, slug), for their pool list and the header switcher.
create or replace function my_guest_pools()
returns table (pool_id uuid, name text, slug text, sport text, added_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.name, p.slug, p.sport, g.added_at
  from pool_guests g join pools p on p.id = g.pool_id
  where g.user_id = auth.uid()
  order by g.added_at desc;
$$;
revoke execute on function my_guest_pools() from public, anon;
grant execute on function my_guest_pools() to authenticated;

-- The commissioner's list of guests with their emails.
create or replace function pool_guest_accounts(p_pool_id uuid)
returns table (user_id uuid, display_name text, email text, added_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can see guests';
  end if;
  return query
    select g.user_id, pr.display_name, u.email::text, g.added_at, u.last_sign_in_at
    from pool_guests g
    join profiles pr on pr.id = g.user_id
    join auth.users u on u.id = g.user_id
    where g.pool_id = p_pool_id
    order by pr.display_name;
end;
$$;
revoke execute on function pool_guest_accounts(uuid) from public, anon;
grant execute on function pool_guest_accounts(uuid) to authenticated;
