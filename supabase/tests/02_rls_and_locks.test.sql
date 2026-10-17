-- RLS + per-game lock (HANDOFF.md §6.2, §7). Run with: npx supabase test db
begin;
select plan(22);

-- ---------- fixtures (as postgres) ----------
-- A = commissioner, B = player, C = not in the pool
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'b@test.dev'),
  ('c0000000-0000-0000-0000-000000000000', 'c@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaab', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaab', 'Away State');

insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'RLS Pool', 'rls-pool', 'ncaab', 2026,
   'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":4,"picks_mode":"exact",
     "confidence":{"tiers":[{"points":5,"count":1},{"points":3,"count":1},{"points":1,"count":2}]},
     "scoring":{"win":1,"push":0,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');

insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '1 day', now() + interval '6 days', 'open', now() - interval '1 day'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000000', 2,
   now() + interval '6 days', now() + interval '13 days', 'draft', null);

-- g1, g3 started; g2, g4, g5, g6 upcoming
insert into games (id, sport, season, home_team_id, away_team_id, start_at)
select ('70000000-0000-0000-0000-00000000000' || i)::uuid, 'ncaab', 2026,
       '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
       case when i in (1, 3) then now() - interval '1 hour' else now() + interval '1 day' end
from generate_series(1, 7) i;
insert into slate_games (slate_id, game_id)
select '60000000-0000-0000-0000-000000000001', ('70000000-0000-0000-0000-00000000000' || i)::uuid
from generate_series(1, 6) i;
insert into slate_games (slate_id, game_id)
values ('60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000007');

-- Existing picks: A and B each have g1 (started) and g2 (upcoming)
insert into picks (slate_id, game_id, user_id, picked_side, confidence) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'away', 5),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'away', 3),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'home', 5),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000000', 'home', 3);

-- ---------- as C (non-member) ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is((select count(*) from pools where id = '50000000-0000-0000-0000-000000000000'), 0::bigint,
          'non-member can''t read the pool');
select is((select count(*) from slates where pool_id = '50000000-0000-0000-0000-000000000000'), 0::bigint,
          'non-member can''t read its slates');
select is((select count(*) from picks where slate_id = '60000000-0000-0000-0000-000000000001'), 0::bigint,
          'non-member can''t read picks, even on started games');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001', '[]')$$,
  'Slate not found', 'non-member can''t submit picks');

-- ---------- as A (commissioner) ----------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is((select count(*) from picks where user_id = 'b0000000-0000-0000-0000-000000000000'
             and game_id = '70000000-0000-0000-0000-000000000001'), 1::bigint,
          'another player''s pick is visible once its game has started');
select is((select count(*) from picks where user_id = 'b0000000-0000-0000-0000-000000000000'
             and game_id = '70000000-0000-0000-0000-000000000002'), 0::bigint,
          'another player''s pick is hidden before its game starts (even from the commissioner)');
select is((select count(*) from slates where status = 'draft'), 1::bigint,
          'commissioner can see draft slates');

-- ---------- as B (player) ----------
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is((select count(*) from picks where user_id = 'b0000000-0000-0000-0000-000000000000'), 2::bigint,
          'player sees all of their own picks');
select is((select count(*) from slates where status = 'draft'), 0::bigint,
          'player can''t see draft slates');
select is((select count(*) from slate_games where slate_id = '60000000-0000-0000-0000-000000000002'), 0::bigint,
          'player can''t see draft slate games');

-- Locked game: change, drop, add
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"away","confidence":5},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home","confidence":3}]')$$,
  '%has started; that pick is locked', 'can''t change the side of a pick on a started game');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home","confidence":1},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home","confidence":3}]')$$,
  '%has started; that pick is locked', 'can''t change the confidence of a pick on a started game');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home","confidence":3}]')$$,
  '%has started; that pick is locked', 'can''t remove a pick on a started game');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home","confidence":5},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home","confidence":3},
      {"game_id":"70000000-0000-0000-0000-000000000003","picked_side":"home","confidence":1}]')$$,
  '%has started; that pick is locked', 'can''t add a pick on a started game');

-- Validation
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home","confidence":5},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home","confidence":5}]')$$,
  'Too many 5-point picks%', 'can''t exceed a confidence tier (frozen picks count)');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home","confidence":5},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home","confidence":3},
      {"game_id":"70000000-0000-0000-0000-000000000004","picked_side":"home","confidence":1},
      {"game_id":"70000000-0000-0000-0000-000000000005","picked_side":"home","confidence":1},
      {"game_id":"70000000-0000-0000-0000-000000000006","picked_side":"home","confidence":1}]')$$,
  'Too many picks%', 'can''t exceed picks_per_slate');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000002',
    '[{"game_id":"70000000-0000-0000-0000-000000000007","picked_side":"home","confidence":5}]')$$,
  'This slate is not open for picks', 'can''t pick on a draft slate');

-- Unstarted games stay editable after earlier games start
select lives_ok(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home","confidence":5},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away","confidence":1},
      {"game_id":"70000000-0000-0000-0000-000000000004","picked_side":"home","confidence":3}]')$$,
  'can change unstarted picks (side, confidence) and add new ones after earlier games start');
select results_eq(
  $$select game_id::text, picked_side, confidence from picks
    where user_id = 'b0000000-0000-0000-0000-000000000000' order by game_id$$,
  $$values ('70000000-0000-0000-0000-000000000001', 'home', 5),
           ('70000000-0000-0000-0000-000000000002', 'away', 1),
           ('70000000-0000-0000-0000-000000000004', 'home', 3)$$,
  'saved picks reflect the change; the frozen pick is untouched');

-- Other users' picks
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001', '[]', 'a0000000-0000-0000-0000-000000000000')$$,
  'Only the commissioner%', 'player can''t submit picks for another user');
select throws_like(
  $$insert into picks (slate_id, game_id, user_id, picked_side)
    values ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005',
            'b0000000-0000-0000-0000-000000000000', 'home')$$,
  'new row violates row-level security%', 'player can''t write picks directly');

update picks set picked_side = 'home' where user_id = 'a0000000-0000-0000-0000-000000000000';
reset role;
select is((select count(*) from picks where user_id = 'a0000000-0000-0000-0000-000000000000' and picked_side = 'away'),
          2::bigint, 'player can''t edit another user''s picks directly');

select * from finish();
rollback;
