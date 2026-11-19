-- Golf picks lock at the tournament's first tee time and stay locked for the whole tournament.
-- Between rounds ESPN shows every golfer as not yet started on the next round, so the score
-- update read the event as "scheduled" again and moved its start (the lock) to the next round's
-- first tee time, reopening picks. Two guards:
--   1. Once a tournament is under way its status never goes back to "scheduled".
--   2. Once its start time has passed, the start time can't move later.

create or replace function ingest_golf_results(p_event_id uuid, p_status text, p_results jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('scheduled','in_progress','final','canceled') then
    raise exception 'Unknown event status: %', p_status;
  end if;
  if (select status from golf_events where id = p_event_id) = 'final' then
    raise exception 'This event is final; its results are frozen';
  end if;

  delete from golf_results
  where event_id = p_event_id
    and espn_golfer_id not in (select r->>'espn_golfer_id' from jsonb_array_elements(p_results) r);

  insert into golf_results (event_id, espn_golfer_id, golfer_name, pos, earnings, to_par, out, thru, rounds)
  select p_event_id,
         r->>'espn_golfer_id',
         r->>'golfer_name',
         r->>'pos',
         coalesce(nullif(r->>'earnings', '')::numeric, 0),
         nullif(r->>'to_par', '')::int,
         coalesce((r->>'out')::boolean, false),
         nullif(r->>'thru', '')::int,
         case when jsonb_typeof(r->'rounds') = 'array'
              then array(select nullif(x, 'null')::int from jsonb_array_elements_text(r->'rounds') x)
         end
  from jsonb_array_elements(p_results) r
  on conflict (event_id, espn_golfer_id) do update
    set golfer_name = excluded.golfer_name,
        pos = excluded.pos,
        earnings = excluded.earnings,
        to_par = excluded.to_par,
        out = excluded.out,
        thru = excluded.thru,
        rounds = excluded.rounds;

  -- Under way stays under way (between rounds ESPN looks "not started").
  update golf_events
  set status = case when status = 'in_progress' and p_status = 'scheduled' then 'in_progress' else p_status end
  where id = p_event_id;
end $$;

create or replace function golf_events_keep_lock() returns trigger
language plpgsql as $$
begin
  -- The lock has passed: the start time can't move later (that would reopen picks).
  if old.start_at is not null and old.start_at <= now() and new.start_at is distinct from old.start_at
     and (new.start_at is null or new.start_at > old.start_at) then
    new.start_at := old.start_at;
  end if;
  return new;
end $$;

drop trigger if exists golf_events_keep_lock on golf_events;
create trigger golf_events_keep_lock before update of start_at on golf_events
  for each row execute function golf_events_keep_lock();

-- Repair The RSM Classic 2026 (ESPN 401850981), reopened after round 1: back under way, locked
-- from Thursday morning (before its first tee time).
update golf_events
set status = 'in_progress', start_at = least(start_at, timestamptz '2026-11-19 06:00:00-06')
where espn_id = '401850981' and status = 'scheduled';
