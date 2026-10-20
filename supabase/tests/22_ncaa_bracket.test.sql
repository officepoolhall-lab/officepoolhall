-- NCAA Tournament bracket: setup, submit validation and locks, visibility, seed-weighted scoring,
-- and pruning picks when the field changes. Run with: npx supabase test db
begin;
select plan(17);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000c', 'comm@test.dev'),
  ('a0000000-0000-0000-0000-000000000001', 'p1@test.dev'),
  ('a0000000-0000-0000-0000-000000000002', 'p2@test.dev');
-- 65 teams: slot i holds team i (team 65 is a spare).
insert into teams (id, sport, name)
select ('a3000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'ncaab', 'Team ' || i from generate_series(0, 64) i;
insert into pools (id, name, slug, sport, season, commissioner_id, settings)
values ('a2000000-0000-0000-0000-000000000000', 'Hoops', 'hoops-b', 'ncaab', 2026, 'a0000000-0000-0000-0000-00000000000c', '{"pick_type":"straight_up"}');
insert into pool_members (pool_id, user_id, role) values
  ('a2000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'commissioner'),
  ('a2000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'player'),
  ('a2000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'player');

create function pg_temp.t(i int) returns text language sql as $$ select 'a3000000-0000-0000-0000-' || lpad(i::text, 12, '0') $$;
-- "Chalk": the top line of every game wins, so the winner of game g in round r is slot g·2^r.
create function pg_temp.chalk() returns jsonb language sql as $$
  select jsonb_object_agg(r || '-' || g, pg_temp.t(g * (1 << r)))
  from generate_series(1, 6) r, generate_series(0, 31) g where g < (32 >> (r - 1)) $$;

set local role authenticated;
create temp table b_ids (id uuid);
grant all on b_ids to authenticated;

select is(bracket_round_points(1, 16), 5::numeric, 'a 16 seed winning in round 1 is worth 5');
select is(bracket_round_points(6, 1), 12::numeric, 'a 1-seed champion is worth 12');
select is(bracket_round_points(4, 11), 12::numeric, 'an 11 seed winning its Elite 8 game is worth 12');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_like($$select save_bracket('a2000000-0000-0000-0000-000000000000', null, 'NCAA', 20, now() + interval '1 day',
  array['East','West','South','Midwest'], array(select pg_temp.t(i)::uuid from generate_series(0, 63) i))$$,
  'Only the commissioner%', 'a player can''t set up the bracket');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_like($$select save_bracket('a2000000-0000-0000-0000-000000000000', null, 'NCAA', 20, now() + interval '1 day',
  array['East','West','South','Midwest'], array(select pg_temp.t(i)::uuid from generate_series(0, 62) i))$$,
  'Fill in all 64 teams', 'needs all 64 teams');
insert into b_ids select save_bracket('a2000000-0000-0000-0000-000000000000', null, 'NCAA Tournament', 20, now() + interval '1 day',
  array['East','West','South','Midwest'], array(select pg_temp.t(i)::uuid from generate_series(0, 63) i));
select is((select count(*) from bracket_teams), 64::bigint, 'the commissioner sets the 64-team field');

-- Player 1 fills out chalk; player 2 takes the 16 seed (slot 1) in the first game, then chalk.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select submit_bracket((select id from b_ids), pg_temp.chalk())$$, 'player 1 submits a full bracket');
select throws_like($$select submit_bracket((select id from b_ids), pg_temp.chalk() || jsonb_build_object('2-0', pg_temp.t(1)))$$,
  'A pick doesn''t follow the bracket%', 'a later-round pick must be a team picked to get there');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select submit_bracket((select id from b_ids), jsonb_build_object('1-0', pg_temp.t(1), '1-1', pg_temp.t(2)))$$,
  'player 2 saves a partial bracket');
select is((select count(*) from bracket_entries), 1::bigint, 'before the lock, a player sees only their own bracket');

-- First-round results: the 16 seed (slot 1) upsets the 1; the 8 seed (slot 2) wins game 1.
reset role;
update brackets set lock_at = now() - interval '1 minute';
set local role authenticated;
select throws_like($$select submit_bracket((select id from b_ids), '{}'::jsonb)$$, 'Brackets are locked', 'no changes after the lock');
select is((select count(*) from bracket_entries), 2::bigint, 'after the lock, everyone''s brackets are visible');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_like($$select set_bracket_results((select id from b_ids), jsonb_build_object('2-0', pg_temp.t(5)))$$,
  'A pick doesn''t follow%', 'results follow the bracket too');
select lives_ok($$select set_bracket_results((select id from b_ids), jsonb_build_object('1-0', pg_temp.t(1), '1-1', pg_temp.t(2)))$$,
  'commissioner enters two first-round winners');
select results_eq(
  $$select right(user_id::text, 1), points, correct from bracket_entries order by user_id$$,
  $$values ('1', 2.0::numeric(6,1), 1), ('2', 7.0, 2)$$,
  'chalk gets the 8 seed (2); the upset pick adds the 16 seed (5)');

-- The commissioner swaps the 16 seed for another team: picks on it (and after it) drop.
select lives_ok($$select save_bracket('a2000000-0000-0000-0000-000000000000', (select id from b_ids), 'NCAA Tournament', 20, now() - interval '1 minute',
  array['East','West','South','Midwest'], array(select pg_temp.t(case when i = 1 then 64 else i end)::uuid from generate_series(0, 63) i))$$,
  'the commissioner replaces the 16 seed');
select results_eq(
  $$select right(user_id::text, 1), picks ? '1-0', points from bracket_entries order by user_id$$,
  $$values ('1', true, 2.0::numeric(6,1)), ('2', false, 2.0)$$,
  'only the pick on the removed team drops; the rest of each bracket (and its points) stays');

select * from finish();
rollback;
