-- Faster read policies, same rules.
--
-- The read policies called can_view_pool(pool_id), is_pool_member(...), is_commissioner(...)
-- and the co-manager checks once for every row a query looked at. Each call is its own small
-- query, so a page reading a few thousand rows (picks, scores, games) ran thousands of them.
--
-- Here the viewer's pools are worked out once per query instead: small functions return the
-- lists (pools they can view, pools they're a member or co-manager of, pools they run, entries
-- they co-manage), and each policy is written as "pool_id = any ((select ...)::uuid[])", which Postgres
-- evaluates once and reuses for every row. auth.uid()/auth.role() are wrapped the same way.
-- Who can see what does not change.

-- ============ The viewer's lists (evaluated once per query) ============

-- Pools the viewer belongs to or co-manages an entry in (is_pool_member).
create or replace function my_member_pools() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct pool_id), '{}') from (
    select pool_id from pool_members where user_id = auth.uid()
    union all
    select pool_id from entry_managers where manager_id = auth.uid()
  ) x;
$$;

-- Pools the viewer can read: members, co-managers and guests (can_view_pool).
create or replace function my_viewable_pools() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct pool_id), '{}') from (
    select pool_id from pool_members where user_id = auth.uid()
    union all
    select pool_id from entry_managers where manager_id = auth.uid()
    union all
    select pool_id from pool_guests where user_id = auth.uid()
  ) x;
$$;

-- Pools the viewer is commissioner of (is_commissioner).
create or replace function my_commissioner_pools() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pool_id), '{}')
  from pool_members where user_id = auth.uid() and role = 'commissioner';
$$;

-- Entries the viewer co-manages, as 'pool_id:owner_id' (is_entry_manager_for, golf_is_manager).
create or replace function my_managed_entries() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pool_id::text || ':' || owner_id::text), '{}')
  from entry_managers where manager_id = auth.uid();
$$;

-- The same entries per week, as 'slate_id:owner_id' (picks carry the week, not the pool).
create or replace function my_managed_slate_entries() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s.id::text || ':' || em.owner_id::text), '{}')
  from entry_managers em join slates s on s.pool_id = em.pool_id
  where em.manager_id = auth.uid();
$$;

grant execute on function my_member_pools(), my_viewable_pools(), my_commissioner_pools(), my_managed_entries(),
  my_managed_slate_entries() to authenticated, anon;

-- ============ Pool-level tables ============

drop policy if exists pools_read on pools;
create policy pools_read on pools for select using (id = any ((select my_viewable_pools())::uuid[]));

drop policy if exists members_read on pool_members;
create policy members_read on pool_members for select using (pool_id = any ((select my_viewable_pools())::uuid[]));

drop policy if exists pool_guests_read on pool_guests;
create policy pool_guests_read on pool_guests for select
  using (user_id = (select auth.uid()) or pool_id = any ((select my_commissioner_pools())::uuid[]));

drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (pool_id = any ((select my_commissioner_pools())::uuid[]));

drop policy if exists board_posts_read on board_posts;
create policy board_posts_read on board_posts for select using (pool_id = any ((select my_viewable_pools())::uuid[]));

drop policy if exists board_replies_read on board_replies;
create policy board_replies_read on board_replies for select using (
  exists (select 1 from board_posts p
          where p.id = board_replies.post_id and p.pool_id = any ((select my_viewable_pools())::uuid[])));

-- ============ Weeks, games, scores, picks ============

drop policy if exists slates_read on slates;
create policy slates_read on slates for select using (
  pool_id = any ((select my_viewable_pools())::uuid[])
  and (status <> 'draft' or pool_id = any ((select my_commissioner_pools())::uuid[])));

drop policy if exists slate_games_read on slate_games;
create policy slate_games_read on slate_games for select using (
  exists (select 1 from slates s
          where s.id = slate_games.slate_id
            and s.pool_id = any ((select my_viewable_pools())::uuid[])
            and (s.status <> 'draft' or s.pool_id = any ((select my_commissioner_pools())::uuid[]))));

drop policy if exists scores_read on slate_scores;
create policy scores_read on slate_scores for select using (
  exists (select 1 from slates s
          where s.id = slate_scores.slate_id and s.pool_id = any ((select my_viewable_pools())::uuid[])));

drop policy if exists games_read on games;
create policy games_read on games for select using ((select auth.role()) = 'authenticated');
drop policy if exists teams_read on teams;
create policy teams_read on teams for select using ((select auth.role()) = 'authenticated');
drop policy if exists lines_read on game_lines;
create policy lines_read on game_lines for select using ((select auth.role()) = 'authenticated');
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using ((select auth.role()) = 'authenticated');
drop policy if exists match_queue_read on team_match_queue;
create policy match_queue_read on team_match_queue for select using ((select auth.role()) = 'authenticated');

-- Own picks; the entries the viewer co-manages (every week); everyone's once the game has started (or the
-- week is graded; in college basketball, from the week's lock).
drop policy if exists picks_read on picks;
create policy picks_read on picks for select using (
  user_id = (select auth.uid())
  or (slate_id::text || ':' || user_id::text) = any ((select my_managed_slate_entries())::text[])
  or exists (
    select 1 from slates s
    join pools p on p.id = s.pool_id
    join slate_games sg on sg.slate_id = s.id and sg.game_id = picks.game_id
    join games g on g.id = picks.game_id
    where s.id = picks.slate_id
      and s.pool_id = any ((select my_viewable_pools())::uuid[])
      and (s.status = 'graded'
           or game_started(g.start_at, g.time_tbd, g.status)
           or (p.sport = 'ncaab' and (s.status = 'locked'
                 or game_locked(g.start_at, g.time_tbd, g.status, coalesce(sg.lock_at, s.lock_at)))))));

-- ============ Tournaments and brackets ============

drop policy if exists tournaments_read on tournaments;
create policy tournaments_read on tournaments for select using (pool_id = any ((select my_viewable_pools())::uuid[]));

drop policy if exists tournament_teams_read on tournament_teams;
create policy tournament_teams_read on tournament_teams for select using (
  exists (select 1 from tournaments t
          where t.id = tournament_teams.tournament_id and t.pool_id = any ((select my_viewable_pools())::uuid[])));

-- Co-managers now also see the managed entry's pick before the lock. The old check read
-- entry_managers directly, which row-level security hid from them (the same bug
-- 20261106000040 fixed for weekly picks).
drop policy if exists tournament_picks_read on tournament_picks;
create policy tournament_picks_read on tournament_picks for select using (
  user_id = (select auth.uid())
  or exists (select 1 from tournaments t
             where t.id = tournament_picks.tournament_id
               and ((t.lock_at <= now() and t.pool_id = any ((select my_viewable_pools())::uuid[]))
                    or (t.pool_id::text || ':' || tournament_picks.user_id::text) = any ((select my_managed_entries())::text[]))));

drop policy if exists brackets_read on brackets;
create policy brackets_read on brackets for select using (pool_id = any ((select my_viewable_pools())::uuid[]));

drop policy if exists bracket_teams_read on bracket_teams;
create policy bracket_teams_read on bracket_teams for select using (
  exists (select 1 from brackets b
          where b.id = bracket_teams.bracket_id and b.pool_id = any ((select my_viewable_pools())::uuid[])));

drop policy if exists bracket_results_read on bracket_results;
create policy bracket_results_read on bracket_results for select using (
  exists (select 1 from brackets b
          where b.id = bracket_results.bracket_id and b.pool_id = any ((select my_viewable_pools())::uuid[])));

drop policy if exists bracket_entries_read on bracket_entries;
create policy bracket_entries_read on bracket_entries for select using (
  user_id = (select auth.uid())
  or exists (select 1 from brackets b
             where b.id = bracket_entries.bracket_id
               and ((b.lock_at <= now() and b.pool_id = any ((select my_viewable_pools())::uuid[]))
                    or (b.pool_id::text || ':' || bracket_entries.user_id::text) = any ((select my_managed_entries())::text[]))));

-- ============ Golf (members and co-managers; no guests, as before) ============

drop policy if exists golf_events_read on golf_events;
create policy golf_events_read on golf_events for select using (pool_id = any ((select my_member_pools())::uuid[]));

drop policy if exists golf_field_read on golf_field;
create policy golf_field_read on golf_field for select using (
  exists (select 1 from golf_events e
          where e.id = golf_field.event_id and e.pool_id = any ((select my_member_pools())::uuid[])));

drop policy if exists golf_results_read on golf_results;
create policy golf_results_read on golf_results for select using (
  exists (select 1 from golf_events e
          where e.id = golf_results.event_id and e.pool_id = any ((select my_member_pools())::uuid[])));

drop policy if exists golf_odds_read on golf_odds;
create policy golf_odds_read on golf_odds for select using ((select auth.uid()) is not null);

drop policy if exists golf_picks_read on golf_picks;
create policy golf_picks_read on golf_picks for select using (
  user_id = (select auth.uid())
  or (pool_id::text || ':' || user_id::text) = any ((select my_managed_entries())::text[])
  or (pool_id = any ((select my_member_pools())::uuid[])
      and exists (select 1 from golf_events e
                  where e.id = golf_picks.event_id
                    and (e.start_at <= now() or e.status in ('in_progress', 'final')))));

drop policy if exists golf_lineups_read on golf_lineups;
create policy golf_lineups_read on golf_lineups for select using (
  user_id = (select auth.uid())
  or (pool_id::text || ':' || user_id::text) = any ((select my_managed_entries())::text[])
  or (pool_id = any ((select my_member_pools())::uuid[])
      and exists (select 1 from golf_events e
                  where e.id = golf_lineups.event_id
                    and (e.start_at <= now() or e.status in ('in_progress', 'final')))));

-- Indexes the policies and pages look rows up by.
create index if not exists entry_managers_manager_idx on entry_managers (manager_id);
create index if not exists pool_guests_user_idx on pool_guests (user_id);
create index if not exists slate_scores_slate_idx on slate_scores (slate_id);
create index if not exists slates_pool_idx on slates (pool_id);
