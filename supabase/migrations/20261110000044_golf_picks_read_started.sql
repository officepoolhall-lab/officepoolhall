-- Other entries' picks become visible once an event has started. That was judged only by the
-- event's first tee time, so an event that is under way or final but has no tee time stored
-- (the demo pool's past events) kept everyone else's picks hidden. Its status now counts too.
drop policy if exists golf_picks_read on golf_picks;
create policy golf_picks_read on golf_picks for select
  using (user_id = auth.uid()
         or golf_is_manager(pool_id, user_id)
         or (is_pool_member(pool_id) and exists (
               select 1 from golf_events e
               where e.id = golf_picks.event_id
                 and (e.start_at <= now() or e.status in ('in_progress', 'final')))));
