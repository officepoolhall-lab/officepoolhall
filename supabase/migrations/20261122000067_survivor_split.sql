-- Survivor: "Request to Split". Every entry still alive can ask to end the pool and split the
-- pot. Once every remaining entry (two or more) has asked, the pool is over: the split is
-- recorded in survivor_splits with who shares it, and no more picks can be saved.
--
-- Who's alive is worked out with survivor_losses (same rules as the pages). A demo pool
-- (settings.survivor.demo_now set) plays on made-up results the database can't see, so there
-- the page passes the alive list itself; only the commissioner can turn a demo on.

create table if not exists survivor_split_requests (
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
alter table survivor_split_requests enable row level security;
drop policy if exists survivor_split_requests_read on survivor_split_requests;
create policy survivor_split_requests_read on survivor_split_requests for select
  using (pool_id = any ((select my_viewable_pools())::uuid[]));
grant select on survivor_split_requests to authenticated;

create table if not exists survivor_splits (
  pool_id uuid primary key references pools(id) on delete cascade,
  user_ids uuid[] not null,
  week int,
  created_at timestamptz not null default now()
);
alter table survivor_splits enable row level security;
drop policy if exists survivor_splits_read on survivor_splits;
create policy survivor_splits_read on survivor_splits for select
  using (pool_id = any ((select my_viewable_pools())::uuid[]));
grant select on survivor_splits to authenticated;

-- Ask (p_on = true) or take it back (false). Your own entry, one you co-manage, or the
-- commissioner for anyone. Returns true when this request completed the split.
create or replace function request_survivor_split(
  p_pool_id uuid, p_on boolean, p_user_id uuid default null, p_week int default null, p_alive uuid[] default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_rules jsonb;
  v_lives int;
  v_demo boolean;
  v_commish boolean;
  v_manager boolean;
  v_alive uuid[];
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select settings->'survivor' into v_rules from pools where id = p_pool_id and settings->>'format' = 'survivor';
  if v_rules is null then raise exception 'This isn''t a Survivor pool'; end if;
  if exists (select 1 from survivor_splits where pool_id = p_pool_id) then raise exception 'This pool has already been split'; end if;
  v_lives := coalesce(nullif(v_rules->>'lives', '')::int, 1);
  v_demo := nullif(v_rules->>'demo_now', '') is not null;

  v_commish := exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = p_pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only answer for your own entry'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_user) then raise exception 'That entry isn''t in this pool'; end if;

  -- Everyone still in: not benched, lives left.
  if v_demo and p_alive is not null then
    select coalesce(array_agg(m.user_id), '{}') into v_alive from pool_members m
    where m.pool_id = p_pool_id and m.user_id = any (p_alive)
      and not exists (select 1 from pool_member_bench b where b.pool_id = m.pool_id and b.user_id = m.user_id);
  else
    select coalesce(array_agg(m.user_id), '{}') into v_alive from pool_members m
    where m.pool_id = p_pool_id
      and not exists (select 1 from pool_member_bench b where b.pool_id = m.pool_id and b.user_id = m.user_id)
      and survivor_losses(p_pool_id, m.user_id) < v_lives;
  end if;

  if p_on then
    if not (v_user = any (v_alive)) then raise exception 'Only entries still alive can ask to split'; end if;
    if cardinality(v_alive) < 2 then raise exception 'There''s nobody left to split with'; end if;
    insert into survivor_split_requests (pool_id, user_id) values (p_pool_id, v_user) on conflict do nothing;
  else
    delete from survivor_split_requests where pool_id = p_pool_id and user_id = v_user;
    return false;
  end if;

  if cardinality(v_alive) >= 2 and not exists (
    select 1 from unnest(v_alive) a(uid)
    where not exists (select 1 from survivor_split_requests r where r.pool_id = p_pool_id and r.user_id = a.uid)
  ) then
    insert into survivor_splits (pool_id, user_ids, week) values (p_pool_id, v_alive, p_week);
    return true;
  end if;
  return false;
end;
$$;
revoke execute on function request_survivor_split(uuid, boolean, uuid, int, uuid[]) from public, anon;
grant execute on function request_survivor_split(uuid, boolean, uuid, int, uuid[]) to authenticated;

-- Commissioner: undo a split (and clear every request), e.g. after a mistake or a demo.
create or replace function reset_survivor_split(p_pool_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = auth.uid() and role = 'commissioner') then
    raise exception 'Only the commissioner can undo a split';
  end if;
  delete from survivor_splits where pool_id = p_pool_id;
  delete from survivor_split_requests where pool_id = p_pool_id;
end;
$$;
revoke execute on function reset_survivor_split(uuid) from public, anon;
grant execute on function reset_survivor_split(uuid) to authenticated;

-- Once split, the pool is over: no more picks.
create or replace function block_picks_after_split() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from survivor_splits where pool_id = new.pool_id) then
    raise exception 'This pool is over: the pot was split';
  end if;
  return new;
end;
$$;
drop trigger if exists block_after_split on survivor_picks;
create trigger block_after_split before insert or update on survivor_picks
  for each row execute function block_picks_after_split();
