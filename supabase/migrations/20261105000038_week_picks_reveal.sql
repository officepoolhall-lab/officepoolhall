-- College basketball: everyone's picks show when the week locks (the weekly deadline), not
-- only at each tip. Football keeps the kickoff reveal from 20261018000029, unchanged.
--
-- Picks are readable when the week is graded, or the game has kicked off, or, in a basketball
-- pool, the slate is locked or the game's deadline has passed. Keeps the co-manager and guest
-- clauses from 20261022000035; guests still see only the last clause.
-- A locked slate in a per-game pool has every game past its deadline already, so the sport
-- check only changes basketball.

drop policy if exists picks_read on picks;
create policy picks_read on picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from slates s
    join entry_managers em on em.pool_id = s.pool_id
    where s.id = picks.slate_id and em.owner_id = picks.user_id and em.manager_id = auth.uid())
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
