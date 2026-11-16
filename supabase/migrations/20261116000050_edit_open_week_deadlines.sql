-- Change a published week's pick deadlines while it's still open (weekly-lock pools).
-- Games already locked (a deadline or tip-off passed) stay locked: refresh_slate_locks only
-- moves deadlines still ahead. A first-day deadline that has already passed can be left as
-- it is (sent back unchanged) while the main one moves.
create or replace function update_slate_deadlines(p_slate_id uuid, p_lock_at timestamptz, p_first_day_lock_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slate slates%rowtype;
  v_settings jsonb;
begin
  select * into v_slate from slates where id = p_slate_id for update;
  if not found or not is_commissioner(v_slate.pool_id) then
    raise exception 'Week not found';
  end if;
  if v_slate.status <> 'open' then
    raise exception 'Only an open week''s deadlines can change';
  end if;
  select settings into v_settings from pools where id = v_slate.pool_id;
  if coalesce(v_settings->'lock'->>'mode', 'per_game') <> 'weekly' then
    raise exception 'This pool locks each game at its start';
  end if;
  if p_lock_at is null or p_lock_at <= now() then
    raise exception 'Pick a deadline that hasn''t passed yet';
  end if;
  if p_first_day_lock_at is not null and p_first_day_lock_at > p_lock_at then
    raise exception 'The first-day deadline can''t be after the main one';
  end if;
  if p_first_day_lock_at is not null and p_first_day_lock_at <= now()
     and p_first_day_lock_at is distinct from v_slate.first_day_lock_at then
    raise exception 'Pick a first-day deadline that hasn''t passed yet';
  end if;

  update slates set lock_at = p_lock_at, first_day_lock_at = p_first_day_lock_at where id = p_slate_id;
  perform refresh_slate_locks(p_slate_id);

  insert into audit_log (pool_id, actor_id, action, detail)
  values (v_slate.pool_id, auth.uid(), 'update_slate_deadlines', jsonb_build_object(
    'slate_id', p_slate_id,
    'lock_at', jsonb_build_array(v_slate.lock_at, p_lock_at),
    'first_day_lock_at', jsonb_build_array(v_slate.first_day_lock_at, p_first_day_lock_at)));
end;
$$;
revoke execute on function update_slate_deadlines(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function update_slate_deadlines(uuid, timestamptz, timestamptz) to authenticated;
