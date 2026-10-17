-- Commissioner pick edits (20261017000022). Run with: npx supabase test db
begin;
select plan(23);

-- ---------- fixtures (as postgres) ----------
-- A = commissioner, B and C = players
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000000', 'a@test.dev'),
  ('b1000000-0000-0000-0000-000000000000', 'b@test.dev'),
  ('c1000000-0000-0000-0000-000000000000', 'c@test.dev');
insert into teams (id, sport, name) values
  ('21000000-0000-0000-0000-000000000001', 'ncaab', 'Home U'),
  ('21000000-0000-0000-0000-000000000002', 'ncaab', 'Away State');

insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('51000000-0000-0000-0000-000000000000', 'Edit Pool', 'edit-pool', 'ncaab', 2026,
   'a1000000-0000-0000-0000-000000000000',
   '{"pick_type":"straight_up","picks_per_slate":3,"picks_mode":"max",
     "scoring":{"win":1,"push":0,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('51000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'commissioner'),
  ('51000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'player'),
  ('51000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', 'player');

insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('61000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000000', 1,
   now() - interval '2 days', now() + interval '5 days', 'open', now() - interval '2 days');

-- g1 final (home won 70-60), g2 in progress, g3 and g4 upcoming
insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score)
select ('71000000-0000-0000-0000-00000000000' || i)::uuid, 'ncaab', 2026,
       '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002',
       case i when 1 then now() - interval '1 day' when 2 then now() - interval '1 hour' else now() + interval '1 day' end,
       case i when 1 then 'final' when 2 then 'in_progress' else 'scheduled' end,
       case when i = 1 then 70 end, case when i = 1 then 60 end
from generate_series(1, 4) i;
insert into slate_games (slate_id, game_id)
select '61000000-0000-0000-0000-000000000001', ('71000000-0000-0000-0000-00000000000' || i)::uuid
from generate_series(1, 4) i;

-- B lost g1 (away) and has g2; A won g1 (home)
insert into picks (slate_id, game_id, user_id, picked_side) values
  ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'away'),
  ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000000', 'home'),
  ('61000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'home');
select grade_slate('61000000-0000-0000-0000-000000000001');

-- ---------- as B (player): locks still hold ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_like(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000002","picked_side":"home"}]')$$,
  '%has started; that pick is locked', 'player can''t change a pick on a finished game');

-- ---------- as C (player): can't edit others ----------
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_like(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"home"}]',
    'b1000000-0000-0000-0000-000000000000')$$,
  'Only the commissioner%', 'a non-commissioner can''t edit another player''s picks');

-- ---------- as A (commissioner) ----------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select throws_like(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000001","picked_side":"away"}]')$$,
  '%has started; that pick is locked', 'the commissioner''s own picks still obey locks');

select throws_like(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000002","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000004","picked_side":"home"}]',
    'b1000000-0000-0000-0000-000000000000')$$,
  'Too many picks%', 'on-behalf edits still respect picks_per_slate');

-- Flip B's finished g1 to the winner, keep g2, add g3
select lives_ok(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000002","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"away"}]',
    'b1000000-0000-0000-0000-000000000000')$$,
  'commissioner can change a player''s pick on a locked, finished game');
-- Read as the owner: RLS hides B's still-open g3 pick from everyone else, the commissioner
-- included (the app's on-behalf view goes through member_picks instead).
reset role;
select results_eq(
  $$select game_id::text, picked_side from picks
    where user_id = 'b1000000-0000-0000-0000-000000000000' order by game_id$$,
  $$values ('71000000-0000-0000-0000-000000000001', 'home'),
           ('71000000-0000-0000-0000-000000000002', 'home'),
           ('71000000-0000-0000-0000-000000000003', 'away')$$,
  'the edit is saved');
select results_eq(
  $$select game_id::text, edited_by::text, edited_at is not null from picks
    where user_id = 'b1000000-0000-0000-0000-000000000000' order by game_id$$,
  $$values ('71000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', true),
           ('71000000-0000-0000-0000-000000000002', null, false),
           ('71000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', true)$$,
  'changed picks are marked with the commissioner; the untouched one isn''t');
set local role authenticated;
select is(
  (select result || ':' || points::text from picks
   where user_id = 'b1000000-0000-0000-0000-000000000000' and game_id = '71000000-0000-0000-0000-000000000001'),
  'win:1.00', 'the edited pick on the final game is regraded');
select is(
  (select points::text || '/' || wins from slate_scores
   where slate_id = '61000000-0000-0000-0000-000000000001' and user_id = 'b1000000-0000-0000-0000-000000000000'),
  '1.00/1', 'the player''s weekly score follows the edit');

-- ---------- as B: sees the marker; their own change clears it ----------
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

select is(
  (select edited_by::text from picks
   where user_id = 'b1000000-0000-0000-0000-000000000000' and game_id = '71000000-0000-0000-0000-000000000001'),
  'a1000000-0000-0000-0000-000000000000', 'the player can see who changed their pick');
select lives_ok(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000001","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000002","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"home"}]')$$,
  'player can still change an open game after a commissioner edit');
select results_eq(
  $$select game_id::text, edited_by::text from picks
    where user_id = 'b1000000-0000-0000-0000-000000000000' order by game_id$$,
  $$values ('71000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000'),
           ('71000000-0000-0000-0000-000000000002', null),
           ('71000000-0000-0000-0000-000000000003', null)$$,
  'the player''s own change clears the mark; the locked edit keeps it');

-- ---------- slate locked: only the commissioner can still edit ----------
reset role;
update slates set status = 'locked', lock_at = now() - interval '1 minute'
where id = '61000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_like(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000001","picked_side":"home"}]')$$,
  'This slate is not open for picks', 'player can''t edit a locked slate');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

-- Drop B's graded g1 pick: its result and points go with it
select lives_ok(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000002","picked_side":"home"},
      {"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"home"}]',
    'b1000000-0000-0000-0000-000000000000')$$,
  'commissioner can remove a pick on a locked slate');
select is(
  (select points::text || '/' || wins from slate_scores
   where slate_id = '61000000-0000-0000-0000-000000000001' and user_id = 'b1000000-0000-0000-0000-000000000000'),
  '0.00/0', 'removing a graded pick regrades the week');

-- Change B's in-progress g2: no result yet
select lives_ok(
  $$select submit_picks('61000000-0000-0000-0000-000000000001',
    '[{"game_id":"71000000-0000-0000-0000-000000000002","picked_side":"away"},
      {"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"home"}]',
    'b1000000-0000-0000-0000-000000000000')$$,
  'commissioner can change a pick on a game in progress');
select is(
  (select result from picks
   where user_id = 'b1000000-0000-0000-0000-000000000000' and game_id = '71000000-0000-0000-0000-000000000002'),
  null::text, 'a pick on an undecided game stays ungraded');

reset role;
select is(
  (select count(*) from audit_log where pool_id = '51000000-0000-0000-0000-000000000000' and action = 'picks_on_behalf'),
  3::bigint, 'each on-behalf save is audited');
select is(
  (select detail->'before'->0->>'picked_side' || '>' || (detail->'after'->0->>'picked_side')
   from audit_log where pool_id = '51000000-0000-0000-0000-000000000000' and action = 'picks_on_behalf'
   order by id limit 1),
  'away>home', 'the audit entry keeps the picks before and after');
select is(
  (select picked_side from picks
   where user_id = 'a1000000-0000-0000-0000-000000000000' and game_id = '71000000-0000-0000-0000-000000000001'),
  'home', 'the commissioner''s own locked pick is untouched');

-- ---------- week 2: closed with no finals, C texted their picks in late ----------
insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('61000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000000', 2,
   now() - interval '1 day', now() + interval '6 days', 'locked', now() - interval '1 day');
insert into slate_games (slate_id, game_id) values
  ('61000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000003'),
  ('61000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000004');
select grade_slate('61000000-0000-0000-0000-000000000002');
select is(
  (select missed from slate_scores
   where slate_id = '61000000-0000-0000-0000-000000000002' and user_id = 'c1000000-0000-0000-0000-000000000000'),
  true, 'a player with no picks on a closed week is marked missed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select lives_ok(
  $$select submit_picks('61000000-0000-0000-0000-000000000002',
    '[{"game_id":"71000000-0000-0000-0000-000000000003","picked_side":"home"}]',
    'c1000000-0000-0000-0000-000000000000')$$,
  'commissioner can enter late picks on a closed week with no finals');
reset role;
select is(
  (select missed from slate_scores
   where slate_id = '61000000-0000-0000-0000-000000000002' and user_id = 'c1000000-0000-0000-0000-000000000000'),
  false, 'late picks entered by the commissioner clear the missed week');

select * from finish();
rollback;
