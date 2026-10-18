-- Full card (settings.full_card): picks only save as a complete card; open games stay editable.
-- Run with: npx supabase test db
begin;
select plan(7);

-- A = commissioner, B = player
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'b@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaaf', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaaf', 'Away State');

insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Full card', 'full-card-pool', 'ncaaf', 2026,
   'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":3,"picks_mode":"exact","full_card":true,"confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');

insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '1 day', now() + interval '6 days', 'open', now() - interval '1 day');

-- g1 kicked off an hour ago (the "11am game"); g2–g5 are later (the "6pm games").
insert into games (id, sport, season, home_team_id, away_team_id, start_at)
select ('70000000-0000-0000-0000-00000000000' || i)::uuid, 'ncaaf', 2026,
       '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
       case when i = 1 then now() - interval '1 hour' else now() + interval '6 hours' end
from generate_series(1, 5) i;
insert into slate_games (slate_id, game_id)
select '60000000-0000-0000-0000-000000000001', ('70000000-0000-0000-0000-00000000000' || i)::uuid
from generate_series(1, 5) i;

-- B saved g1 before it kicked off.
insert into picks (slate_id, game_id, user_id, picked_side) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'home');

-- ---------- as B ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home"}]')$$,
  'Make all 3 picks to save%', 'a partial card doesn''t save');

select lives_ok(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000003","picked_side":"away"}]')$$,
  'a full card saves, including the pick on the game that already kicked off');

select lives_ok(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away"},
      {"game_id":"70000000-0000-0000-0000-000000000004","picked_side":"home"}]')$$,
  'open games can be changed or swapped later as long as the card stays full');

select is((select count(*) from picks where user_id = 'b0000000-0000-0000-0000-000000000000'
             and game_id in ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004')), 2::bigint,
          'the swap saved');

select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away"}]')$$,
  'Make all 3 picks to save%', 'dropping a pick without replacing it doesn''t save');

select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"away"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away"},
      {"game_id":"70000000-0000-0000-0000-000000000004","picked_side":"home"}]')$$,
  '%that pick is locked', 'the pick on the game that kicked off can''t change');

-- ---------- as A, on B's behalf: the commissioner can fix a single pick ----------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select lives_ok(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away"}]',
    'b0000000-0000-0000-0000-000000000000')$$,
  'the commissioner''s on-behalf edits aren''t held to a full card');

select * from finish();
rollback;
