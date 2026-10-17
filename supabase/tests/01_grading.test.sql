-- Grading (HANDOFF.md §6.3). Run with: npx supabase test db
begin;
select plan(25);

-- ---------- fixtures ----------
insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000001', 'grader@test.dev');
insert into teams (id, sport, name) values
  ('20000000-0000-0000-0000-000000000001', 'ncaab', 'Home U'),
  ('20000000-0000-0000-0000-000000000002', 'ncaab', 'Away State');

-- Build a one-game pool/slate, place one pick, grade it, and return 'result:points'.
create function pg_temp.grade_case(
  p_pick_type text, p_spread numeric, p_home int, p_away int, p_side text,
  p_force boolean default false, p_voided boolean default false, p_confidence int default null,
  p_status text default 'final'
) returns text language plpgsql as $$
declare
  v_pool uuid := gen_random_uuid();
  v_slate uuid := gen_random_uuid();
  v_game uuid := gen_random_uuid();
  v_settings jsonb;
  v_out text;
begin
  v_settings := jsonb_build_object(
    'pick_type', p_pick_type,
    'picks_per_slate', 1,
    'picks_mode', 'max',
    'confidence', case when p_confidence is null then null
                       else jsonb_build_object('tiers', jsonb_build_array(
                              jsonb_build_object('points', p_confidence, 'count', 1))) end,
    'scoring', jsonb_build_object('win', 1, 'push', 0.5, 'loss', 0),
    'lock', jsonb_build_object('mode', 'per_game'),
    'lines', jsonb_build_object('bookmaker', 'draftkings', 'freeze_at', 'publish', 'force_half_point', p_force)
  );
  insert into pools (id, name, slug, sport, season, commissioner_id, settings)
  values (v_pool, 'Test', 'test-' || left(v_pool::text, 8), 'ncaab', 2026,
          '10000000-0000-0000-0000-000000000001', v_settings);
  insert into pool_members (pool_id, user_id, role) values (v_pool, '10000000-0000-0000-0000-000000000001', 'commissioner');
  insert into slates (id, pool_id, week, window_start, window_end, status)
  values (v_slate, v_pool, 1, now() - interval '2 days', now() + interval '1 day', 'locked');
  insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score)
  values (v_game, 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          now() - interval '1 day', p_status, p_home, p_away);
  insert into slate_games (slate_id, game_id, locked_home_spread, voided)
  values (v_slate, v_game, apply_half_point(p_spread, p_force), p_voided);
  insert into picks (slate_id, game_id, user_id, picked_side, confidence)
  values (v_slate, v_game, '10000000-0000-0000-0000-000000000001', p_side, p_confidence);

  perform grade_slate(v_slate);

  select coalesce(result, 'null') || ':' || coalesce(points::text, 'null') into v_out
  from picks where slate_id = v_slate;
  return v_out;
end;
$$;

-- ---------- ATS ----------
select is(pg_temp.grade_case('ats', -3.5, 74, 70, 'home'), 'win:1.00',  'home favorite -3.5 wins by 4: home covers');
select is(pg_temp.grade_case('ats', -3.5, 74, 70, 'away'), 'loss:0.00', 'home favorite -3.5 wins by 4: away pick loses');
select is(pg_temp.grade_case('ats', -3.5, 73, 70, 'home'), 'loss:0.00', 'home favorite -3.5 wins by 3: does not cover');
select is(pg_temp.grade_case('ats', -3.5, 73, 70, 'away'), 'win:1.00',  'home favorite -3.5 wins by 3: away covers');
select is(pg_temp.grade_case('ats', -3,   73, 70, 'home'), 'push:0.50', 'home -3 wins by 3: push');
select is(pg_temp.grade_case('ats', -3,   73, 70, 'away'), 'push:0.50', 'home -3 wins by 3: push both sides');
select is(pg_temp.grade_case('ats', -7,   75, 70, 'away'), 'win:1.00',  'away +7 underdog loses by 5: covers');
select is(pg_temp.grade_case('ats', -7,   70, 72, 'away'), 'win:1.00',  'away underdog wins outright: covers');
select is(pg_temp.grade_case('ats', 4.5,  70, 72, 'home'), 'win:1.00',  'home +4.5 underdog loses by 2: covers');
select is(pg_temp.grade_case('ats', 0,    71, 70, 'home'), 'win:1.00',  'pick''em: winner covers');
select is(pg_temp.grade_case('ats', 0,    71, 70, 'away'), 'loss:0.00', 'pick''em: loser does not');

-- ---------- force_half_point ----------
select is(apply_half_point(-3, true), -3.5::numeric, 'force_half_point: -3 → -3.5');
select is(apply_half_point(3, true),  3.5::numeric,  'force_half_point: +3 → +3.5');
select is(apply_half_point(-3.5, true), -3.5::numeric, 'force_half_point: half-point line unchanged');
select is(apply_half_point(-3, false), -3::numeric,  'force_half_point off: unchanged');
select is(pg_temp.grade_case('ats', -3, 73, 70, 'away', p_force => true), 'win:1.00',
          'force_half_point: home -3 (→ -3.5) wins by 3, away covers instead of push');

-- ---------- straight up / void ----------
select is(pg_temp.grade_case('straight_up', null, 80, 79, 'home'), 'win:1.00',  'straight up: home winner');
select is(pg_temp.grade_case('straight_up', null, 80, 79, 'away'), 'loss:0.00', 'straight up: away loser');
select is(pg_temp.grade_case('ats', -3.5, 74, 70, 'home', p_voided => true), 'void:0.00',  'voided game: void, 0 points');
select is(pg_temp.grade_case('straight_up', null, null, null, 'home', p_status => 'cancelled'), 'void:0.00',
          'cancelled game: void');
select is(pg_temp.grade_case('straight_up', null, 30, 20, 'home', p_status => 'in_progress'), 'null:null',
          'in-progress game: not graded yet');

-- ---------- confidence ----------
select is(pg_temp.grade_case('straight_up', null, 80, 70, 'home', p_confidence => 5), 'win:5.00', 'confidence win: earns its value');
select is(pg_temp.grade_case('straight_up', null, 80, 70, 'away', p_confidence => 5), 'loss:0.00', 'confidence loss: 0');

-- Confidence sums + override + idempotency on a multi-game slate
do $$
declare
  v_pool uuid := gen_random_uuid();
  v_slate uuid := '30000000-0000-0000-0000-000000000001';
  i int;
begin
  insert into pools (id, name, slug, sport, season, commissioner_id, settings)
  values (v_pool, 'Conf', 'conf-test', 'ncaab', 2026, '10000000-0000-0000-0000-000000000001',
          '{"pick_type":"straight_up","picks_per_slate":3,"picks_mode":"exact",
            "confidence":{"tiers":[{"points":5,"count":1},{"points":3,"count":1},{"points":2,"count":1}]},
            "scoring":{"win":1,"push":0,"loss":0},"lock":{"mode":"per_game"},
            "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
  insert into pool_members (pool_id, user_id) values (v_pool, '10000000-0000-0000-0000-000000000001');
  insert into slates (id, pool_id, week, window_start, window_end, status)
  values (v_slate, v_pool, 1, now() - interval '2 days', now(), 'locked');
  for i in 1..3 loop
    insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score)
    values (('40000000-0000-0000-0000-00000000000' || i)::uuid, 'ncaab', 2026,
            '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
            now() - interval '1 day', 'final', 70, 60);  -- home wins all three
    insert into slate_games (slate_id, game_id) values (v_slate, ('40000000-0000-0000-0000-00000000000' || i)::uuid);
  end loop;
  insert into picks (slate_id, game_id, user_id, picked_side, confidence) values
    (v_slate, '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'home', 5),
    (v_slate, '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'away', 3),
    (v_slate, '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'home', 2);
  perform grade_slate(v_slate);
  perform grade_slate(v_slate);  -- idempotent
end $$;

select results_eq(
  $$select points, wins, losses, (select status from slates where id = '30000000-0000-0000-0000-000000000001')
    from slate_scores where slate_id = '30000000-0000-0000-0000-000000000001'$$,
  $$values (7.00::numeric(7,2), 2, 1, 'graded'::text)$$,
  'confidence sums: 5 (win) + 0 (loss) + 2 (win) = 7; slate graded; re-grading is idempotent');

-- Commissioner override flips game 2 to an away win → 10 points (direct update; the
-- set_result_override wrapper adds the commissioner check + audit log).
update slate_games set override_home_score = 60, override_away_score = 70
where slate_id = '30000000-0000-0000-0000-000000000001' and game_id = '40000000-0000-0000-0000-000000000002';
select grade_slate('30000000-0000-0000-0000-000000000001');
select is((select points from slate_scores where slate_id = '30000000-0000-0000-0000-000000000001'),
          10.00::numeric(7,2), 'result override regrades and standings recompute');

select * from finish();
rollback;
