-- Others' picks show once a game kicks off, not when picks lock (weekly deadline).
-- Run with: npx supabase test db
begin;
select plan(5);

-- A and B both play.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'b@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaaf', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaaf', 'Away State');

insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Kickoff', 'kickoff-pool', 'ncaaf', 2026,
   'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":3,"picks_mode":"max","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},
     "lock":{"mode":"weekly","weekly":{"weekday":6,"time":"11:00"}},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');

-- Slate 1: the weekly deadline has passed and the slate is locked.
--   g1 kicked off, g2 is later today, g3 is a TBD game ESPN has under way.
-- Slate 2: graded; g4 was cancelled and never started.
insert into slates (id, pool_id, week, window_start, window_end, lock_at, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '2 days', now() + interval '5 days', now() - interval '1 hour', 'locked', now() - interval '2 days'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000000', 2,
   now() - interval '9 days', now() - interval '2 days', now() - interval '8 days', 'graded', now() - interval '9 days');

insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd, status) values
  ('70000000-0000-0000-0000-000000000001', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   now() - interval '30 minutes', false, 'in_progress'),
  ('70000000-0000-0000-0000-000000000002', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   now() + interval '3 hours', false, 'scheduled'),
  ('70000000-0000-0000-0000-000000000003', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   now() + interval '5 hours', true, 'in_progress'),
  ('70000000-0000-0000-0000-000000000004', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
   now() - interval '7 days', false, 'cancelled');
insert into slate_games (slate_id, game_id) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003'),
  ('60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004');

insert into picks (slate_id, game_id, user_id, picked_side) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'home'),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000000', 'home'),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000000', 'away'),
  ('60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000000', 'away');

-- ---------- as A, looking at B's picks ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is((select count(*) from picks where game_id = '70000000-0000-0000-0000-000000000001'), 1::bigint,
          'a pick shows once its game has kicked off');
select is((select count(*) from picks where game_id = '70000000-0000-0000-0000-000000000002'), 0::bigint,
          'a locked slate no longer reveals picks on games that haven''t kicked off');
select is((select count(*) from picks where game_id = '70000000-0000-0000-0000-000000000003'), 1::bigint,
          'a TBD game shows once ESPN has it under way');
select is((select count(*) from picks where game_id = '70000000-0000-0000-0000-000000000004'), 1::bigint,
          'a graded week shows picks on a cancelled game');

-- ---------- as B: their own picks are always visible ----------
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select count(*) from picks where user_id = 'b0000000-0000-0000-0000-000000000000'), 4::bigint,
          'a player always sees their own picks');

select * from finish();
rollback;
