-- ============================================================================
-- NCAAB Confidence Pool DEMO ("Hoops Sandbox")
-- Paste into Supabase → SQL Editor → Run. Safe to run once; it stops if the demo exists.
--
-- What it makes (dates are relative to when you run it):
--   * Pool "Hoops Sandbox (Demo)" at /p/hoops-demo, NCAAB Confidence preset:
--     25 straight-up picks a week from a 33-game slate, confidence 5 × {5,4,3,2,1},
--     wrong pick = minus its points,
--     upset bonus, missed week = last place, all picks due Wednesday noon Central.
--   * You (cross.brooks.a@gmail.com) as commissioner AND a player.
--   * 11 fake players (…@example.com, no passwords; they can't sign in).
--   * Week 1 = last week, every game final and graded.
--   * Week 2 = this week, open. Games that have already tipped are final; the rest are upcoming.
--     Most fake players have submitted; YOU haven't, so you can try the Picks screen.
--   * 38 more games next week, not on any slate, for practicing Admin → Slate.
-- To play out Week 2, enter scores in Admin → Results (standings recompute instantly).
-- Remove everything later with delete-ncaab-demo-pool.sql.
-- ============================================================================
begin;

do $$
declare
  v_me uuid;
  v_pool uuid := gen_random_uuid();
  v_w1 uuid := gen_random_uuid();
  v_w2 uuid := gen_random_uuid();
  v_tz text := 'America/Chicago';
  v_monday timestamptz;   -- this week's Monday 00:00 Central
  v_deadline timestamptz; -- this week's Wednesday 12:00 Central
begin
  select id into v_me from auth.users where lower(email) = 'cross.brooks.a@gmail.com';
  if v_me is null then raise exception 'No account for cross.brooks.a@gmail.com'; end if;
  if exists (select 1 from pools where slug = 'hoops-demo') then
    raise exception 'The demo pool already exists. Run delete-ncaab-demo-pool.sql first to rebuild it.';
  end if;

  v_monday := date_trunc('week', now() at time zone v_tz) at time zone v_tz;
  v_deadline := greatest(v_monday + interval '2 days 12 hours', now() + interval '1 day');

  -- ---------- Fake players ----------
  create temp table demo_people (id uuid, email text, name text) on commit drop;
  insert into demo_people
  select gen_random_uuid(), 'demo.' || lower(split_part(n, ' ', 1)) || '@example.com', n
  from unnest(array['Mike Sullivan','Tara Nguyen','Chris Palmer','Dana Ruiz','Kevin Oakes','Lauren Meyer',
                    'Jamal Price','Erin Walsh','Pete Kowalski','Becca Hart','Sam Delgado']) n;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
         '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', name),
         now(), now(), '', '', '', ''
  from demo_people;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
         now(), now(), now()
  from demo_people;

  -- ---------- Teams (real ESPN ids, so live data later just updates them) ----------
  insert into teams (sport, espn_id, name, short_name, abbreviation, conference, odds_api_name, logo_url)
  select 'ncaab', t.espn, t.name, t.short, t.abbr, t.conf, t.name,
         'https://a.espncdn.com/i/teamlogos/ncaa/500/' || t.espn || '.png'
  from (values
    ('150','Duke Blue Devils','Duke','DUKE','ACC'), ('153','North Carolina Tar Heels','North Carolina','UNC','ACC'),
    ('97','Louisville Cardinals','Louisville','LOU','ACC'), ('258','Virginia Cavaliers','Virginia','UVA','ACC'),
    ('2305','Kansas Jayhawks','Kansas','KU','Big 12'), ('248','Houston Cougars','Houston','HOU','Big 12'),
    ('239','Baylor Bears','Baylor','BAY','Big 12'), ('66','Iowa State Cyclones','Iowa State','ISU','Big 12'),
    ('2641','Texas Tech Red Raiders','Texas Tech','TTU','Big 12'), ('12','Arizona Wildcats','Arizona','ARIZ','Big 12'),
    ('252','BYU Cougars','BYU','BYU','Big 12'), ('96','Kentucky Wildcats','Kentucky','UK','SEC'),
    ('2','Auburn Tigers','Auburn','AUB','SEC'), ('333','Alabama Crimson Tide','Alabama','ALA','SEC'),
    ('2633','Tennessee Volunteers','Tennessee','TENN','SEC'), ('57','Florida Gators','Florida','FLA','SEC'),
    ('8','Arkansas Razorbacks','Arkansas','ARK','SEC'), ('251','Texas Longhorns','Texas','TEX','SEC'),
    ('2509','Purdue Boilermakers','Purdue','PUR','Big Ten'), ('127','Michigan State Spartans','Michigan State','MSU','Big Ten'),
    ('356','Illinois Fighting Illini','Illinois','ILL','Big Ten'), ('26','UCLA Bruins','UCLA','UCLA','Big Ten'),
    ('275','Wisconsin Badgers','Wisconsin','WIS','Big Ten'), ('84','Indiana Hoosiers','Indiana','IU','Big Ten'),
    ('130','Michigan Wolverines','Michigan','MICH','Big Ten'), ('194','Ohio State Buckeyes','Ohio State','OSU','Big Ten'),
    ('41','UConn Huskies','UConn','CONN','Big East'), ('269','Marquette Golden Eagles','Marquette','MARQ','Big East'),
    ('156','Creighton Bluejays','Creighton','CREI','Big East'), ('222','Villanova Wildcats','Villanova','VILL','Big East'),
    ('2599','St. John''s Red Storm','St. John''s','SJU','Big East'), ('2250','Gonzaga Bulldogs','Gonzaga','GONZ','WCC'),
    ('2608','Saint Mary''s Gaels','Saint Mary''s','SMC','WCC'), ('2483','Oregon Ducks','Oregon','ORE','Big Ten')
  ) as t(espn, name, short, abbr, conf)
  on conflict (sport, espn_id) do nothing;

  -- ---------- Games: 33 last week, 33 this week, 38 next week ----------
  -- Spread Monday–Sunday, tips between 11am and 9pm Central. espn_id 'demo-…' marks them.
  create temp table demo_games on commit drop as
  with t as (
    select id, row_number() over (order by espn_id::int) - 1 as idx, count(*) over () as n
    from teams where sport = 'ncaab' and espn_id in
      ('150','153','97','258','2305','248','239','66','2641','12','252','96','2','333','2633','57','8','251',
       '2509','127','356','26','275','84','130','194','41','269','156','222','2599','2250','2608','2483')
  ),
  slots as (
    select w, i,
           -- day 0–6 weighted toward Tue/Wed/Sat; hour 11–21
           v_monday + (w - 2) * interval '7 days'
             + ((array[0,0,0,1,1,1,1,1,1,2,2,2,2,2,2,3,3,3,4,4,5,5,5,5,5,5,5,5,5,6,6,6,6,5,5,6,6,6])[1 + i]) * interval '1 day'
             + (11 + (i * 7) % 11) * interval '1 hour' + ((i % 2) * 30) * interval '1 minute' as start_at
    from generate_series(1, 3) w, generate_series(0, 37) i
    where w = 3 or i < 33
  )
  select gen_random_uuid() as id, s.w, s.i, s.start_at,
         (select id from t where idx = (s.i * 7 + s.w) % 34) as home_id,
         (select id from t where idx = (s.i * 7 + s.w + 1 + (s.i % 13)) % 34) as away_id
  from slots s;

  insert into games (id, sport, season, home_team_id, away_team_id, start_at, status, home_score, away_score,
                     espn_id, tv_network, neutral_site, venue, home_rank, away_rank)
  select g.id, 'ncaab', 2026, g.home_id, g.away_id, g.start_at,
         -- Anything that has tipped is already final (no stuck "live" games).
         case when g.start_at < now() then 'final' else 'scheduled' end,
         case when g.start_at < now() then 62 + (g.i * 13 + g.w * 5) % 27 end,
         case when g.start_at < now() then 58 + (g.i * 17 + g.w * 3) % 29 end,
         'demo-' || g.w || '-' || g.i,
         (array['ESPN','CBS','FOX','ESPN2','FS1','Peacock',null,null])[1 + g.i % 8],
         g.i % 11 = 4, case when g.i % 11 = 4 then 'Las Vegas, NV' end,
         case when g.i % 4 = 0 then 1 + (g.i * 3) % 25 end,
         case when g.i % 6 = 1 then 1 + (g.i * 5) % 25 end
  from demo_games g;
  update games set home_score = home_score + 1 where espn_id like 'demo-%' and status = 'final' and home_score = away_score;

  -- ---------- Pool ----------
  insert into pools (id, name, slug, sport, season, commissioner_id, entry_fee, settings)
  values (v_pool, 'Hoops Sandbox (Demo)', 'hoops-demo', 'ncaab', 2026, v_me, 100, '{
    "pick_type": "straight_up", "picks_per_slate": 25, "picks_mode": "exact", "full_card": false,
    "confidence": {"tiers": [{"points":5,"count":5},{"points":4,"count":5},{"points":3,"count":5},{"points":2,"count":5},{"points":1,"count":5}],
                   "wrong_pick": "minus_points"},
    "scoring": {"win": 1, "push": 0, "loss": 0},
    "upset_bonus": {"tiers": [{"min_share":0.8,"bonus":1},{"min_share":0.9,"bonus":2},{"min_share":0.95,"bonus":3}]},
    "missed_week": "last_place", "segments": null,
    "lock": {"mode": "weekly", "weekly": {"weekday": 3, "time": "12:00"}},
    "timezone": "America/Chicago",
    "window": {"start_weekday": 1, "length_days": 7},
    "lines": {"bookmaker": "draftkings", "freeze_at": "publish", "force_half_point": false},
    "visibility": {"show_picks_after": "lock"}
  }');
  insert into pool_members (pool_id, user_id, role, paid, joined_at)
  values (v_pool, v_me, 'commissioner', true, now() - interval '30 days');
  insert into pool_members (pool_id, user_id, role, paid, joined_at)
  select v_pool, id, 'player', name not in ('Pete Kowalski', 'Sam Delgado'), now() - interval '30 days' from demo_people;
  insert into invites (pool_id) values (v_pool);

  -- ---------- Slates ----------
  insert into slates (id, pool_id, week, label, window_start, window_end, lock_at, status, published_at) values
    (v_w1, v_pool, 1, 'Week 1', v_monday - interval '7 days', v_monday - interval '1 second',
     v_monday - interval '7 days' + interval '2 days 12 hours', 'locked', v_monday - interval '9 days'),
    (v_w2, v_pool, 2, 'Week 2', v_monday, v_monday + interval '7 days' - interval '1 second',
     v_deadline, 'open', v_monday - interval '2 days');
  insert into slate_games (slate_id, game_id, sort_order)
  select case g.w when 1 then v_w1 else v_w2 end, g.id, g.i from demo_games g where g.w in (1, 2);
  perform refresh_slate_locks(v_w1);
  perform refresh_slate_locks(v_w2);

  -- ---------- Picks ----------
  -- Each player takes 25 of the 33 games, 5 at each confidence level, ~60% home teams.
  -- Week 1: everyone but Sam (missed week → last place). Week 2: eight fake players are in;
  -- Becca, Pete and Sam haven't submitted, and neither have you.
  create temp table demo_pickers on commit drop as
  select 1 as w, id from demo_people where name <> 'Sam Delgado'
  union all select 1, v_me
  union all select 2, id from demo_people where name not in ('Becca Hart', 'Pete Kowalski', 'Sam Delgado');

  insert into picks (slate_id, game_id, user_id, picked_side, confidence)
  select case r.w when 1 then v_w1 else v_w2 end, r.game_id, r.user_id,
         case when ('x' || substr(md5(r.user_id::text || r.game_id::text || 'side'), 1, 4))::bit(16)::int % 100 < 60
              then 'home' else 'away' end,
         5 - (r.rn - 1) / 5
  from (
    select p.w, p.id as user_id, g.id as game_id,
           row_number() over (partition by p.w, p.id order by md5(p.id::text || g.id::text)) as rn
    from demo_pickers p join demo_games g on g.w = p.w
  ) r
  where r.rn <= 25;

  -- One Week 1 upset so the bonus shows: on the first game, the whole pool but one player
  -- takes the home team, and the road team wins.
  update picks set picked_side = 'home'
  where slate_id = v_w1 and game_id = (select id from demo_games where w = 1 and i = 0);
  update picks set picked_side = 'away'
  where id = (select id from picks where slate_id = v_w1 and game_id = (select id from demo_games where w = 1 and i = 0)
              order by confidence, user_id limit 1);
  update games set home_score = 64, away_score = 73 where id = (select id from demo_games where w = 1 and i = 0);

  -- A welcome post on the Message Board, pinned.
  insert into board_posts (pool_id, author_id, title, body, pinned)
  values (v_pool, v_me, 'Welcome to the demo',
          'This is a practice pool with fake players. Make Week 2 picks, then enter scores in Admin → Results to see standings move.',
          true);

  perform grade_slate(v_w1);
  perform grade_slate(v_w2);
  raise notice 'Demo ready: /p/hoops-demo';
end $$;

commit;
