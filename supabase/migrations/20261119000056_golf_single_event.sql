-- A Majors-format pool for one regular PGA Tour event (a demo, or a one-off pool): the same
-- tiers / salary cap contest, on any ESPN tournament. Such an event is a golf_events row with
-- major = 'event' (no DraftKings odds market: tiers and salaries come from world rank).

alter table golf_events drop constraint if exists golf_events_major_check;
alter table golf_events add constraint golf_events_major_check
  check (major in ('masters','pga','us_open','open','event'));

create or replace function golf_admin_add_major(p_pool_id uuid, p_major text, p_espn_id text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_order int;
begin
  if not is_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can change the tournaments';
  end if;
  if p_major not in ('masters','pga','us_open','open','event') then
    raise exception 'Unknown major';
  end if;
  if nullif(btrim(p_espn_id), '') is null or btrim(p_espn_id) !~ '^\d+$' then
    raise exception 'Enter ESPN''s tournament id (the number in its leaderboard link)';
  end if;
  if p_major <> 'event' and exists (select 1 from golf_events where pool_id = p_pool_id and major = p_major) then
    raise exception 'That major is already in this pool';
  end if;
  if exists (select 1 from golf_events where pool_id = p_pool_id and espn_id = btrim(p_espn_id)) then
    raise exception 'That tournament is already in this pool';
  end if;
  -- Calendar order: Masters, PGA Championship, U.S. Open, The Open; other events after.
  v_order := coalesce(array_position(array['masters','pga','us_open','open'], p_major),
                      5 + (select count(*) from golf_events where pool_id = p_pool_id and major = 'event'));
  insert into golf_events (pool_id, espn_id, name, sort_order, major)
  values (p_pool_id, btrim(p_espn_id), coalesce(nullif(btrim(p_name), ''), case when p_major = 'event' then 'PGA Tour event' else p_major end), v_order, p_major)
  returning id into v_id;
  return v_id;
end $$;
