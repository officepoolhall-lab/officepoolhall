-- Hoops Sandbox demo: two tournament champion picks, to try the feature.
-- Run AFTER apply-db-update-tournaments.sql (the feature's database update).
-- Paste into Supabase → SQL Editor → Run. Running it again replaces both.
--
--   * "Maui Invitational (Demo)" in Week 1: locked, played and scored (champion 5, runner-up 3,
--     3rd-place game 2/1). Every fake player picked; YOU picked the champion.
--   * "Players Era 8 (Demo)" in Week 2: open until this week's Wednesday noon deadline, so you
--     can make your pick on My Picks. Most fake players have picked already.
-- See them on My Picks (Week 2), Standings → Tournament Champions, Pick History, and
-- Admin → Tournaments (where you enter results).
begin;

do $$
declare
  v_pool uuid;
  v_me uuid;
  v_w2_lock timestamptz;
  v_maui uuid;
  v_pe8 uuid;
  v_maui_field uuid[];
  v_pe8_field uuid[];
begin
  select id into v_pool from pools where slug = 'hoops-demo';
  if v_pool is null then raise exception 'No demo pool yet. Run create-ncaab-demo-pool.sql first.'; end if;
  if to_regclass('public.tournaments') is null then
    raise exception 'Run apply-db-update-tournaments.sql first.';
  end if;
  select id into v_me from auth.users where lower(email) = 'cross.brooks.a@gmail.com';
  select lock_at into v_w2_lock from slates where pool_id = v_pool and week = 2;

  delete from tournaments where pool_id = v_pool and name in ('Maui Invitational (Demo)', 'Players Era 8 (Demo)');

  select array_agg(id order by espn_id) into v_maui_field from teams
  where sport = 'ncaab' and espn_id in ('252', '12', '2', '96', '2250', '2509', '41', '248');   -- BYU, Arizona, Auburn, Kentucky, Gonzaga, Purdue, UConn, Houston
  select array_agg(id order by espn_id) into v_pe8_field from teams
  where sport = 'ncaab' and espn_id in ('2305', '150', '57', '356', '2633', '26', '127', '153'); -- Kansas, Duke, Florida, Illinois, Tennessee, UCLA, Michigan State, UNC

  insert into tournaments (pool_id, name, week, lock_at, scoring)
  values (v_pool, 'Maui Invitational (Demo)', 1, (select window_start from slates where pool_id = v_pool and week = 1) + interval '10 hours', 'third_place')
  returning id into v_maui;
  insert into tournaments (pool_id, name, week, lock_at, scoring)
  values (v_pool, 'Players Era 8 (Demo)', 2, v_w2_lock, 'third_place')
  returning id into v_pe8;
  insert into tournament_teams (tournament_id, team_id) select v_maui, unnest(v_maui_field);
  insert into tournament_teams (tournament_id, team_id) select v_pe8, unnest(v_pe8_field);

  -- Everyone picks Maui (spread across the field); you pick the eventual champion, Gonzaga.
  insert into tournament_picks (tournament_id, user_id, team_id)
  select v_maui, m.user_id,
         case when m.user_id = v_me then (select id from teams where sport = 'ncaab' and espn_id = '2250')
              else v_maui_field[1 + (('x' || substr(md5(m.user_id::text || 'maui'), 1, 4))::bit(16)::int % 8)] end
  from pool_members m where m.pool_id = v_pool;

  -- Maui results: Gonzaga champion, Houston runner-up, UConn won the 3rd-place game, Purdue lost it.
  update tournament_teams tt set placement = r.place
  from (values ('2250', 'champion'), ('248', 'runner_up'), ('41', 'third'), ('2509', 'fourth')) as r(espn, place)
  join teams t on t.sport = 'ncaab' and t.espn_id = r.espn
  where tt.tournament_id = v_maui and tt.team_id = t.id;
  perform grade_tournament(v_maui);

  -- Players Era 8: most fake players have picked; you haven't.
  insert into tournament_picks (tournament_id, user_id, team_id)
  select v_pe8, m.user_id, v_pe8_field[1 + (('x' || substr(md5(m.user_id::text || 'pe8'), 1, 4))::bit(16)::int % 8)]
  from pool_members m
  where m.pool_id = v_pool and m.user_id <> v_me and ('x' || substr(md5(m.user_id::text), 1, 2))::bit(8)::int % 5 <> 0;

  raise notice 'Demo tournaments ready: Maui (Week 1, scored) and Players Era 8 (Week 2, open).';
end $$;

commit;
