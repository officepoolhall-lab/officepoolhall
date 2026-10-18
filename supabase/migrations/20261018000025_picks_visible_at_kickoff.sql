-- Others' picks on a game show once that game has kicked off, not when picks lock.
--
-- Before: visible once the game locked (its tip or an earlier pick deadline) or the whole
-- slate locked, so a weekly deadline revealed everyone's picks hours before kickoff.
-- Now: visible once the game has started (ESPN under way/final, or a real start time has
-- passed). Every started game is already locked, so this only ever hides more.
-- A graded slate shows everything, so picks on a cancelled game (which never starts)
-- still come out once the week is done.
drop policy picks_read on picks;
create policy picks_read on picks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from slates s
    join slate_games sg on sg.slate_id = s.id and sg.game_id = picks.game_id
    join games g on g.id = picks.game_id
    where s.id = picks.slate_id
      and is_pool_member(s.pool_id)
      and (s.status = 'graded' or game_started(g.start_at, g.time_tbd, g.status))));
