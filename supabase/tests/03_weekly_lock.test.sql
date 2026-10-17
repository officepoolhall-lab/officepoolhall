-- Weekly lock mode ("picks due Tuesday evening"), combined with per-game freezing.
-- Run with: npx supabase test db
begin;
select plan(7);

insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000000', 'b@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaab', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaab', 'Away State');

insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Weekly', 'weekly-pool', 'ncaab', 2026,
   'b0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":2,"picks_mode":"exact",
     "confidence":{"tiers":[{"points":2,"count":1},{"points":1,"count":1}]},
     "scoring":{"win":1,"push":0,"loss":0},
     "lock":{"mode":"weekly","weekly":{"weekday":2,"time":"19:00"}},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id) values ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000');

-- Slate A: deadline still ahead; g1 (a Monday game) already tipped, g2 after the deadline.
-- Slate B: deadline passed; its game hasn't started yet.
insert into slates (id, pool_id, week, window_start, window_end, lock_at, status, published_at) values
  ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 hour', 'open', now() - interval '1 day'),
  ('60000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000000', 2,
   now() - interval '2 days', now() + interval '5 days', now() - interval '1 minute', 'open', now() - interval '2 days');

insert into games (id, sport, season, home_team_id, away_team_id, start_at) values
  ('70000000-0000-0000-0000-000000000001', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', now() - interval '30 minutes'),
  ('70000000-0000-0000-0000-000000000002', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', now() + interval '2 days'),
  ('70000000-0000-0000-0000-000000000003', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', now() + interval '2 days');
insert into slate_games (slate_id, game_id) values
  ('60000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-00000000000a',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home","confidence":2}]')$$,
  '%has started; that pick is locked', 'before the deadline, a game that already tipped is still frozen');
select lives_ok(
  $$select submit_picks('60000000-0000-0000-0000-00000000000a',
    '[{"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away","confidence":2}]')$$,
  'before the deadline, later games are pickable');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-00000000000b',
    '[{"game_id":"70000000-0000-0000-0000-000000000003","picked_side":"home","confidence":2}]')$$,
  'Picks for this slate are locked', 'after the deadline, nothing can be picked even if the game has not started');

reset role;
select is(close_slates(), 1, 'close job locks only the slate whose deadline passed');
select is((select status from slates where id = '60000000-0000-0000-0000-00000000000b'), 'locked', 'past-deadline slate is locked');
select is((select status from slates where id = '60000000-0000-0000-0000-00000000000a'), 'open', 'slate before its deadline stays open');
select is(close_slates(), 0, 'close job is idempotent');

select * from finish();
rollback;
