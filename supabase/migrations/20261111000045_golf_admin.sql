-- Golf admin (Nov 2026).
--
-- 1. A per-pool contact email for each entry, set by the commissioner. It's what the roster
--    shows and copies for this pool; the person's sign-in email (auth.users) never changes.
alter table pool_members add column if not exists contact_email text;
alter table pool_members drop constraint if exists pool_members_contact_email_check;
alter table pool_members add constraint pool_members_contact_email_check
  check (contact_email is null or (length(contact_email) <= 254 and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- 2. Commissioner changes to a golf event: rename it (the 2027 "TBD" slot once it's named),
--    close one under way as final (a tournament shortened by weather), or cancel / restore it.
--    Everything else about events comes from the ESPN import.
create or replace function golf_admin_update_event(p_event_id uuid, p_name text default null, p_status text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event golf_events;
begin
  select * into v_event from golf_events where id = p_event_id;
  if v_event.id is null then raise exception 'Event not found'; end if;
  if not is_commissioner(v_event.pool_id) then raise exception 'Only the commissioner can change events'; end if;

  if p_name is not null then
    if length(btrim(p_name)) = 0 or length(btrim(p_name)) > 120 then
      raise exception 'Event name must be 1 to 120 characters';
    end if;
    update golf_events set name = btrim(p_name) where id = p_event_id;
  end if;

  if p_status is not null then
    if p_status = 'final' and v_event.status <> 'in_progress' then
      raise exception 'Only an event under way can be closed as final';
    elsif p_status = 'canceled' and v_event.status not in ('scheduled', 'in_progress') then
      raise exception 'Only an upcoming or running event can be canceled';
    elsif p_status = 'scheduled' and v_event.status <> 'canceled' then
      raise exception 'Only a canceled event can be restored';
    elsif p_status not in ('final', 'canceled', 'scheduled') then
      raise exception 'Unknown status %', p_status;
    end if;
    update golf_events set status = p_status where id = p_event_id;
  end if;
end;
$$;
revoke execute on function golf_admin_update_event(uuid, text, text) from public, anon;
grant execute on function golf_admin_update_event(uuid, text, text) to authenticated;
