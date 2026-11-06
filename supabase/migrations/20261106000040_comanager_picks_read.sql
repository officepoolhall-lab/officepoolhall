-- Co-managers can read the entry they manage. The picks policy checked entry_managers directly,
-- but entry_managers has row-level security on with no read policy, so the check always came
-- back empty for a signed-in user. Saves were fine (submit_picks is security definer), so the
-- picks appeared to save while the co-manager's My Picks stayed empty.
-- This check runs as the definer, the same way submit_picks reads entry_managers.
create or replace function is_entry_manager_for(p_slate_id uuid, p_owner_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from slates s
    join entry_managers em on em.pool_id = s.pool_id
    where s.id = p_slate_id and em.owner_id = p_owner_id and em.manager_id = auth.uid());
$$;

drop policy if exists picks_read on picks;
create policy picks_read on picks for select using (
  user_id = auth.uid()
  or is_entry_manager_for(picks.slate_id, picks.user_id)
  or exists (
    select 1 from slates s
    join pools p on p.id = s.pool_id
    join slate_games sg on sg.slate_id = s.id and sg.game_id = picks.game_id
    join games g on g.id = picks.game_id
    where s.id = picks.slate_id
      and can_view_pool(s.pool_id)
      and (s.status = 'graded'
           or game_started(g.start_at, g.time_tbd, g.status)
           or (p.sport = 'ncaab' and (s.status = 'locked'
                 or game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, s.lock_at)))))));
