-- PGA season pool: picks lock at the first tee time, a golfer is used once per entry,
-- other entries' picks show only after tee time, and standings sum final prize money.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('c6000000-0000-0000-0000-000000000001', 'gc@test.dev'),
  ('c6000000-0000-0000-0000-000000000002', 'gp@test.dev');
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('c6100000-0000-0000-0000-000000000000', 'Golf Test', 'golf-test', 'pga', 2027,
   'c6000000-0000-0000-0000-000000000001', '{}');
insert into pool_members (pool_id, user_id, role) values
  ('c6100000-0000-0000-0000-000000000000', 'c6000000-0000-0000-0000-000000000001', 'commissioner'),
  ('c6100000-0000-0000-0000-000000000000', 'c6000000-0000-0000-0000-000000000002', 'player');
-- Picks opened an hour ago for each (fixed, so the test doesn't depend on the weekday it runs).
insert into golf_events (id, pool_id, espn_id, name, sort_order, start_at, picks_open_at, status) values
  ('c6200000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000000', 'e1', 'Open Event', 1, now() + interval '1 day', now() - interval '1 hour', 'scheduled'),
  ('c6200000-0000-0000-0000-000000000002', 'c6100000-0000-0000-0000-000000000000', 'e2', 'Started Event', 2, now() - interval '1 hour', now() - interval '2 hours', 'scheduled'),
  ('c6200000-0000-0000-0000-000000000003', 'c6100000-0000-0000-0000-000000000000', 'e3', 'Later Event', 3, now() + interval '2 days', now() - interval '1 hour', 'scheduled'),
  ('c6200000-0000-0000-0000-000000000004', 'c6100000-0000-0000-0000-000000000000', 'e4', 'Not Open Yet', 4, now() + interval '9 days', null, 'scheduled');

-- Commissioner's entry picks Scheffler for the open event.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select submit_golf_pick('c6200000-0000-0000-0000-000000000001', '9478', 'Scottie Scheffler')$$,
  'an entry can pick a golfer for an open event');

select throws_like(
  $$select submit_golf_pick('c6200000-0000-0000-0000-000000000002', '1234', 'Someone Else')$$,
  '%locked%', 'picks for an event that has started are refused');

select throws_like(
  $$select submit_golf_pick('c6200000-0000-0000-0000-000000000003', '9478', 'Scottie Scheffler')$$,
  '%already on this entry%', 'a golfer can be used only once per entry per season');

select throws_like(
  $$select submit_golf_pick('c6200000-0000-0000-0000-000000000004', '1234', 'Someone Else')$$,
  '%aren''t open yet%', 'picks for a tournament open at 7 a.m. Monday of its week, not before');

-- The player's own pick for the open event.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select submit_golf_pick('c6200000-0000-0000-0000-000000000001', '1234', 'Someone Else')$$,
  'a second entry can pick the same event');

select is(
  (select count(*)::int from golf_picks where event_id = 'c6200000-0000-0000-0000-000000000001' and user_id = 'c6000000-0000-0000-0000-000000000001'),
  0, 'another entry''s pick is hidden before tee time');

-- After tee time, every pool member can see the picks.
reset role;
update golf_events set start_at = now() - interval '5 minutes' where id = 'c6200000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from golf_picks where event_id = 'c6200000-0000-0000-0000-000000000001' and user_id = 'c6000000-0000-0000-0000-000000000001'),
  1, 'another entry''s pick shows after tee time');

-- Results come in from the ESPN import (service role); the event becomes final.
reset role;
select lives_ok(
  $$select ingest_golf_results('c6200000-0000-0000-0000-000000000001', 'final',
    '[{"espn_golfer_id":"9478","golfer_name":"Scottie Scheffler","pos":"1","earnings":"10000000"},
      {"espn_golfer_id":"1234","golfer_name":"Someone Else","pos":"-","earnings":"0"}]'::jsonb)$$,
  'the results import records a final event');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select season_earnings from golf_standings('c6100000-0000-0000-0000-000000000000') where user_id = 'c6000000-0000-0000-0000-000000000001'),
  10000000::numeric, 'standings show the season prize money for the pick');
select is(
  (select season_earnings from golf_standings('c6100000-0000-0000-0000-000000000000') where user_id = 'c6000000-0000-0000-0000-000000000002'),
  0::numeric, 'a missed or withdrawn pick earns $0');

select * from finish();
rollback;
