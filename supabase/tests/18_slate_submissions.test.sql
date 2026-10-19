-- slate_submissions: anyone in the pool sees who has submitted (counts only), not the picks.
-- Run with: npx supabase test db
begin;
select plan(3);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b0000000-0000-0000-0000-000000000000', 'b@test.dev'),
  ('c0000000-0000-0000-0000-000000000000', 'c@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaaf', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaaf', 'Away State');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('50000000-0000-0000-0000-000000000000', 'Subs', 'subs-pool', 'ncaaf', 2026, 'a0000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":1,"picks_mode":"exact","confidence":null,
     "scoring":{"win":1,"push":0.5,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'commissioner'),
  ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'player');
insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000000', 1,
   now() - interval '1 day', now() + interval '6 days', 'open', now() - interval '1 day');
insert into games (id, sport, season, home_team_id, away_team_id, start_at) values
  ('70000000-0000-0000-0000-000000000001', 'ncaaf', 2026, '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now() + interval '1 day');
insert into slate_games (slate_id, game_id) values ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001');
insert into picks (slate_id, game_id, user_id, picked_side) values
  ('60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'home');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select is((select picks from slate_submissions('60000000-0000-0000-0000-000000000001') where user_id = 'b0000000-0000-0000-0000-000000000000'),
          1, 'a member sees that another player has submitted, before kickoff');
select is((select picks from slate_submissions('60000000-0000-0000-0000-000000000001') where user_id = 'a0000000-0000-0000-0000-000000000000'),
          0, 'and that someone hasn''t');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select throws_like($$select * from slate_submissions('60000000-0000-0000-0000-000000000001')$$, 'Slate not found',
                   'someone outside the pool can''t ask');

select * from finish();
rollback;
