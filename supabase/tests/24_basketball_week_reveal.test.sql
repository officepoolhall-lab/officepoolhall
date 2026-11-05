-- College basketball: everyone's picks show from the week's lock, before tip. Football
-- (13_picks_visible_at_kickoff) still waits for kickoff.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000000', 'a1@test.dev'),
  ('b1000000-0000-0000-0000-000000000000', 'b1@test.dev');
insert into teams (id, sport, name) values
  ('21000000-0000-0000-0000-000000000001', 'ncaab', 'Blue U'),
  ('21000000-0000-0000-0000-000000000002', 'ncaab', 'Gold State');

insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('51000000-0000-0000-0000-000000000000', 'Hoops', 'hoops-reveal', 'ncaab', 2026,
   'a1000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":3,"picks_mode":"max","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},
     "lock":{"mode":"weekly","weekly":{"weekday":3,"time":"12:00"}},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('51000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'commissioner'),
  ('51000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'player');

-- Slate 1 is locked and its games haven't tipped. Slate 2 is open with a lock still ahead.
insert into slates (id, pool_id, week, window_start, window_end, lock_at, status, published_at) values
  ('61000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000000', 1,
   now() - interval '2 days', now() + interval '5 days', now() - interval '1 hour', 'locked', now() - interval '2 days'),
  ('61000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000000', 2,
   now() + interval '5 days', now() + interval '12 days', now() + interval '6 days', 'open', now() + interval '1 day');

insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd, status) values
  ('71000000-0000-0000-0000-000000000001', 'ncaab', 2026, '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002',
   now() + interval '20 hours', false, 'scheduled'),
  ('71000000-0000-0000-0000-000000000002', 'ncaab', 2026, '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002',
   now() + interval '8 days', false, 'scheduled');
insert into slate_games (slate_id, game_id) values
  ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002');

insert into picks (slate_id, game_id, user_id, picked_side) values
  ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'home'),
  ('61000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000000', 'home');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is((select count(*) from picks where game_id = '71000000-0000-0000-0000-000000000001'), 1::bigint,
          'a locked week shows everyone''s picks before tip');
select is((select count(*) from picks where game_id = '71000000-0000-0000-0000-000000000002'), 0::bigint,
          'an open week with its lock still ahead keeps picks hidden');

-- Deadline passed but the cron hasn't flipped the slate to locked yet.
reset role;
update slates set lock_at = now() - interval '1 minute' where id = '61000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is((select count(*) from picks where game_id = '71000000-0000-0000-0000-000000000002'), 1::bigint,
          'a passed deadline reveals picks before the slate is marked locked');

select * from finish();
rollback;
