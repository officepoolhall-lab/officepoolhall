-- Conference tournaments: champion-only scoring (5 for the champion, nothing else).
-- Run with: npx supabase test db
begin;
select plan(5);

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000c', 'comm@test.dev'),
  ('f0000000-0000-0000-0000-000000000001', 'p1@test.dev'),
  ('f0000000-0000-0000-0000-000000000002', 'p2@test.dev');
insert into teams (id, sport, name, conference) values
  ('f1000000-0000-0000-0000-000000000001', 'ncaab', 'Duke', 'ACC'),
  ('f1000000-0000-0000-0000-000000000002', 'ncaab', 'UNC', 'ACC'),
  ('f1000000-0000-0000-0000-000000000003', 'ncaab', 'Louisville', 'ACC');
insert into pools (id, name, slug, sport, season, commissioner_id, settings)
values ('f2000000-0000-0000-0000-000000000000', 'Hoops', 'hoops-c', 'ncaab', 2026, 'f0000000-0000-0000-0000-00000000000c', '{"pick_type":"straight_up"}');
insert into pool_members (pool_id, user_id, role) values
  ('f2000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-00000000000c', 'commissioner'),
  ('f2000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'player'),
  ('f2000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000002', 'player');

set local role authenticated;
create temp table t_ids (id uuid);
grant all on t_ids to authenticated;

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
insert into t_ids select save_tournament('f2000000-0000-0000-0000-000000000000', null, 'ACC Tournament', 18, now() + interval '1 day', 'champion_only',
  array['f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000003']::uuid[]);
select is((select scoring from tournaments), 'champion_only', 'a conference tournament uses champion-only scoring');

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select submit_tournament_pick((select id from t_ids), 'f1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select submit_tournament_pick((select id from t_ids), 'f1000000-0000-0000-0000-000000000002');

-- The tournament tips off (picks are visible from here).
reset role;
update tournaments set lock_at = now() - interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_like($$select set_tournament_results((select id from t_ids), '{"f1000000-0000-0000-0000-000000000002":"runner_up"}'::jsonb)$$,
  'That place isn''t part%', 'no runner-up in champion-only scoring');
select lives_ok($$select set_tournament_results((select id from t_ids), '{"f1000000-0000-0000-0000-000000000001":"champion"}'::jsonb)$$, 'Duke wins the ACC');
select results_eq(
  $$select right(user_id::text, 1), points from tournament_picks order by user_id$$,
  $$values ('1', 5.0::numeric(4,1)), ('2', 0.0)$$,
  'the champion pick scores 5, any other 0');
select is(tournament_place_points('champion_only', 'runner_up'), 0::numeric, 'runner-up is worth nothing here');

select * from finish();
rollback;
