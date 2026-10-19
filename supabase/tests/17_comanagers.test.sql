-- Co-managers: invite, accept, save the owner's picks under the same locks, and the limits.
-- Run with: npx supabase test db
begin;
select plan(12);

-- A = commissioner, B = player (the owner), C = co-manager to be, D = another player
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'b@test.dev'),
  ('c0000000-0000-0000-0000-000000000000', 'c@test.dev'),
  ('d0000000-0000-0000-0000-000000000000', 'd@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaaf', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaaf', 'Away State');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Co-managers', 'comanager-pool', 'ncaaf', 2026,
   'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":2,"picks_mode":"exact","full_card":true,"confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player'),
  ('50000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000000', 'player');
insert into invites (pool_id, token) values ('50000000-0000-0000-0000-000000000000', 'pool-invite-token');
insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '1 day', now() + interval '6 days', 'open', now() - interval '1 day');
-- g1 kicked off; g2, g3 later
insert into games (id, sport, season, home_team_id, away_team_id, start_at)
select ('70000000-0000-0000-0000-00000000000' || i)::uuid, 'ncaaf', 2026,
       '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
       case when i = 1 then now() - interval '1 hour' else now() + interval '6 hours' end
from generate_series(1, 3) i;
insert into slate_games (slate_id, game_id)
select '60000000-0000-0000-0000-000000000001', ('70000000-0000-0000-0000-00000000000' || i)::uuid from generate_series(1, 3) i;
insert into picks (slate_id, game_id, user_id, picked_side) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'home');

set local role authenticated;

-- ---------- B makes an invite; C accepts ----------
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
create temp table t (token text) on commit drop;
insert into t select create_comanager_invite('50000000-0000-0000-0000-000000000000');
select is((select usable from comanager_invite_info((select token from t))), true, 'the owner gets a usable invite link');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is(accept_comanager_invite((select token from t)), 'comanager-pool', 'anyone can accept it');
select is((select owner_name from my_comanaged_entries()), 'b', 'the co-manager sees whose entry they run');
select ok(is_pool_member('50000000-0000-0000-0000-000000000000'), 'and can read the pool like a member');
select is((select count(*) from picks where user_id = 'b0000000-0000-0000-0000-000000000000'), 1::bigint, 'and sees the entry''s picks');

-- ---------- C saves B's picks: same locks, same full card ----------
select lives_ok(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away"}]', 'b0000000-0000-0000-0000-000000000000')$$,
  'the co-manager can complete the entry''s card');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000001","picked_side":"away"},
      {"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"away"}]', 'b0000000-0000-0000-0000-000000000000')$$,
  '%that pick is locked', 'and is held to the same locks');
select is((select edited_by from picks where user_id = 'b0000000-0000-0000-0000-000000000000'
             and game_id = '70000000-0000-0000-0000-000000000002'), null, 'a co-manager''s save isn''t marked as a commissioner edit');
select throws_like(
  $$select submit_picks('60000000-0000-0000-0000-000000000001',
    '[{"game_id":"70000000-0000-0000-0000-000000000002","picked_side":"home"}]', 'd0000000-0000-0000-0000-000000000000')$$,
  'Only the commissioner%', 'but can''t touch anyone else''s entry');

-- ---------- The limits ----------
select throws_like($$select join_pool('pool-invite-token')$$, '%co-manage an entry in this pool%',
                   'a co-manager can''t join with an entry of their own');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
delete from t;
insert into t select create_comanager_invite('50000000-0000-0000-0000-000000000000');
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select throws_like($$select accept_comanager_invite((select token from t))$$, '%own entry in this pool%',
                   'a player with their own entry can''t co-manage another');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select remove_comanager('50000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000');
select is((select count(*) from my_entry_comanagers()), 0::bigint, 'the owner can remove their co-manager');

select * from finish();
rollback;
