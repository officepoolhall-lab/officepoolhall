-- Pool A rules (docs/RULES.md): minus points, upset bonus, missed weeks, per-game
-- deadlines, commissioner tip times, and ESPN time/venue ingest.
-- Run with: npx supabase test db
begin;
select plan(60);

-- ---------- fixtures ----------
-- e…01 = commissioner A, e…02 = player B, e…03 = player C; e…04+ = extra pickers.
insert into auth.users (id, email)
select ('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'u' || i || '@test.dev'
from generate_series(1, 20) i;
insert into teams (id, sport, name, espn_id) values
  ('20000000-0000-0000-0000-000000000001', 'ncaab', 'Home U', 'h1'),
  ('20000000-0000-0000-0000-000000000002', 'ncaab', 'Away State', 'a1');

create function pg_temp.u(i int) returns uuid language sql as $$
  select ('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
$$;

-- A Monday 8–14 days out (Central), so every "future" fixture really is in the future.
create function pg_temp.d() returns date language sql as $$
  select date_trunc('week', (now() at time zone 'America/Chicago')::date + 14)::date;
$$;
-- Wall-clock time in Central.
create function pg_temp.ct(p_day date, p_time text) returns timestamptz language sql as $$
  select (p_day + p_time::time) at time zone 'America/Chicago';
$$;
-- ESPN's TBD placeholder: midnight Eastern on the game's date.
create function pg_temp.tbd(p_day date) returns timestamptz language sql as $$
  select p_day::timestamp at time zone 'America/New_York';
$$;

create function pg_temp.game(p_id uuid, p_start timestamptz, p_tbd boolean default false) returns void
language sql as $$
  insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd)
  values (p_id, 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          p_start, p_tbd);
$$;

-- ============ effective_lock_at ============
select is(effective_lock_at('2026-11-02 10:00Z', true, '2026-11-02 23:00Z'), '2026-11-02 23:00Z'::timestamptz,
          'TBD game with a deadline locks at the deadline, not the placeholder');
select is(effective_lock_at('2026-11-02 10:00Z', true, null), '2026-11-02 10:00Z'::timestamptz,
          'TBD game without a deadline locks at the placeholder');
select is(effective_lock_at('2026-11-02 19:00Z', false, '2026-11-02 23:00Z'), '2026-11-02 19:00Z'::timestamptz,
          'game tipping before its deadline locks at tip');
select is(effective_lock_at('2026-11-03 01:00Z', false, '2026-11-02 23:00Z'), '2026-11-02 23:00Z'::timestamptz,
          'game tipping after its deadline locks at the deadline');
select is(effective_lock_at('2026-11-03 01:00Z', false, null), '2026-11-03 01:00Z'::timestamptz,
          'per_game mode: locks at tip');

-- ============ Upset bonus ============
-- One game, one slate. p_home / p_away are each picker's confidence on that side.
-- Returns 'h=result:points:bonus a=…' for the first picker on each side.
create function pg_temp.upset(
  p_home int[], p_away int[], p_home_score int, p_away_score int,
  p_flat boolean default false, p_voided boolean default false, p_status text default 'final'
) returns text language plpgsql as $$
declare
  v_pool uuid := gen_random_uuid();
  v_slate uuid := gen_random_uuid();
  v_game uuid := gen_random_uuid();
  v_n int := 0;
  v_c int;
  v_side text;
  v_out text := '';
begin
  insert into pools (id, name, slug, sport, season, commissioner_id, settings)
  values (v_pool, 'Upset', 'upset-' || left(v_pool::text, 8), 'ncaab', 2026, pg_temp.u(1),
          jsonb_build_object(
            'pick_type', 'straight_up', 'picks_per_slate', 1, 'picks_mode', 'max',
            'confidence', case when p_flat then null
                               else '{"tiers":[{"points":10,"count":1}],"wrong_pick":"minus_points"}'::jsonb end,
            'scoring', '{"win":1,"push":0,"loss":0}'::jsonb,
            'upset_bonus', '{"tiers":[{"min_share":0.8,"bonus":1},{"min_share":0.9,"bonus":2},{"min_share":0.95,"bonus":3}]}'::jsonb,
            'lock', '{"mode":"per_game"}'::jsonb,
            'lines', '{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}'::jsonb));
  insert into slates (id, pool_id, week, window_start, window_end, status)
  values (v_slate, v_pool, 1, now() - interval '2 days', now() + interval '1 day', 'locked');
  insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score)
  values (v_game, 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          now() - interval '1 day', p_status, p_home_score, p_away_score);
  insert into slate_games (slate_id, game_id, voided) values (v_slate, v_game, p_voided);

  foreach v_c in array p_home loop
    v_n := v_n + 1;
    insert into picks (slate_id, game_id, user_id, picked_side, confidence)
    values (v_slate, v_game, pg_temp.u(v_n), 'home', case when p_flat then null else v_c end);
  end loop;
  foreach v_c in array p_away loop
    v_n := v_n + 1;
    insert into picks (slate_id, game_id, user_id, picked_side, confidence)
    values (v_slate, v_game, pg_temp.u(v_n), 'away', case when p_flat then null else v_c end);
  end loop;

  perform grade_slate(v_slate);
  perform grade_slate(v_slate);  -- idempotent: the bonus is never added twice

  foreach v_side in array array['home', 'away'] loop
    v_out := v_out || left(v_side, 1) || '=' || coalesce((
      select coalesce(result, 'null') || ':' || coalesce(points::text, 'null') || ':' || coalesce(bonus::text, 'null')
      from picks where slate_id = v_slate and picked_side = v_side order by user_id limit 1), 'none') || ' ';
  end loop;
  return rtrim(v_out);
end;
$$;

-- 10 players, 34 points on home vs 6 on away = 85/15; away wins.
select is(pg_temp.upset('{4,4,4,4,4,4,4,6}', '{3,3}', 60, 70),
          'h=loss:-4.00:0.00 a=win:4.00:1.00', '85/15 split: correct minority pick +1 bonus, majority loses its points');
select is(pg_temp.upset('{10,10,10,10,6}', '{4}', 60, 70),
          'h=loss:-10.00:0.00 a=win:6.00:2.00', '92/8 split: +2');
select is(pg_temp.upset('{10,10,10,10,10,10,10,10,10,7}', '{3}', 60, 70),
          'h=loss:-10.00:0.00 a=win:6.00:3.00', '97/3 split: +3');
select is(pg_temp.upset('{4,4}', '{2}', 60, 70),
          'h=loss:-4.00:0.00 a=win:2.00:0.00', 'exactly 80/20: no bonus');
select is(pg_temp.upset('{9}', '{1}', 60, 70),
          'h=loss:-9.00:0.00 a=win:2.00:1.00', 'exactly 90/10: lower bracket (+1)');
select is(pg_temp.upset('{10,9}', '{1}', 60, 70),
          'h=loss:-10.00:0.00 a=win:3.00:2.00', 'exactly 95/5: lower bracket (+2)');
select is(pg_temp.upset('{4,4,4,4,4,4,4,6}', '{3,3}', 70, 60),
          'h=win:4.00:0.00 a=loss:-3.00:0.00', 'majority side wins: no bonus; wrong minority pick loses its points');
select is(pg_temp.upset('{5}', '{5}', 60, 70),
          'h=loss:-5.00:0.00 a=win:5.00:0.00', '50/50 split: no bonus');
select is(pg_temp.upset('{5,3}', '{}', 70, 60),
          'h=win:5.00:0.00 a=none', 'nobody on the other side: no bonus');
select is(pg_temp.upset('{10,10}', '{1,1,1}', 60, 70),
          'h=loss:-10.00:0.00 a=win:2.00:1.00', 'split is by points (20 vs 3 = 87%), not by players (2 vs 3)');
select is(pg_temp.upset('{4,4,4,4,4,4,4,6}', '{3,3}', 60, 70, p_voided => true),
          'h=void:0.00:0.00 a=void:0.00:0.00', 'voided game: no points, no bonus');
select is(pg_temp.upset('{1,1,1,1,1,1,1,1,1}', '{1}', 60, 70, p_flat => true),
          'h=loss:0.00:0.00 a=win:2.00:1.00', 'flat pool: split by pick count (9 vs 1 = 90%) → +1');
select is(pg_temp.upset('{4,4,4,4,4,4,4,6}', '{3,3}', 30, 40, p_status => 'in_progress'),
          'h=null:null:null a=null:null:null', 'ungraded game: points and bonus stay null');

-- ============ Minus points ============
do $$
declare
  v_pool uuid := gen_random_uuid();
  v_slate uuid := '30000000-0000-0000-0000-000000000001';
  i int;
begin
  insert into pools (id, name, slug, sport, season, commissioner_id, settings)
  values (v_pool, 'Minus', 'minus-test', 'ncaab', 2026, pg_temp.u(1),
          '{"pick_type":"straight_up","picks_per_slate":3,"picks_mode":"exact",
            "confidence":{"tiers":[{"points":5,"count":1},{"points":4,"count":1},{"points":3,"count":1}],
                          "wrong_pick":"minus_points"},
            "scoring":{"win":1,"push":0,"loss":0},"lock":{"mode":"per_game"},
            "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
  insert into pool_members (pool_id, user_id) values (v_pool, pg_temp.u(1));
  insert into slates (id, pool_id, week, window_start, window_end, status)
  values (v_slate, v_pool, 1, now() - interval '2 days', now(), 'locked');
  for i in 1..3 loop
    insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score)
    values (('40000000-0000-0000-0000-00000000000' || i)::uuid, 'ncaab', 2026,
            '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
            now() - interval '1 day', 'final', 70, 60);  -- home wins all three
    insert into slate_games (slate_id, game_id, voided)
    values (v_slate, ('40000000-0000-0000-0000-00000000000' || i)::uuid, i = 3);
  end loop;
  insert into picks (slate_id, game_id, user_id, picked_side, confidence) values
    (v_slate, '40000000-0000-0000-0000-000000000001', pg_temp.u(1), 'home', 5),  -- win
    (v_slate, '40000000-0000-0000-0000-000000000002', pg_temp.u(1), 'away', 4),  -- loss
    (v_slate, '40000000-0000-0000-0000-000000000003', pg_temp.u(1), 'home', 3);  -- void
  perform grade_slate(v_slate);
end $$;

select results_eq(
  $$select result, points from picks where slate_id = '30000000-0000-0000-0000-000000000001' order by game_id$$,
  $$values ('win', 5.00::numeric(5,2)), ('loss', -4.00), ('void', 0.00)$$,
  'minus points: win +5, loss −4, void 0');
select results_eq(
  $$select points, bonus, wins, losses, missed from slate_scores where slate_id = '30000000-0000-0000-0000-000000000001'$$,
  $$values (1.00::numeric(7,2), 0.00::numeric(7,2), 1, 1, false)$$,
  'minus points: weekly total 5 − 4 + 0 = 1');

-- ============ Missed week ============
-- A loses a 5 (−5), B wins a 5 (+5), C makes no picks. Returns C's 'points:missed'.
create function pg_temp.missed(p_mode text, p_with_picks boolean default true, p_status text default 'locked',
                               p_late_joiner boolean default false) returns text
language plpgsql as $$
declare
  v_pool uuid := gen_random_uuid();
  v_slate uuid := gen_random_uuid();
  v_game uuid := gen_random_uuid();
begin
  insert into pools (id, name, slug, sport, season, commissioner_id, settings)
  values (v_pool, 'Missed', 'missed-' || left(v_pool::text, 8), 'ncaab', 2026, pg_temp.u(1),
          jsonb_build_object(
            'pick_type', 'straight_up', 'picks_per_slate', 1, 'picks_mode', 'exact',
            'confidence', '{"tiers":[{"points":5,"count":1}],"wrong_pick":"minus_points"}'::jsonb,
            'scoring', '{"win":1,"push":0,"loss":0}'::jsonb,
            'lock', '{"mode":"per_game"}'::jsonb,
            'lines', '{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}'::jsonb)
          || case when p_mode is null then '{}'::jsonb else jsonb_build_object('missed_week', p_mode) end);
  insert into pool_members (pool_id, user_id, joined_at) values
    (v_pool, pg_temp.u(1), now() - interval '30 days'), (v_pool, pg_temp.u(2), now() - interval '30 days'),
    (v_pool, pg_temp.u(3), now() - interval '30 days');
  insert into slates (id, pool_id, week, window_start, window_end, status)
  values (v_slate, v_pool, 1, now() - interval '2 days', now(), p_status);
  insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score)
  values (v_game, 'ncaab', 2026, '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          now() - interval '1 day', 'final', 60, 70);
  insert into slate_games (slate_id, game_id) values (v_slate, v_game);
  if p_with_picks then
    insert into picks (slate_id, game_id, user_id, picked_side, confidence) values
      (v_slate, v_game, pg_temp.u(1), 'home', 5),
      (v_slate, v_game, pg_temp.u(2), 'away', 5);
  end if;
  if p_late_joiner then
    -- C joined after the week was over.
    update pool_members set joined_at = now() + interval '1 minute' where pool_id = v_pool and user_id = pg_temp.u(3);
  end if;
  perform grade_slate(v_slate);
  perform grade_slate(v_slate);
  return (select points || ':' || missed from slate_scores where slate_id = v_slate and user_id = pg_temp.u(3))
      || ' A:' || (select points || ':' || missed from slate_scores where slate_id = v_slate and user_id = pg_temp.u(1));
end;
$$;

select is(pg_temp.missed('last_place'), '-5.00:true A:-5.00:false',
          'last_place: a member with no picks gets the week''s lowest total, even when negative');
select is(pg_temp.missed('zero'), '0.00:true A:-5.00:false', 'missed_week zero: no picks scores 0');
select is(pg_temp.missed(null), '0.00:true A:-5.00:false', 'missed_week absent defaults to zero');
select is(pg_temp.missed('last_place', false), '0.00:true A:0.00:true', 'last_place with nobody picking: everyone 0');
select is(pg_temp.missed('last_place', p_status => 'open'), '0.00:false A:-5.00:false',
          'last_place: not applied while the slate is still open (the player can still pick)');
select is(pg_temp.missed('last_place', p_late_joiner => true), '0.00:false A:-5.00:false',
          'last_place: a member who joined after the week isn''t scored as missing it');

-- ============ Deadlines: publish ============
-- Pool 1 = weekly (Tue 5pm, Monday 5pm), A commissioner, B player. Pool 2 = per_game.
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('81000000-0000-0000-0000-000000000001', 'Weekly', 'weekly-rules', 'ncaab', 2026, pg_temp.u(1),
   '{"pick_type":"straight_up","picks_per_slate":6,"picks_mode":"max",
     "confidence":{"tiers":[{"points":5,"count":3},{"points":3,"count":3}]},
     "scoring":{"win":1,"push":0,"loss":0},
     "lock":{"mode":"weekly","weekly":{"weekday":2,"time":"17:00","first_day_time":"17:00"}},
     "timezone":"America/Chicago","window":{"start_weekday":1,"length_days":7},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}'),
  ('81000000-0000-0000-0000-000000000002', 'PerGame', 'per-game-rules', 'ncaab', 2026, pg_temp.u(1),
   '{"pick_type":"straight_up","picks_per_slate":1,"picks_mode":"max","confidence":null,
     "scoring":{"win":1,"push":0,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values
  ('81000000-0000-0000-0000-000000000001', pg_temp.u(1), 'commissioner'),
  ('81000000-0000-0000-0000-000000000001', pg_temp.u(2), 'player'),
  ('81000000-0000-0000-0000-000000000002', pg_temp.u(1), 'commissioner');

-- Week 1 = Sun (d−1) through Sun; Monday deadline 5pm, main deadline Tue 5pm.
-- Week 2 = all-evening Monday. Weeks 3/4/5 exercise the publish guard.
insert into slates (id, pool_id, week, window_start, window_end, lock_at, first_day_lock_at) values
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 1,
   pg_temp.ct(pg_temp.d() - 1, '00:00'), pg_temp.ct(pg_temp.d() + 7, '00:00'),
   pg_temp.ct(pg_temp.d() + 1, '17:00'), pg_temp.ct(pg_temp.d(), '17:00')),
  ('83000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 2,
   pg_temp.ct(pg_temp.d() + 7, '00:00'), pg_temp.ct(pg_temp.d() + 14, '00:00'),
   pg_temp.ct(pg_temp.d() + 8, '17:00'), pg_temp.ct(pg_temp.d() + 7, '17:00')),
  ('83000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001', 3,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', null),
  ('83000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', 4,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', null),
  ('83000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000001', 5,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', now() - interval '1 hour'),
  ('83000000-0000-0000-0000-000000000010', '81000000-0000-0000-0000-000000000002', 1,
   now() - interval '1 day', now() + interval '6 days', null, null);

select pg_temp.game('82000000-0000-0000-0000-000000000001', pg_temp.ct(pg_temp.d() - 1, '11:00'));  -- Sun
select pg_temp.game('82000000-0000-0000-0000-000000000002', pg_temp.ct(pg_temp.d(), '13:00'));      -- Mon afternoon
select pg_temp.game('82000000-0000-0000-0000-000000000003', pg_temp.ct(pg_temp.d(), '19:00'));      -- Mon evening
select pg_temp.game('82000000-0000-0000-0000-000000000004', pg_temp.tbd(pg_temp.d()), true);        -- Mon TBD
select pg_temp.game('82000000-0000-0000-0000-000000000005', pg_temp.ct(pg_temp.d() + 1, '18:00'));  -- Tue
select pg_temp.game('82000000-0000-0000-0000-000000000006', pg_temp.tbd(pg_temp.d() + 2), true);    -- Wed TBD
select pg_temp.game('82000000-0000-0000-0000-000000000007', pg_temp.ct(pg_temp.d() + 7, '19:00'));
select pg_temp.game('82000000-0000-0000-0000-000000000008', pg_temp.ct(pg_temp.d() + 7, '20:00'));
select pg_temp.game('82000000-0000-0000-0000-000000000009', pg_temp.ct(pg_temp.d() + 8, '12:00'));
select pg_temp.game('82000000-0000-0000-0000-000000000010', now() + interval '1 day');
select pg_temp.game('82000000-0000-0000-0000-000000000011', now() - interval '1 hour');         -- tipped
select pg_temp.game('82000000-0000-0000-0000-000000000012', now() - interval '2 hours', true);  -- TBD, placeholder passed
select pg_temp.game('82000000-0000-0000-0000-000000000013', now() + interval '1 day');
insert into slate_games (slate_id, game_id)
select ('83000000-0000-0000-0000-0000000000' || s)::uuid, ('82000000-0000-0000-0000-0000000000' || g)::uuid
from (values ('01','01'),('01','02'),('01','03'),('01','04'),('01','05'),('01','06'),
             ('02','07'),('02','08'),('02','09'),
             ('03','11'),('04','12'),('05','13'),('10','10')) v(s, g);

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select publish_slate('83000000-0000-0000-0000-000000000001');
select publish_slate('83000000-0000-0000-0000-000000000002');
select publish_slate('83000000-0000-0000-0000-000000000010');

select results_eq(
  $$select right(game_id::text, 2), lock_at from slate_games
    where slate_id = '83000000-0000-0000-0000-000000000001' order by game_id$$,
  $$values ('01', pg_temp.ct(pg_temp.d() + 1, '17:00')),
           ('02', pg_temp.ct(pg_temp.d(), '13:00')),
           ('03', pg_temp.ct(pg_temp.d(), '13:00')),
           ('04', pg_temp.ct(pg_temp.d(), '13:00')),
           ('05', pg_temp.ct(pg_temp.d() + 1, '17:00')),
           ('06', pg_temp.ct(pg_temp.d() + 1, '17:00'))$$,
  'publish: a Monday afternoon tip pulls every Monday game (incl. TBD) earlier; Sunday and Tue+ get the main deadline');
select results_eq(
  $$select right(game_id::text, 2), lock_at from slate_games
    where slate_id = '83000000-0000-0000-0000-000000000002' order by game_id$$,
  $$values ('07', pg_temp.ct(pg_temp.d() + 7, '17:00')),
           ('08', pg_temp.ct(pg_temp.d() + 7, '17:00')),
           ('09', pg_temp.ct(pg_temp.d() + 8, '17:00'))$$,
  'publish: evening-only Monday locks at 5pm; a Tuesday noon game gets the main deadline (and locks at its tip)');
select is((select lock_at from slate_games where slate_id = '83000000-0000-0000-0000-000000000010'), null,
          'publish in per_game mode leaves lock_at null');
select throws_like($$select publish_slate('83000000-0000-0000-0000-000000000003')$$,
  '%has already started; remove it before publishing', 'publish rejects a game that has tipped');
select lives_ok($$select publish_slate('83000000-0000-0000-0000-000000000004')$$,
  'publish accepts a TBD game whose placeholder has passed when the deadline is ahead');
select is((select lock_at from slate_games where slate_id = '83000000-0000-0000-0000-000000000004'),
          now() + interval '1 day', 'a TBD game off the first day gets the main deadline');
select throws_like($$select publish_slate('83000000-0000-0000-0000-000000000005')$$,
  'Set the first-day lock time in the future%', 'publish rejects a first-day deadline in the past');

-- ============ Deadlines: picks, visibility, close ============
-- Week 6: open; g14's deadline passed but it tips in 3h; g15's deadline is in an hour.
-- Week 7: every game past its deadline (one TBD with a passed placeholder) → closes.
-- Week 8: TBD game, placeholder passed, deadline ahead → stays open.
insert into slates (id, pool_id, week, window_start, window_end, lock_at, status, published_at) values
  ('83000000-0000-0000-0000-000000000006', '81000000-0000-0000-0000-000000000001', 6,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', 'open', now() - interval '1 day'),
  ('83000000-0000-0000-0000-000000000007', '81000000-0000-0000-0000-000000000001', 7,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', 'open', now() - interval '1 day'),
  ('83000000-0000-0000-0000-000000000008', '81000000-0000-0000-0000-000000000001', 8,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', 'open', now() - interval '1 day');
select pg_temp.game('82000000-0000-0000-0000-000000000014', now() + interval '3 hours');
select pg_temp.game('82000000-0000-0000-0000-000000000015', now() + interval '1 day');
select pg_temp.game('82000000-0000-0000-0000-000000000016', now() + interval '2 hours');
select pg_temp.game('82000000-0000-0000-0000-000000000017', now() - interval '3 hours', true);
select pg_temp.game('82000000-0000-0000-0000-000000000018', now() - interval '3 hours', true);
insert into slate_games (slate_id, game_id, lock_at) values
  ('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000014', now() - interval '1 minute'),
  ('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000015', now() + interval '1 hour'),
  ('83000000-0000-0000-0000-000000000007', '82000000-0000-0000-0000-000000000016', now() - interval '1 minute'),
  ('83000000-0000-0000-0000-000000000007', '82000000-0000-0000-0000-000000000017', now() - interval '1 minute'),
  ('83000000-0000-0000-0000-000000000008', '82000000-0000-0000-0000-000000000018', now() + interval '1 hour');
insert into picks (slate_id, game_id, user_id, picked_side, confidence) values
  ('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000014', pg_temp.u(1), 'away', 5),
  ('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000015', pg_temp.u(1), 'away', 3),
  ('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000014', pg_temp.u(2), 'home', 5);

-- Week 9: a TBD game ESPN already has as final (it never posts a time), deadline ahead.
insert into slates (id, pool_id, week, window_start, window_end, lock_at, status, published_at) values
  ('83000000-0000-0000-0000-000000000009', '81000000-0000-0000-0000-000000000001', 9,
   now() - interval '1 day', now() + interval '6 days', now() + interval '1 day', 'open', now() - interval '1 day');
insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd, status, home_score, away_score)
values ('82000000-0000-0000-0000-000000000020', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002', now() - interval '20 hours', true, 'final', 80, 60);
insert into slate_games (slate_id, game_id, lock_at) values
  ('83000000-0000-0000-0000-000000000009', '82000000-0000-0000-0000-000000000020', now() + interval '1 day');
insert into picks (slate_id, game_id, user_id, picked_side, confidence) values
  ('83000000-0000-0000-0000-000000000009', '82000000-0000-0000-0000-000000000020', pg_temp.u(1), 'away', 5);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_like(
  $$select submit_picks('83000000-0000-0000-0000-000000000009',
    '[{"game_id":"82000000-0000-0000-0000-000000000020","picked_side":"home","confidence":5}]')$$,
  '%has started; that pick is locked', 'a TBD game that has been played can''t be picked before its deadline');
select is((select count(*) from picks where game_id = '82000000-0000-0000-0000-000000000020'), 1::bigint,
          'others'' picks on a played TBD game are visible before its deadline');

select throws_like(
  $$select submit_picks('83000000-0000-0000-0000-000000000006',
    '[{"game_id":"82000000-0000-0000-0000-000000000014","picked_side":"away","confidence":5}]')$$,
  '%is past its pick deadline; that pick is locked', 'can''t change a pick after its deadline though the game hasn''t tipped');
select throws_like(
  $$select submit_picks('83000000-0000-0000-0000-000000000006',
    '[{"game_id":"82000000-0000-0000-0000-000000000015","picked_side":"home","confidence":3}]')$$,
  '%is past its pick deadline; that pick is locked', 'can''t drop a pick after its deadline');
select lives_ok(
  $$select submit_picks('83000000-0000-0000-0000-000000000006',
    '[{"game_id":"82000000-0000-0000-0000-000000000014","picked_side":"home","confidence":5},
      {"game_id":"82000000-0000-0000-0000-000000000015","picked_side":"home","confidence":3}]')$$,
  'games before their deadline stay pickable');
select lives_ok(
  $$select submit_picks('83000000-0000-0000-0000-000000000004',
    '[{"game_id":"82000000-0000-0000-0000-000000000012","picked_side":"home","confidence":5}]')$$,
  'a TBD game is pickable after its placeholder until its deadline');
select is((select count(*) from picks where user_id = 'e0000000-0000-0000-0000-000000000001'
             and game_id = '82000000-0000-0000-0000-000000000014'), 1::bigint,
          'another player''s pick is visible once its deadline passes, before tip');
select is((select count(*) from picks where user_id = 'e0000000-0000-0000-0000-000000000001'
             and game_id = '82000000-0000-0000-0000-000000000015'), 0::bigint,
          'another player''s pick is hidden before its deadline');

reset role;
select close_slates();
select results_eq(
  $$select week, status from slates where pool_id = '81000000-0000-0000-0000-000000000001' and week in (1, 6, 7, 8) order by week$$,
  $$values (1, 'open'), (6, 'open'), (7, 'locked'), (8, 'open')$$,
  'close_slates: locks a slate once every game is past its deadline; a passed TBD placeholder doesn''t count');
select results_eq(
  $$select count(*), bool_and(missed) from slate_scores where slate_id = '83000000-0000-0000-0000-000000000007'$$,
  $$values (2::bigint, true)$$,
  'close_slates: a newly locked slate is graded, so missed weeks are scored at lock');

-- ============ set_game_time ============
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_like(
  $$select set_game_time('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000004', now() + interval '1 day')$$,
  'Slate not found', 'a player can''t set a game time');

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select set_game_time('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000004',
                         pg_temp.ct(pg_temp.d(), '12:00'))$$,
  'commissioner sets a TBD Monday game to noon');
select results_eq(
  $$select start_at, time_tbd, manual_time from games where id = '82000000-0000-0000-0000-000000000004'$$,
  $$values (pg_temp.ct(pg_temp.d(), '12:00'), false, true)$$,
  'set_game_time: start_at set, no longer TBD, marked manual');
select is((select count(*) from audit_log where action = 'set_game_time'
             and detail->>'game_id' = '82000000-0000-0000-0000-000000000004'), 1::bigint,
          'set_game_time is audited');
select results_eq(
  $$select right(game_id::text, 2), lock_at from slate_games
    where slate_id = '83000000-0000-0000-0000-000000000001'
      and game_id in ('82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000003',
                      '82000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000005')
    order by game_id$$,
  $$values ('02', pg_temp.ct(pg_temp.d(), '12:00')), ('03', pg_temp.ct(pg_temp.d(), '12:00')),
           ('04', pg_temp.ct(pg_temp.d(), '12:00')), ('05', pg_temp.ct(pg_temp.d() + 1, '17:00'))$$,
  'set_game_time: the new noon tip pulls the whole Monday group earlier; Tuesday unchanged');
select throws_like(
  $$select set_game_time('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000009', now() + interval '1 day')$$,
  'That game is not on this slate', 'set_game_time: game must be on the slate');
select throws_like(
  $$select set_game_time('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000014', now() + interval '1 day')$$,
  '%already has a time from ESPN', 'set_game_time: a real ESPN time can''t be overwritten');
reset role;
select pg_temp.game('82000000-0000-0000-0000-000000000019', now() + interval '1 hour', true);
insert into slate_games (slate_id, game_id, lock_at)
values ('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000019', now() - interval '1 minute');
select throws_like(
  $$select set_game_time('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000019', now() + interval '1 day')$$,
  '%is already locked%', 'set_game_time: refused once the game is past its deadline');
-- Pool X (C commissioner) puts week 8's TBD game, open in Pool 1, on its own draft.
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('81000000-0000-0000-0000-000000000003', 'Other', 'other-rules', 'ncaab', 2026, pg_temp.u(3),
   '{"pick_type":"straight_up","picks_per_slate":1,"picks_mode":"max","confidence":null,
     "scoring":{"win":1,"push":0,"loss":0},"lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into pool_members (pool_id, user_id, role) values ('81000000-0000-0000-0000-000000000003', pg_temp.u(3), 'commissioner');
insert into slates (id, pool_id, week, window_start, window_end) values
  ('83000000-0000-0000-0000-000000000030', '81000000-0000-0000-0000-000000000003', 1, now() - interval '1 day', now() + interval '6 days');
insert into slate_games (slate_id, game_id) values
  ('83000000-0000-0000-0000-000000000030', '82000000-0000-0000-0000-000000000018');
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_like(
  $$select set_game_time('83000000-0000-0000-0000-000000000030', '82000000-0000-0000-0000-000000000018', now() + interval '2 minutes')$$,
  '%is on another pool''s slate%', 'set_game_time: can''t move a game on another pool''s published slate');
select is((select start_at from games where id = '82000000-0000-0000-0000-000000000018'), now() - interval '3 hours',
          'set_game_time: the other pool''s game is unchanged');
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_like(
  $$select set_game_time('83000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000015', now() - interval '1 hour')$$,
  'Enter a start time in the future', 'set_game_time: time must be in the future');

-- ============ ingest_espn ============
reset role;

insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd, manual_time, espn_id) values
  ('84000000-0000-0000-0000-000000000001', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now() + interval '1 day', false, true, 'T1'),
  ('84000000-0000-0000-0000-000000000002', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now() - interval '3 hours', true, false, 'T2'),
  ('84000000-0000-0000-0000-000000000003', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now() - interval '1 hour', false, false, 'T3');

create function pg_temp.feed(p_espn_id text, p_start timestamptz, p_tbd boolean, p_venue text default null)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'espn_id', p_espn_id, 'season', 2026, 'home_espn_id', 'h1', 'away_espn_id', 'a1',
    'start_at', p_start, 'time_tbd', p_tbd, 'status', 'scheduled', 'neutral_site', p_venue is not null,
    'venue', p_venue));
$$;

select ingest_espn('ncaab', '[]', pg_temp.feed('T1', now() + interval '20 hours', true));
select results_eq($$select start_at, time_tbd, manual_time from games where espn_id = 'T1'$$,
  $$values (now() + interval '1 day', false, true)$$, 'ingest: a manual time survives a feed that still says TBD');
select ingest_espn('ncaab', '[]', pg_temp.feed('T1', now() + interval '30 hours', false));
select results_eq($$select start_at, time_tbd, manual_time from games where espn_id = 'T1'$$,
  $$values (now() + interval '30 hours', false, false)$$, 'ingest: a real feed time replaces the manual time');
select ingest_espn('ncaab', '[]', pg_temp.feed('T2', now() + interval '5 hours', false));
select results_eq($$select start_at, time_tbd from games where espn_id = 'T2'$$,
  $$values (now() + interval '5 hours', false)$$, 'ingest: a passed TBD placeholder doesn''t freeze the start time');
select ingest_espn('ncaab', '[]', pg_temp.feed('T3', now() + interval '2 hours', false));
select is((select start_at from games where espn_id = 'T3'), now() - interval '1 hour',
          'ingest: a game that has really started never moves');
-- Per-game pool: a TBD game locked at its passed placeholder (picks visible). A real
-- time from ESPN must not reopen it.
insert into games (id, sport, season, home_team_id, away_team_id, start_at, time_tbd, espn_id) values
  ('84000000-0000-0000-0000-000000000005', 'ncaab', 2026, '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000002', now() - interval '2 hours', true, 'T5');
insert into slates (id, pool_id, week, window_start, window_end, status, published_at) values
  ('83000000-0000-0000-0000-000000000011', '81000000-0000-0000-0000-000000000002', 2,
   now() - interval '1 day', now() + interval '6 days', 'open', now() - interval '1 day');
insert into slate_games (slate_id, game_id) values
  ('83000000-0000-0000-0000-000000000011', '84000000-0000-0000-0000-000000000005');
select ingest_espn('ncaab', '[]', pg_temp.feed('T5', now() + interval '6 hours', false));
select results_eq($$select start_at, time_tbd from games where espn_id = 'T5'$$,
  $$values (now() - interval '2 hours', true)$$,
  'ingest: a per_game TBD game locked at its placeholder isn''t reopened by a later feed time');
select ingest_espn('ncaab', '[]', pg_temp.feed('T4', now() + interval '2 days', false, 'Las Vegas, NV'));
select ingest_espn('ncaab', '[]', pg_temp.feed('T4', now() + interval '2 days', false));
select results_eq($$select venue, neutral_site from games where espn_id = 'T4'$$,
  $$values ('Las Vegas, NV'::text, false)$$, 'ingest: venue stored, and kept when a later feed omits it');

select * from finish();
rollback;
