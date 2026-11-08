-- PGA Tour season-long pool.
-- One golfer per regular Tour event. Each golfer can be used once per entry per season.
-- An event locks at its first tee time. Standings are season prize money from ESPN's
-- leaderboard earnings. A week with no pick earns $0 (default; confirm with the commissioner).

alter table pools drop constraint if exists pools_sport_check;
alter table pools add constraint pools_sport_check check (sport in ('ncaab','ncaaf','pga'));

create table golf_events (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  espn_id text not null,
  name text not null,
  sort_order int not null,
  start_at timestamptz,                      -- first tee time; picks lock here
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','final','canceled')),
  unique (pool_id, espn_id),
  unique (pool_id, sort_order),
  unique (id, pool_id)
);

create table golf_results (
  event_id uuid not null references golf_events(id) on delete cascade,
  espn_golfer_id text not null,
  golfer_name text not null,
  pos text,                                  -- '1', 'T4', or '-' when cut or withdrawn
  earnings numeric(12,2) not null default 0, -- ESPN's displayed amount (ties already split)
  primary key (event_id, espn_golfer_id)
);

create table golf_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  event_id uuid not null,
  espn_golfer_id text not null,
  golfer_name text not null,
  picked_at timestamptz not null default now(),
  foreign key (event_id, pool_id) references golf_events(id, pool_id) on delete cascade,
  unique (pool_id, user_id, event_id),
  unique (pool_id, user_id, espn_golfer_id)  -- each golfer once per entry per season
);
create index on golf_picks (event_id);

-- Open for picks: scheduled, with a known first tee time that hasn't passed.
create or replace function golf_event_open(p_event golf_events)
returns boolean language sql stable as $$
  select p_event.status = 'scheduled' and p_event.start_at is not null and now() < p_event.start_at
$$;

create or replace function golf_is_manager(p_pool_id uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from entry_managers
                 where pool_id = p_pool_id and owner_id = p_owner and manager_id = auth.uid())
$$;

-- Save an entry's pick for one event. Owners and co-managers pick on the same lock rules;
-- the commissioner can enter a pick for another player at any time.
create or replace function submit_golf_pick(
  p_event_id uuid, p_golfer_id text, p_golfer_name text, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event golf_events%rowtype;
  v_user uuid;
  v_on_behalf boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if nullif(btrim(p_golfer_id), '') is null then
    raise exception 'Choose a golfer';
  end if;

  select * into v_event from golf_events where id = p_event_id;
  if not found or not is_pool_member(v_event.pool_id) then
    raise exception 'Event not found';
  end if;

  v_user := coalesce(p_user_id, auth.uid());
  if not exists (select 1 from pool_members where pool_id = v_event.pool_id and user_id = v_user) then
    raise exception 'You don''t have an entry in this pool';
  end if;
  v_on_behalf := v_user <> auth.uid() and not golf_is_manager(v_event.pool_id, v_user);
  if v_on_behalf and not is_commissioner(v_event.pool_id) then
    raise exception 'Only the commissioner can enter picks for another player';
  end if;
  if not v_on_behalf and not golf_event_open(v_event) then
    raise exception 'Picks for this event are locked';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || v_user::text, 0));

  if exists (select 1 from golf_picks
             where pool_id = v_event.pool_id and user_id = v_user
               and espn_golfer_id = p_golfer_id and event_id <> p_event_id) then
    raise exception 'That golfer is already on this entry''s card for another event this season';
  end if;

  insert into golf_picks (pool_id, user_id, event_id, espn_golfer_id, golfer_name)
  values (v_event.pool_id, v_user, p_event_id, p_golfer_id, p_golfer_name)
  on conflict (pool_id, user_id, event_id) do update
    set espn_golfer_id = excluded.espn_golfer_id,
        golfer_name = excluded.golfer_name,
        picked_at = now();
end $$;

-- Season prize money per entry, counting only final events.
create or replace function golf_standings(p_pool_id uuid)
returns table (user_id uuid, display_name text, season_earnings numeric, events_picked int)
language sql stable security definer set search_path = public as $$
  select pm.user_id,
         pr.display_name,
         coalesce(sum(r.earnings) filter (where e.status = 'final'), 0)::numeric,
         count(p.id)::int
  from pool_members pm
  join profiles pr on pr.id = pm.user_id
  left join golf_picks p on p.pool_id = pm.pool_id and p.user_id = pm.user_id
  left join golf_events e on e.id = p.event_id
  left join golf_results r on r.event_id = p.event_id and r.espn_golfer_id = p.espn_golfer_id
  where pm.pool_id = p_pool_id and is_pool_member(p_pool_id)
  group by pm.user_id, pr.display_name
  order by 3 desc, 2
$$;

-- Service role only: the scheduled ESPN import writes events and results.
create or replace function ingest_golf_events(p_pool_id uuid, p_events jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into golf_events (pool_id, espn_id, name, sort_order, start_at, status)
  select p_pool_id,
         e->>'espn_id',
         e->>'name',
         (e->>'sort_order')::int,
         nullif(e->>'start_at', '')::timestamptz,
         coalesce(nullif(e->>'status', ''), 'scheduled')
  from jsonb_array_elements(p_events) e
  on conflict (pool_id, espn_id) do update
    set name = excluded.name,
        sort_order = excluded.sort_order,
        start_at = excluded.start_at,
        status = case when golf_events.status = 'final' then 'final' else excluded.status end;
end $$;

create or replace function ingest_golf_results(p_event_id uuid, p_status text, p_results jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('scheduled','in_progress','final','canceled') then
    raise exception 'Unknown event status: %', p_status;
  end if;
  if (select status from golf_events where id = p_event_id) = 'final' then
    raise exception 'This event is final; its results are frozen';
  end if;

  delete from golf_results where event_id = p_event_id;
  insert into golf_results (event_id, espn_golfer_id, golfer_name, pos, earnings)
  select p_event_id,
         r->>'espn_golfer_id',
         r->>'golfer_name',
         r->>'pos',
         coalesce(nullif(r->>'earnings', '')::numeric, 0)
  from jsonb_array_elements(p_results) r;

  update golf_events set status = p_status where id = p_event_id;
end $$;

-- Row-level security. Entries see their own picks at any time; everyone in the pool sees
-- all picks once that event's first tee time has passed. Writes go through the functions.
alter table golf_events enable row level security;
alter table golf_results enable row level security;
alter table golf_picks enable row level security;

create policy golf_events_read on golf_events for select
  using (is_pool_member(pool_id));

create policy golf_results_read on golf_results for select
  using (exists (select 1 from golf_events e
                 where e.id = golf_results.event_id and is_pool_member(e.pool_id)));

create policy golf_picks_read on golf_picks for select
  using (user_id = auth.uid()
         or golf_is_manager(pool_id, user_id)
         or (is_pool_member(pool_id) and exists (
               select 1 from golf_events e
               where e.id = golf_picks.event_id and e.start_at <= now())));

grant select on golf_events, golf_results, golf_picks to authenticated;

revoke all on function submit_golf_pick(uuid, text, text, uuid) from public;
revoke all on function golf_standings(uuid) from public;
revoke all on function golf_is_manager(uuid, uuid) from public;
revoke all on function golf_event_open(golf_events) from public;
grant execute on function submit_golf_pick(uuid, text, text, uuid) to authenticated;
grant execute on function golf_standings(uuid) to authenticated;

revoke all on function ingest_golf_events(uuid, jsonb) from public, authenticated, anon;
revoke all on function ingest_golf_results(uuid, text, jsonb) from public, authenticated, anon;
grant execute on function ingest_golf_events(uuid, jsonb) to service_role;
grant execute on function ingest_golf_results(uuid, text, jsonb) to service_role;
