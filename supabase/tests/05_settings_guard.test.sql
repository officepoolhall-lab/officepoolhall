-- guard_pool_settings: core rules freeze once a week opens, but filling in
-- defaults for keys added later (wrong_pick, upset_bonus, missed_week) is not a change.
-- Run with: npx supabase test db
begin;
select plan(5);

insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'g@test.dev');
-- Stored before the Pool A rules existed: no wrong_pick, upset_bonus or missed_week.
insert into pools (id, name, slug, sport, season, commissioner_id, settings) values
  ('f1000000-0000-0000-0000-000000000000', 'Guard', 'guard-pool', 'ncaab', 2026,
   'f0000000-0000-0000-0000-000000000001',
   '{"pick_type":"straight_up","picks_per_slate":2,"picks_mode":"exact",
     "confidence":{"tiers":[{"points":2,"count":1},{"points":1,"count":1}]},
     "scoring":{"win":1,"push":0,"loss":0},
     "lock":{"mode":"per_game"},
     "lines":{"bookmaker":"draftkings","freeze_at":"publish","force_half_point":false}}');
insert into slates (pool_id, week, window_start, window_end, status, published_at) values
  ('f1000000-0000-0000-0000-000000000000', 1, now() - interval '1 day', now() + interval '6 days', 'open', now());

-- What saveSettings writes back after zod fills the defaults.
select lives_ok($$
  update pools set settings = settings
    || '{"upset_bonus":null,"missed_week":"zero"}'::jsonb
    || jsonb_build_object('confidence', (settings->'confidence') || '{"wrong_pick":"zero"}'::jsonb)
  where id = 'f1000000-0000-0000-0000-000000000000'
$$, 'filling in defaults is not a change');

select lives_ok($$
  update pools set settings = settings || '{"timezone":"America/New_York"}'::jsonb
  where id = 'f1000000-0000-0000-0000-000000000000'
$$, 'non-core settings still save');

select throws_like($$
  update pools set settings = jsonb_set(settings, '{confidence,wrong_pick}', '"minus_points"')
  where id = 'f1000000-0000-0000-0000-000000000000'
$$, '%can''t change after the first week opens%', 'wrong_pick is frozen');

select throws_like($$
  update pools set settings = settings || '{"upset_bonus":{"tiers":[{"min_share":0.8,"bonus":1}]}}'::jsonb
  where id = 'f1000000-0000-0000-0000-000000000000'
$$, '%can''t change after the first week opens%', 'upset_bonus is frozen');

select throws_like($$
  update pools set settings = settings || '{"missed_week":"last_place"}'::jsonb
  where id = 'f1000000-0000-0000-0000-000000000000'
$$, '%can''t change after the first week opens%', 'missed_week is frozen');

select * from finish();
rollback;
