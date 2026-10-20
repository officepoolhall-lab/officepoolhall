-- Tournament champion picks: commissioner setup, pick locks, visibility and scoring.
-- Run with: npx supabase test db
begin;
select plan(19);

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-00000000000c', 'comm@test.dev'),
  ('e0000000-0000-0000-0000-000000000001', 'p1@test.dev'),
  ('e0000000-0000-0000-0000-000000000002', 'p2@test.dev');
insert into teams (id, sport, name) values
  ('e1000000-0000-0000-0000-000000000001', 'ncaab', 'Arizona'),
  ('e1000000-0000-0000-0000-000000000002', 'ncaab', 'BYU'),
  ('e1000000-0000-0000-0000-000000000003', 'ncaab', 'VCU'),
  ('e1000000-0000-0000-0000-000000000004', 'ncaab', 'Clemson'),
  ('e1000000-0000-0000-0000-000000000005', 'ncaaf', 'Football U');
insert into pools (id, name, slug, sport, season, commissioner_id, settings)
values ('e2000000-0000-0000-0000-000000000000', 'Hoops', 'hoops-t', 'ncaab', 2026, 'e0000000-0000-0000-0000-00000000000c', '{"pick_type":"straight_up"}');
insert into pool_members (pool_id, user_id, role) values
  ('e2000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-00000000000c', 'commissioner'),
  ('e2000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'player'),
  ('e2000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'player');

set local role authenticated;

-- ---------- Setup ----------
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_like($$select save_tournament('e2000000-0000-0000-0000-000000000000', null, 'Maui', 3, now() + interval '1 day', 'third_place',
  array['e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002']::uuid[])$$,
  'Only the commissioner%', 'a player can''t add a tournament');

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_like($$select save_tournament('e2000000-0000-0000-0000-000000000000', null, 'Maui', 3, now() + interval '1 day', 'third_place',
  array['e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000005']::uuid[])$$,
  'Every team in the field must be a ncaab team', 'the field is the pool''s sport only');
create temp table t_ids (id uuid);
grant all on t_ids to authenticated;
insert into t_ids select save_tournament('e2000000-0000-0000-0000-000000000000', null, 'Maui', 3, now() + interval '1 day', 'third_place',
  array['e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002',
        'e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004']::uuid[]);
select is((select count(*) from tournament_teams), 4::bigint, 'commissioner adds Maui with a field of four');

-- ---------- Picks ----------
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select submit_tournament_pick((select id from t_ids), 'e1000000-0000-0000-0000-000000000001')$$, 'player 1 picks Arizona');
select lives_ok($$select submit_tournament_pick((select id from t_ids), 'e1000000-0000-0000-0000-000000000003')$$, 'and can change it to VCU');
select throws_like($$select submit_tournament_pick((select id from t_ids), 'e1000000-0000-0000-0000-000000000005')$$,
  'That team isn''t in the Maui field', 'only teams in the field');
select throws_like($$select submit_tournament_pick((select id from t_ids), 'e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002')$$,
  'Only the commissioner%', 'a player can''t pick for someone else');

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select submit_tournament_pick((select id from t_ids), 'e1000000-0000-0000-0000-000000000002')$$, 'player 2 picks BYU');
select is((select count(*) from tournament_picks), 1::bigint, 'before the lock, a player sees only their own pick');

-- ---------- Lock ----------
reset role;
update tournaments set lock_at = now() - interval '1 minute';
set local role authenticated;
select throws_like($$select submit_tournament_pick((select id from t_ids), 'e1000000-0000-0000-0000-000000000004')$$,
  'Maui picks are locked', 'no changes after the lock');
select is((select count(*) from tournament_picks), 2::bigint, 'after the lock, everyone''s picks are visible');

-- ---------- Results ----------
select throws_like($$select set_tournament_results((select id from t_ids), '{}'::jsonb)$$, 'Tournament not found', 'a player can''t enter results');
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_like($$select set_tournament_results((select id from t_ids),
  '{"e1000000-0000-0000-0000-000000000001":"champion","e1000000-0000-0000-0000-000000000002":"champion"}'::jsonb)$$,
  'Too many teams marked champion', 'one champion');
select throws_like($$select set_tournament_results((select id from t_ids),
  '{"e1000000-0000-0000-0000-000000000001":"semifinal"}'::jsonb)$$,
  'That place isn''t part%', 'semifinal isn''t a place in a third-place-game event');
select is((select count(*) filter (where points is not null) from tournament_picks), 0::bigint, 'no points before a champion is set');
select lives_ok($$select set_tournament_results((select id from t_ids),
  '{"e1000000-0000-0000-0000-000000000001":"champion","e1000000-0000-0000-0000-000000000002":"runner_up",
    "e1000000-0000-0000-0000-000000000003":"third","e1000000-0000-0000-0000-000000000004":"fourth"}'::jsonb)$$, 'results saved');
select results_eq(
  $$select right(user_id::text, 1), points from tournament_picks order by user_id$$,
  $$values ('1', 2.0::numeric(4,1)), ('2', 3.0)$$,
  'VCU won the 3rd-place game (+2), BYU was runner-up (+3)');

-- Semifinal-style scoring (Players Era 16): champion 5, runner-up 3, semifinal losers 1.5.
select lives_ok($$select save_tournament('e2000000-0000-0000-0000-000000000000', (select id from t_ids), 'Maui', 3,
  now() - interval '1 minute', 'semifinals',
  array['e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002',
        'e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004']::uuid[]);
  select set_tournament_results((select id from t_ids),
  '{"e1000000-0000-0000-0000-000000000001":"champion","e1000000-0000-0000-0000-000000000002":"runner_up",
    "e1000000-0000-0000-0000-000000000003":"semifinal","e1000000-0000-0000-0000-000000000004":"semifinal"}'::jsonb)$$,
  'switch to semifinal scoring and re-enter results');
select results_eq(
  $$select right(user_id::text, 1), points from tournament_picks order by user_id$$,
  $$values ('1', 1.5::numeric(4,1)), ('2', 3.0)$$,
  'a losing semifinalist pick scores 1.5');

select * from finish();
rollback;
