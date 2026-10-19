-- Co-managers: a player (the entry's owner) can invite anyone to help run their entry in a
-- pool. A co-manager makes and changes the owner's picks under the same lock rules, can read
-- the pool like a member, and can't hold an entry of their own in that pool. Everything goes
-- through the functions below; the app never writes these tables directly.

create table if not exists entry_managers (
  pool_id uuid not null references pools(id) on delete cascade,
  owner_id uuid not null,
  manager_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One entry per co-manager per pool.
  primary key (pool_id, manager_id),
  check (owner_id <> manager_id),
  -- Removing the owner's entry removes its co-managers.
  foreign key (pool_id, owner_id) references pool_members(pool_id, user_id) on delete cascade
);
create index if not exists entry_managers_owner_idx on entry_managers (pool_id, owner_id);

create table if not exists comanager_invites (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null,
  owner_id uuid not null,
  token text unique not null default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null,
  foreign key (pool_id, owner_id) references pool_members(pool_id, user_id) on delete cascade
);

alter table entry_managers enable row level security;
alter table comanager_invites enable row level security;
-- Reads go through the functions; nothing is read or written directly.

-- ============ Access ============

-- Co-managers can read the pool like members do (slates, games, standings, the grid).
create or replace function is_pool_member(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from pool_members where pool_id = p and user_id = auth.uid())
      or exists (select 1 from entry_managers where pool_id = p and manager_id = auth.uid());
$$;

-- Picks: own picks always; the entry a co-manager runs, always; others' picks from kickoff
-- (or once the week is graded) — 20261018000025 plus the co-manager clause.
drop policy picks_read on picks;
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
      and is_pool_member(s.pool_id)
      and (s.status = 'graded' or game_started(g.start_at, g.time_tbd, g.status))));

-- A co-manager can't also join the pool with an entry of their own.
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
    raise exception 'You co-manage an entry in this pool, so you can''t join with one of your own';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'That invite link has expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'That invite link has been used up';
  end if;

  insert into pool_members (pool_id, user_id) values (v_invite.pool_id, auth.uid());
  update invites set uses = uses + 1 where id = v_invite.id;

  return v_slug;
end;
$$;

-- ============ Invites ============

-- The owner's link to hand a co-manager. Replaces their earlier unused link for this pool.
create or replace function create_comanager_invite(p_pool_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = auth.uid()) then
    raise exception 'Only a player with an entry in this pool can invite a co-manager';
  end if;
  delete from comanager_invites where pool_id = p_pool_id and owner_id = auth.uid() and used_at is null;
  insert into comanager_invites (pool_id, owner_id) values (p_pool_id, auth.uid()) returning token into v_token;
  return v_token;
end;
$$;

-- Whose entry an invite is for, so the invite page can say so before accepting.
create or replace function comanager_invite_info(p_token text)
returns table (pool_name text, owner_name text, usable boolean)
language sql security definer stable set search_path = public as $$
  select p.name, pr.display_name, (i.used_at is null and i.expires_at > now())
  from comanager_invites i
  join pools p on p.id = i.pool_id
  join profiles pr on pr.id = i.owner_id
  where i.token = p_token;
$$;

create or replace function accept_comanager_invite(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_invite comanager_invites%rowtype;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into v_invite from comanager_invites where token = p_token for update;
  if not found then
    raise exception 'That co-manager link is not valid';
  end if;
  select slug into v_slug from pools where id = v_invite.pool_id;

  -- Already this entry's co-manager (e.g. opening the link twice): just go there.
  if exists (select 1 from entry_managers
             where pool_id = v_invite.pool_id and owner_id = v_invite.owner_id and manager_id = auth.uid()) then
    return v_slug;
  end if;
  if v_invite.used_at is not null then
    raise exception 'That co-manager link has already been used. Ask for a new one';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'That co-manager link has expired. Ask for a new one';
  end if;
  if v_invite.owner_id = auth.uid() then
    raise exception 'That''s your own entry. Send the link to the person you want as co-manager';
  end if;
  if exists (select 1 from pool_members where pool_id = v_invite.pool_id and user_id = auth.uid()) then
    raise exception 'You have your own entry in this pool, so you can''t co-manage another';
  end if;
  if exists (select 1 from entry_managers where pool_id = v_invite.pool_id and manager_id = auth.uid()) then
    raise exception 'You already co-manage an entry in this pool';
  end if;

  insert into entry_managers (pool_id, owner_id, manager_id) values (v_invite.pool_id, v_invite.owner_id, auth.uid());
  update comanager_invites set used_at = now(), used_by = auth.uid() where id = v_invite.id;
  return v_slug;
end;
$$;

-- The owner removes a co-manager, a co-manager steps down, or the commissioner tidies up.
create or replace function remove_comanager(p_pool_id uuid, p_manager_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (
    auth.uid() = p_manager_id
    or is_commissioner(p_pool_id)
    or exists (select 1 from entry_managers where pool_id = p_pool_id and manager_id = p_manager_id and owner_id = auth.uid())
  ) then
    raise exception 'You can''t remove that co-manager';
  end if;
  delete from entry_managers where pool_id = p_pool_id and manager_id = p_manager_id;
end;
$$;

-- ============ Reads ============

-- The entries the signed-in player co-manages (My pools, the pool switcher, acting as the owner).
create or replace function my_comanaged_entries()
returns table (pool_id uuid, slug text, pool_name text, sport text, season int, owner_id uuid, owner_name text)
language sql security definer stable set search_path = public as $$
  select p.id, p.slug, p.name, p.sport, p.season, em.owner_id, pr.display_name
  from entry_managers em
  join pools p on p.id = em.pool_id
  join profiles pr on pr.id = em.owner_id
  where em.manager_id = auth.uid();
$$;

-- Co-managers of the signed-in player's own entries, plus their unused invite links (Account).
create or replace function my_entry_comanagers()
returns table (pool_id uuid, manager_id uuid, manager_name text)
language sql security definer stable set search_path = public as $$
  select em.pool_id, em.manager_id, pr.display_name
  from entry_managers em
  join profiles pr on pr.id = em.manager_id
  where em.owner_id = auth.uid();
$$;

-- Every entry's co-managers with their emails, for the pool's commissioner (Roster).
create or replace function pool_comanagers(p_pool_id uuid)
returns table (owner_id uuid, manager_id uuid, manager_name text, email text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can see co-managers'' emails';
  end if;
  return query
    select em.owner_id, em.manager_id, pr.display_name, u.email::text
    from entry_managers em
    join profiles pr on pr.id = em.manager_id
    join auth.users u on u.id = em.manager_id
    where em.pool_id = p_pool_id;
end;
$$;

-- ============ Picks ============

-- submit_picks: the 20261018000026 version, plus co-managers saving the owner's entry.
create or replace function submit_picks(p_slate_id uuid, p_picks jsonb, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
  v_user uuid;
  v_game uuid;
  v_started boolean;
  v_conf int;
  v_on_behalf boolean;
  v_manager boolean;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_slate from slates where id = p_slate_id;
  if not found or not is_pool_member(v_slate.pool_id) then
    raise exception 'Slate not found';
  end if;

  v_user := coalesce(p_user_id, auth.uid());
  -- A co-manager saves the owner's entry as the owner would: same locks, same full-card rule,
  -- no commissioner mark. Anyone else naming another player is the commissioner's on-behalf edit.
  v_manager := v_user <> auth.uid() and exists (
    select 1 from entry_managers
    where pool_id = v_slate.pool_id and owner_id = v_user and manager_id = auth.uid());
  v_on_behalf := v_user <> auth.uid() and not v_manager;
  -- Managers count as pool members for reading, but only real entries hold picks.
  if not exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_user) then
    raise exception 'You don''t have an entry in this pool';
  end if;
  if v_on_behalf then
    if not is_commissioner(v_slate.pool_id) then
      raise exception 'Only the commissioner can enter picks for another player';
    end if;
    if not exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_user) then
      raise exception 'That player is not in this pool';
    end if;
    -- An on-behalf save regrades the slate below, and grade_slate (like the poller's
    -- grade_game) locks the slate row before touching picks. Take it first here too, so
    -- both paths lock in the same order and can't deadlock.
    select * into v_slate from slates where id = p_slate_id for update;
  end if;

  if v_on_behalf then
    if v_slate.status = 'draft' then
      raise exception 'This slate is not open for picks';
    end if;
  else
    if v_slate.status <> 'open' then
      raise exception 'This slate is not open for picks';
    end if;
    -- Every per-game deadline is at or before the slate's, so past it nothing can change.
    if v_slate.lock_at is not null and now() >= v_slate.lock_at then
      raise exception 'Picks for this slate are locked';
    end if;
  end if;
  if jsonb_typeof(p_picks) is distinct from 'array' then
    raise exception 'picks must be a JSON array';
  end if;

  select settings into v_settings from pools where id = v_slate.pool_id;

  -- One save at a time per player per slate.
  perform pg_advisory_xact_lock(hashtextextended(p_slate_id::text || v_user::text, 0));

  create temp table if not exists _submitted (
    game_id uuid, picked_side text, confidence int
  ) on commit drop;
  truncate _submitted;
  insert into _submitted
    select s.game_id, s.picked_side, s.confidence
    from jsonb_to_recordset(p_picks) as s(game_id uuid, picked_side text, confidence int);

  -- Lock state of every game on the slate, evaluated once. On the commissioner's
  -- on-behalf edits nothing is locked.
  create temp table if not exists _locks (
    game_id uuid, voided boolean, locked boolean, started boolean
  ) on commit drop;
  truncate _locks;
  insert into _locks
    select sg.game_id, sg.voided,
           not v_on_behalf and game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, v_slate.lock_at)),
           game_started(g.start_at, g.time_tbd, g.status)
    from slate_games sg join games g on g.id = sg.game_id
    where sg.slate_id = p_slate_id;

  -- Shape
  if exists (select 1 from _submitted where game_id is null or picked_side is null
                                         or picked_side not in ('home','away')) then
    raise exception 'Each pick needs a game and a side (home or away)';
  end if;
  select game_id into v_game from _submitted group by game_id having count(*) > 1 limit 1;
  if found then
    raise exception 'More than one pick on %', game_label(v_game);
  end if;

  -- Every game must be on this slate
  select s.game_id into v_game
  from _submitted s
  left join _locks l on l.game_id = s.game_id
  where l.game_id is null
  limit 1;
  if found then
    raise exception 'A picked game is not on this slate';
  end if;

  -- Locked games are frozen: a submitted pick on a locked game must match what's saved...
  select s.game_id, l.started into v_game, v_started
  from _submitted s
  join _locks l on l.game_id = s.game_id
  left join picks p on p.slate_id = p_slate_id and p.user_id = v_user and p.game_id = s.game_id
  where l.locked
    and (p.id is null or p.picked_side <> s.picked_side or p.confidence is distinct from s.confidence)
  limit 1;
  if found then
    raise exception '% %; that pick is locked', game_label(v_game),
      case when v_started then 'has started' else 'is past its pick deadline' end;
  end if;

  -- ...and a saved pick on a locked game can't be dropped.
  select p.game_id, l.started into v_game, v_started
  from picks p
  join _locks l on l.game_id = p.game_id
  where p.slate_id = p_slate_id and p.user_id = v_user and l.locked
    and not exists (select 1 from _submitted s where s.game_id = p.game_id)
  limit 1;
  if found then
    raise exception '% %; that pick is locked', game_label(v_game),
      case when v_started then 'has started' else 'is past its pick deadline' end;
  end if;

  -- No new or changed picks on voided games. (The commissioner's form resubmits a pick
  -- already saved on a voided game, so only an actual change is refused there.)
  select s.game_id into v_game
  from _submitted s
  join _locks l on l.game_id = s.game_id
  left join picks p on p.slate_id = p_slate_id and p.user_id = v_user and p.game_id = s.game_id
  where l.voided and not l.locked
    and (not v_on_behalf or p.id is null or p.picked_side <> s.picked_side
         or p.confidence is distinct from s.confidence)
  limit 1;
  if found then
    raise exception '% was voided by the commissioner', game_label(v_game);
  end if;

  -- Count (frozen + unlocked)
  if (select count(*) from _submitted) > (v_settings->>'picks_per_slate')::int then
    raise exception 'Too many picks: this pool allows %', (v_settings->>'picks_per_slate')::int;
  end if;

  -- Full card: a player saves every pick at once. Picks on locked games are in _submitted
  -- too (frozen, checked above), so a later edit of an open game still counts the whole card.
  -- The commissioner's on-behalf edits are exempt so they can fix a single pick.
  if coalesce((v_settings->>'full_card')::boolean, false) and not v_on_behalf
     and (select count(*) from _submitted) < (v_settings->>'picks_per_slate')::int then
    raise exception 'Make all % picks to save (you have %)',
      (v_settings->>'picks_per_slate')::int, (select count(*) from _submitted);
  end if;

  -- Confidence tiers
  if jsonb_typeof(v_settings->'confidence') = 'object' then
    if exists (select 1 from _submitted where confidence is null) then
      raise exception 'Every pick needs a confidence value';
    end if;

    select u.confidence into v_conf
    from (select confidence, count(*) as n from _submitted group by confidence) u
    left join (
      select (t->>'points')::int as points, sum((t->>'count')::int) as allowed
      from jsonb_array_elements(v_settings->'confidence'->'tiers') t
      group by 1
    ) a on a.points = u.confidence
    where a.points is null or u.n > a.allowed
    limit 1;
    if found then
      raise exception 'Too many %-point picks for this pool''s tiers', v_conf;
    end if;
  elsif exists (select 1 from _submitted where confidence is not null) then
    raise exception 'This pool doesn''t use confidence points';
  end if;

  if v_on_behalf then
    select coalesce(jsonb_agg(jsonb_build_object('game_id', game_id, 'picked_side', picked_side,
                                                 'confidence', confidence) order by game_id), '[]')
      into v_before
    from picks where slate_id = p_slate_id and user_id = v_user;
  end if;

  -- Write: only unlocked games change. A change by the player clears an earlier
  -- commissioner mark; a change on their behalf sets it. Unchanged rows keep theirs.
  delete from picks p
  using _locks l
  where p.slate_id = p_slate_id and p.user_id = v_user
    and l.game_id = p.game_id and not l.locked
    and not exists (select 1 from _submitted s where s.game_id = p.game_id);

  insert into picks (slate_id, game_id, user_id, picked_side, confidence, edited_by, edited_at)
  select p_slate_id, s.game_id, v_user, s.picked_side, s.confidence,
         case when v_on_behalf then auth.uid() end,
         case when v_on_behalf then now() end
  from _submitted s
  join _locks l on l.game_id = s.game_id
  where not l.locked
  on conflict (slate_id, user_id, game_id) do update
    set picked_side = excluded.picked_side,
        confidence = excluded.confidence,
        edited_by = excluded.edited_by,
        edited_at = excluded.edited_at,
        updated_at = now()
    where (picks.picked_side, picks.confidence)
          is distinct from (excluded.picked_side, excluded.confidence);

  if v_on_behalf then
    select coalesce(jsonb_agg(jsonb_build_object('game_id', game_id, 'picked_side', picked_side,
                                                 'confidence', confidence) order by game_id), '[]')
      into v_after
    from picks where slate_id = p_slate_id and user_id = v_user;

    insert into audit_log (pool_id, actor_id, action, detail)
    values (v_slate.pool_id, auth.uid(), 'picks_on_behalf',
            jsonb_build_object('slate_id', p_slate_id, 'user_id', v_user, 'picks', p_picks,
                               'before', v_before, 'after', v_after));

    -- A changed pick can change results, points, the upset split, standings, and whether
    -- the week counts as missed (a closed slate with no finals yet still scores that).
    -- grade_slate recomputes all of it from scratch and is idempotent, and a pick on an
    -- undecided game goes back to ungraded.
    if v_before is distinct from v_after then
      perform grade_slate(p_slate_id);
    end if;
  end if;
end;
$$;

revoke execute on function create_comanager_invite(uuid), accept_comanager_invite(text), remove_comanager(uuid, uuid),
  my_comanaged_entries(), my_entry_comanagers(), pool_comanagers(uuid), comanager_invite_info(text) from public, anon;
grant execute on function create_comanager_invite(uuid), accept_comanager_invite(text), remove_comanager(uuid, uuid),
  my_comanaged_entries(), my_entry_comanagers(), pool_comanagers(uuid), comanager_invite_info(text) to authenticated;
