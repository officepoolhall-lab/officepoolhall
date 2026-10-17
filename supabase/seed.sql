-- Local dev seed: 30 teams, one Pool A with 5 users, and fake games.
--   Week 1: last week, all final, graded (standings have data)
--   Week 2: open now; the first 3 games (the "Monday" group) have tipped and their
--           deadline has passed; the rest lock at the earlier of their tip and the main
--           deadline (2 days out). One game is TBD (locks at the deadline).
--   Next week: 40 unassigned games for building a slate in the editor
-- Dates are relative to now() so the seed stays useful whenever you reset.
-- Sign in as any of these via magic link; emails land in Mailpit (http://127.0.0.1:54324).

-- ============ Users ============
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name),
       now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'brooks@example.com', 'Brooks'),
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'noah@example.com',   'Noah'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'alex@example.com',   'Alex'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'jordan@example.com', 'Jordan'),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'sam@example.com',    'Sam')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
from auth.users;

-- ============ Teams ============
insert into teams (sport, name, short_name, abbreviation, conference, odds_api_name)
select 'ncaab', t.name, t.short_name, t.abbr, t.conf, t.odds
from (values
  ('Duke Blue Devils', 'Duke', 'DUKE', 'ACC', 'Duke Blue Devils'),
  ('North Carolina Tar Heels', 'North Carolina', 'UNC', 'ACC', 'North Carolina Tar Heels'),
  ('Virginia Cavaliers', 'Virginia', 'UVA', 'ACC', 'Virginia Cavaliers'),
  ('Miami (FL) Hurricanes', 'Miami (FL)', 'MIA', 'ACC', 'Miami Hurricanes'),
  ('Louisville Cardinals', 'Louisville', 'LOU', 'ACC', 'Louisville Cardinals'),
  ('Clemson Tigers', 'Clemson', 'CLEM', 'ACC', 'Clemson Tigers'),
  ('Kansas Jayhawks', 'Kansas', 'KU', 'Big 12', 'Kansas Jayhawks'),
  ('Houston Cougars', 'Houston', 'HOU', 'Big 12', 'Houston Cougars'),
  ('Baylor Bears', 'Baylor', 'BAY', 'Big 12', 'Baylor Bears'),
  ('Iowa State Cyclones', 'Iowa State', 'ISU', 'Big 12', 'Iowa State Cyclones'),
  ('Texas Tech Red Raiders', 'Texas Tech', 'TTU', 'Big 12', 'Texas Tech Red Raiders'),
  ('Arizona Wildcats', 'Arizona', 'ARIZ', 'Big 12', 'Arizona Wildcats'),
  ('Kentucky Wildcats', 'Kentucky', 'UK', 'SEC', 'Kentucky Wildcats'),
  ('Auburn Tigers', 'Auburn', 'AUB', 'SEC', 'Auburn Tigers'),
  ('Alabama Crimson Tide', 'Alabama', 'ALA', 'SEC', 'Alabama Crimson Tide'),
  ('Tennessee Volunteers', 'Tennessee', 'TENN', 'SEC', 'Tennessee Volunteers'),
  ('Florida Gators', 'Florida', 'FLA', 'SEC', 'Florida Gators'),
  ('Arkansas Razorbacks', 'Arkansas', 'ARK', 'SEC', 'Arkansas Razorbacks'),
  ('Purdue Boilermakers', 'Purdue', 'PUR', 'Big Ten', 'Purdue Boilermakers'),
  ('Michigan State Spartans', 'Michigan State', 'MSU', 'Big Ten', 'Michigan St Spartans'),
  ('Illinois Fighting Illini', 'Illinois', 'ILL', 'Big Ten', 'Illinois Fighting Illini'),
  ('UCLA Bruins', 'UCLA', 'UCLA', 'Big Ten', 'UCLA Bruins'),
  ('Wisconsin Badgers', 'Wisconsin', 'WIS', 'Big Ten', 'Wisconsin Badgers'),
  ('Indiana Hoosiers', 'Indiana', 'IU', 'Big Ten', 'Indiana Hoosiers'),
  ('UConn Huskies', 'UConn', 'UCONN', 'Big East', 'UConn Huskies'),
  ('Marquette Golden Eagles', 'Marquette', 'MARQ', 'Big East', 'Marquette Golden Eagles'),
  ('Creighton Bluejays', 'Creighton', 'CREI', 'Big East', 'Creighton Bluejays'),
  ('Villanova Wildcats', 'Villanova', 'NOVA', 'Big East', 'Villanova Wildcats'),
  ('Gonzaga Bulldogs', 'Gonzaga', 'GONZ', 'WCC', 'Gonzaga Bulldogs'),
  ('Saint Mary''s Gaels', 'Saint Mary''s', 'SMC', 'WCC', 'Saint Mary''s Gaels')
) as t(name, short_name, abbr, conf, odds);

-- ============ Games ============
-- 40 games per batch, deterministic pairings. batch 1 = last week (final),
-- batch 2 = this week (first 3 already started), batch 3 = next week (unassigned).
with numbered as (
  select id, row_number() over (order by name) - 1 as idx from teams where sport = 'ncaab'
),
slots as (
  select b as batch, i,
         (i % 30) as home_idx,
         ((i % 30) + (i % 29) + 1) % 30 as away_idx,
         case b
           when 1 then now() - interval '8 days' + (i * interval '3 hours')
           when 2 then now() - interval '90 minutes' + (i * interval '30 minutes')
                       + case when i >= 3 then interval '1 day' + (i * interval '2 hours') else interval '0' end
           else now() + interval '7 days' + (i * interval '3 hours')
         end as start_at
  from generate_series(1, 3) b, generate_series(0, 39) i
)
insert into games (sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score,
                   espn_id, tv_network, home_rank, away_rank)
select 'ncaab', 2026, h.id, a.id, s.start_at,
       case when s.batch = 1 then 'final' when s.batch = 2 and s.i < 3 then 'in_progress' else 'scheduled' end,
       case when s.batch = 1 then 60 + (s.i * 7) % 25 when s.batch = 2 and s.i < 3 then 30 end,
       case when s.batch = 1 then 58 + (s.i * 11) % 29 when s.batch = 2 and s.i < 3 then 28 end,
       'seed-' || s.batch || '-' || s.i,
       (array['ESPN','CBS','FOX','ESPN2','FS1',null,null,null])[1 + s.i % 8],
       case when s.i % 5 = 0 then 1 + s.i % 25 end,
       case when s.i % 7 = 0 then 1 + (s.i * 3) % 25 end
from slots s
join numbered h on h.idx = s.home_idx
join numbered a on a.idx = s.away_idx;

-- Ties can't happen in basketball; nudge any the formula produced.
update games set home_score = home_score + 1 where status = 'final' and home_score = away_score;

-- A few neutral-site games with a location, and one TBD tip time (ESPN-style placeholder).
update games set neutral_site = true, venue = 'Las Vegas, NV' where espn_id in ('seed-1-4', 'seed-2-4', 'seed-3-4');
update games set neutral_site = true, venue = 'Rome, Italy' where espn_id = 'seed-2-9';
update games set time_tbd = true,
       start_at = date_trunc('day', start_at at time zone 'America/New_York') at time zone 'America/New_York'
where espn_id = 'seed-2-12';

-- ============ Pool A ============
insert into pools (id, name, slug, sport, season, commissioner_id, entry_fee, settings)
values (
  '00000000-0000-0000-0000-0000000000a1', 'Office Pool Hall NCAAB 2026-27', 'ncaab-2026', 'ncaab', 2026,
  '00000000-0000-0000-0000-00000000000b', 100,
  '{
    "pick_type": "straight_up",
    "picks_per_slate": 35,
    "picks_mode": "exact",
    "confidence": {"tiers": [{"points":5,"count":7},{"points":4,"count":7},{"points":3,"count":7},{"points":2,"count":7},{"points":1,"count":7}],
                   "wrong_pick": "minus_points"},
    "upset_bonus": {"tiers": [{"min_share":0.8,"bonus":1},{"min_share":0.9,"bonus":2},{"min_share":0.95,"bonus":3}]},
    "missed_week": "last_place",
    "scoring": {"win": 1, "push": 0, "loss": 0},
    "lock": {"mode": "weekly", "weekly": {"weekday": 3, "time": "12:00"}},
    "timezone": "America/Chicago",
    "window": {"start_weekday": 1, "length_days": 7},
    "lines": {"bookmaker": "draftkings", "freeze_at": "publish", "force_half_point": false},
    "visibility": {"show_picks_after": "lock"}
  }'
);

-- Everyone joined before week 1 (a member who joins after a week's deadline isn't
-- scored as having missed it).
insert into pool_members (pool_id, user_id, role, paid, joined_at)
select '00000000-0000-0000-0000-0000000000a1', id,
       case when id = '00000000-0000-0000-0000-00000000000b' then 'commissioner' else 'player' end,
       id <> '00000000-0000-0000-0000-000000000005',
       now() - interval '30 days'
from profiles;

insert into invites (pool_id, token) values ('00000000-0000-0000-0000-0000000000a1', 'seed-invite-token');

-- Local commissioners allowed to start pools (production manages its own list).
insert into pool_creators (email) values ('brooks@example.com'), ('noah@example.com');

-- ============ Slates ============
-- Deadlines mirror the weekly model with times relative to now(): the first-day
-- deadline sits just before week 2's first tip, the main deadline 2 days out.
insert into slates (id, pool_id, week, label, window_start, window_end, lock_at, first_day_lock_at, status, published_at)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 1, 'Week 1',
   now() - interval '9 days', now() - interval '2 days', now() - interval '8 days 1 hour', null,
   'locked', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 2, 'Week 2',
   now() - interval '1 day', now() + interval '6 days', now() + interval '2 days', now() - interval '2 hours',
   'open', now() - interval '1 day');

-- slate_games.lock_at is what publish_slate would have written.
insert into slate_games (slate_id, game_id, sort_order, lock_at)
select s.id, g.id, split_part(g.espn_id, '-', 3)::int,
       case when g.espn_id like 'seed-2-%' and split_part(g.espn_id, '-', 3)::int < 3
            then s.first_day_lock_at else s.lock_at end
from games g
join slates s on s.id = case when g.espn_id like 'seed-1-%' then '00000000-0000-0000-0000-0000000000c1'::uuid
                             else '00000000-0000-0000-0000-0000000000c2'::uuid end
where g.espn_id like 'seed-1-%' or g.espn_id like 'seed-2-%';

-- ============ Picks ============
-- Week 1: everyone but Sam picks the first 35 games; each player's confidence ordering
-- is rotated so tiers are exactly 7 × {5,4,3,2,1}. Sam missed the week (scores last place).
-- Week 2: Noah and Brooks have full sets; Alex picked only the 3 started games.
with players as (
  select id, row_number() over (order by id) as u from profiles
),
week_games as (
  select sg.slate_id, sg.game_id, sg.sort_order as idx
  from slate_games sg where sg.sort_order < 35
)
insert into picks (slate_id, game_id, user_id, picked_side, confidence)
select wg.slate_id, wg.game_id, p.id,
       case when (wg.idx + p.u) % 3 = 0 then 'away' else 'home' end,
       5 - ((wg.idx + p.u * 5) % 35) / 7
from week_games wg
cross join players p
where (wg.slate_id = '00000000-0000-0000-0000-0000000000c1' and p.id <> '00000000-0000-0000-0000-000000000005')
   or (wg.slate_id = '00000000-0000-0000-0000-0000000000c2'
       and (p.id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')
            or (p.id = '00000000-0000-0000-0000-000000000003' and wg.idx < 3)));

-- One week 1 upset so the bonus shows up: the lowest-confidence pick on a game everyone
-- took the home side of goes the other way, and the away team wins.
update picks set picked_side = 'away'
where id = (select p.id from picks p join games g on g.id = p.game_id
            where g.espn_id = 'seed-1-27' order by p.confidence, p.user_id limit 1);
update games set home_score = 65, away_score = 74 where espn_id = 'seed-1-27';

select grade_slate('00000000-0000-0000-0000-0000000000c1');
select grade_slate('00000000-0000-0000-0000-0000000000c2');
