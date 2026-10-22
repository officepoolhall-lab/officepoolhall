-- Guests: view the whole pool, never pick, post or count as a player.
-- Run with: npx supabase test db
begin;
select plan(14);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'comm@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'player@test.dev'),
  ('c0000000-0000-0000-0000-000000000000', 'guest@test.dev'),
  ('d0000000-0000-0000-0000-000000000000', 'stranger@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaaf', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaaf', 'Away State');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Guests', 'guest-pool', 'ncaaf', 2026, 'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":2,"picks_mode":"up_to","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');
insert into invites (pool_id, token, guest) values
  ('50000000-0000-0000-0000-000000000000', 'guest-token', true),
  ('50000000-0000-0000-0000-000000000000', 'player-token', false);
insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '1 day', now() + interval '6 days', 'open', now() - interval '1 day');
insert into games (id, sport, season, home_team_id, away_team_id, start_at) values
  ('70000000-0000-0000-0000-000000000001', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now() - interval '1 hour'),
  ('70000000-0000-0000-0000-000000000002', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', now() + interval '1 day');
insert into slate_games (slate_id, game_id) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002');
insert into picks (slate_id, game_id, user_id, picked_side) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'home'),
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000000', 'away');
insert into board_posts (pool_id, author_id, title, body) values
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'Hi', 'Hello');

set local role authenticated;

-- Someone with no link sees nothing.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select count(*)::int from pools), 0, 'someone outside the pool can''t see it');

-- The guest joins with the guest link.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is(join_pool('guest-token'), 'guest-pool', 'the guest link lets a guest in');
select is((select count(*)::int from pool_members where user_id = 'c0000000-0000-0000-0000-000000000000'), 0,
          'a guest is not a member (not in standings, the Grid or the roster)');
select is((select count(*)::int from pools), 1, 'a guest sees the pool');
select is((select count(*)::int from pool_members), 2, 'and its players');
select is((select count(*)::int from picks), 1, 'and picks on games that have started, not before');
select is((select count(*)::int from board_posts), 1, 'and the message board');
select is((select count(*)::int from slate_submissions('60000000-0000-0000-0000-000000000001')), 2, 'and who has submitted');
select throws_like($$select submit_picks('60000000-0000-0000-0000-000000000001',
                   '[{"game_id":"70000000-0000-0000-0000-000000000002","side":"home"}]'::jsonb)$$,
                 '%Slate not found%', 'a guest can''t make picks');
select throws_like($$insert into board_posts (pool_id, author_id, title, body)
                   values ('50000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'x', 'y')$$,
                 '%row-level security%', 'a guest can''t post');
select throws_like($$select * from pool_guest_accounts('50000000-0000-0000-0000-000000000000')$$,
                   '%Only the commissioner%', 'a guest can''t list guests');

-- The commissioner sees the guest.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select email from pool_guest_accounts('50000000-0000-0000-0000-000000000000')), 'guest@test.dev',
          'the commissioner sees the guest and their email');

-- The member link turns a guest into a player.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is(join_pool('player-token'), 'guest-pool', 'a guest can join as a player with the member link');
select is((select count(*)::int from pool_guests where user_id = 'c0000000-0000-0000-0000-000000000000'), 0,
          'and is no longer a guest');

select * from finish();
rollback;
