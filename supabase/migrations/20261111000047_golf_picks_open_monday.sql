-- Picks for a tournament open at 7:00 a.m. Central on the Monday of its week (the week of its
-- first tee time) and lock at that first tee time. A tournament can open at another time
-- instead: golf_events.picks_open_at (set by hand, e.g. the demo pool).
alter table golf_events add column if not exists picks_open_at timestamptz;

-- Monday 7:00 a.m. Central of the week containing this time.
create or replace function golf_default_picks_open(p_start timestamptz)
returns timestamptz language sql immutable as $$
  select (date_trunc('week', p_start at time zone 'America/Chicago') + interval '7 hours') at time zone 'America/Chicago'
$$;

create or replace function golf_event_open(p_event golf_events)
returns boolean language sql stable as $$
  select p_event.status = 'scheduled'
     and p_event.start_at is not null
     and now() < p_event.start_at
     and now() >= coalesce(p_event.picks_open_at, golf_default_picks_open(p_event.start_at))
$$;
revoke all on function golf_event_open(golf_events) from public;

-- Same as before, with its own message for a tournament whose picks haven't opened yet.
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
    -- Before the Monday opening, say so rather than "locked".
    if v_event.status = 'scheduled' and v_event.start_at is not null and now() < v_event.start_at then
      raise exception 'Picks for this event aren''t open yet';
    end if;
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
