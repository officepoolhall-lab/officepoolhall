-- Survivor: take back this week's pick before its game kicks off (tapping the picked team
-- again on My Pick). Same rules as submit_survivor_pick: your own entry (or one you co-manage),
-- or the commissioner for anyone; a pick whose game has started can't be removed except by the
-- commissioner. Demo pools lock against settings.survivor.demo_now (migration 065).

create or replace function clear_survivor_pick(p_slate_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_slate slates%rowtype;
  v_rules jsonb;
  v_commish boolean;
  v_manager boolean;
  v_old games%rowtype;
  v_demo_now timestamptz;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select * into v_slate from slates where id = p_slate_id;
  if not found or v_slate.status = 'draft' then raise exception 'That week isn''t open'; end if;
  select settings->'survivor' into v_rules from pools where id = v_slate.pool_id and settings->>'format' = 'survivor';
  if v_rules is null then raise exception 'This isn''t a Survivor pool'; end if;
  v_demo_now := nullif(v_rules->>'demo_now', '')::timestamptz;

  v_commish := exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = v_slate.pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only change your own pick'; end if;

  select g.* into v_old from survivor_picks p join games g on g.id = p.game_id where p.slate_id = p_slate_id and p.user_id = v_user;
  if not found then return; end if;
  if not (v_commish and v_user <> v_me)
     and ((v_demo_now is null and game_started(v_old.start_at, v_old.time_tbd, v_old.status))
          or (v_demo_now is not null and not v_old.time_tbd and v_old.start_at <= v_demo_now)) then
    raise exception 'Your pick this week is locked: its game has started';
  end if;

  delete from survivor_picks where slate_id = p_slate_id and user_id = v_user;
end;
$$;

revoke execute on function clear_survivor_pick(uuid, uuid) from public, anon;
grant execute on function clear_survivor_pick(uuid, uuid) to authenticated;
