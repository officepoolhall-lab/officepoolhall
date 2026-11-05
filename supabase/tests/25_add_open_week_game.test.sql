-- A commissioner can add a scheduled game to an open, published week with its line. Started
-- games, missing spreads, and games already on a week in the pool are refused.
begin;
select plan(5);

insert into auth.users (id, email) values ('a2000000-0000-0000-0000-000000000000', 'a2@test.dev');
insert into teams (id, sport, name) values
  ('22000000-0000-0000-0000-000000000001', 'ncaaf', 'Red U'),
  ('22000000-0000-0000-0000-000000000002', 'ncaaf', 'Green State');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('52000000-0000-0000-0000-000000000000', 'Late Adds', 'late-adds', 'ncaaf', 2026,
   'a2000000-0000-0000-0000-000000000000',
   '{"pick_type":"ats","picks_per_slate":3,"picks_mode":"max","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},
     "lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('52000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'commissioner');
insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('62000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000000', 1,
   now() - interval '2 days', now() + interval '5 days', 'open', now() - interval '2 days'),
  ('62000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000000', 2,
   now() + interval '6 days', now() + interval '12 days', 'draft', null);
insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd, status) values
  ('72000000-0000-0000-0000-000000000001', 'ncaaf', 2026, '22000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002',
   now() + interval '2 days', false, 'scheduled'),
  ('72000000-0000-0000-0000-000000000002', 'ncaaf', 2026, '22000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001',
   now() - interval '1 hour', false, 'in_progress'),
  ('72000000-0000-0000-0000-000000000003', 'ncaaf', 2026, '22000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001',
   now() + interval '3 days', false, 'scheduled'),
  ('72000000-0000-0000-0000-000000000004', 'ncaaf', 2026, '22000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002',
   now() + interval '4 days', false, 'scheduled');
-- Game 3 is already on a draft week in this pool.
insert into slate_games (slate_id, game_id) values ('62000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select lives_ok(
  $$select add_open_slate_game('62000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', -3.5)$$,
  'a commissioner can add a scheduled game to an open week');
reset role;
select is((select locked_home_spread from slate_games where slate_id = '62000000-0000-0000-0000-000000000001' and game_id = '72000000-0000-0000-0000-000000000001'),
          -3.5::numeric, 'the added game keeps its home spread');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_like(
  $$select add_open_slate_game('62000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', -3)$$,
  '%already started%', 'a game that has started can''t be added');
select throws_like(
  $$select add_open_slate_game('62000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000004', null)$$,
  '%Enter the home team%', 'a spread pool needs a line for the added game');
select throws_like(
  $$select add_open_slate_game('62000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000003', -3)$$,
  '%already on a week%', 'a game already on a week in the pool is refused');

select * from finish();
rollback;
