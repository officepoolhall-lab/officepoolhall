-- Hoops Sandbox demo: an NCAA Tournament bracket to try out.
-- Run AFTER apply-db-update-bracket.sql. Paste into Supabase → SQL Editor → Run.
-- Running it again starts the demo bracket over.
--
--   * A 64-team field in four regions (real teams; seeds made up), in Week 2.
--   * Brackets lock in two days, so you can fill yours out at My Picks → the bracket card.
--   * Every fake player has filled out a full bracket (mostly favorites, some upsets).
-- When you've filled yours out, run demo-bracket-play.sql to lock brackets and play the
-- First and Second Rounds, so you can see scoring, Standings → Bracket and others' brackets.
begin;

do $$
declare
  v_pool uuid;
  v_me uuid;
  v_id uuid;
  v_ids uuid[];
  v_member uuid;
  v_picks jsonb;
  v_r int;
  v_g int;
  v_a text;
  v_b text;
  v_sa int;
  v_sb int;
begin
  select id into v_pool from pools where slug = 'hoops-demo';
  if v_pool is null then raise exception 'No demo pool yet. Run create-ncaab-demo-pool.sql first.'; end if;
  if to_regclass('public.brackets') is null then raise exception 'Run apply-db-update-bracket.sql first.'; end if;
  select id into v_me from auth.users where lower(email) = 'cross.brooks.a@gmail.com';
  delete from brackets where pool_id = v_pool;

  -- 30 more real teams (ESPN ids), so there are 64.
  insert into teams (sport, espn_id, name, short_name, abbreviation, odds_api_name, logo_url)
  select 'ncaab', t.espn, t.name, t.short, t.abbr, t.name, 'https://a.espncdn.com/i/teamlogos/ncaa/500/' || t.espn || '.png'
  from (values
    ('2752','Xavier Musketeers','Xavier','XAV'), ('2132','Cincinnati Bearcats','Cincinnati','CIN'),
    ('2306','Kansas State Wildcats','Kansas State','KSU'), ('201','Oklahoma Sooners','Oklahoma','OU'),
    ('2628','TCU Horned Frogs','TCU','TCU'), ('277','West Virginia Mountaineers','West Virginia','WVU'),
    ('245','Texas A&M Aggies','Texas A&M','TA&M'), ('99','LSU Tigers','LSU','LSU'),
    ('145','Ole Miss Rebels','Ole Miss','MISS'), ('344','Mississippi State Bulldogs','Mississippi State','MSST'),
    ('142','Missouri Tigers','Missouri','MIZ'), ('61','Georgia Bulldogs','Georgia','UGA'),
    ('2579','South Carolina Gamecocks','South Carolina','SC'), ('2294','Iowa Hawkeyes','Iowa','IOWA'),
    ('158','Nebraska Cornhuskers','Nebraska','NEB'), ('120','Maryland Terrapins','Maryland','MD'),
    ('164','Rutgers Scarlet Knights','Rutgers','RUTG'), ('152','NC State Wolfpack','NC State','NCSU'),
    ('154','Wake Forest Demon Deacons','Wake Forest','WAKE'), ('183','Syracuse Orange','Syracuse','SYR'),
    ('87','Notre Dame Fighting Irish','Notre Dame','ND'), ('2550','Seton Hall Pirates','Seton Hall','HALL'),
    ('2507','Providence Friars','Providence','PROV'), ('2086','Butler Bulldogs','Butler','BUT'),
    ('21','San Diego State Aztecs','San Diego State','SDSU'), ('328','Utah State Aggies','Utah State','USU'),
    ('235','Memphis Tigers','Memphis','MEM'), ('2168','Dayton Flyers','Dayton','DAY'),
    ('2670','VCU Rams','VCU','VCU'), ('36','Colorado State Rams','Colorado State','CSU')
  ) as t(espn, name, short, abbr)
  on conflict (sport, espn_id) do nothing;

  -- 64 teams in a made-up seeding; slot order is region by region, bracket order.
  select array_agg(id order by n) into v_ids from (
    select id, row_number() over (order by md5(id::text || 'seed')) as n
    from teams where sport = 'ncaab' and espn_id is not null
    order by md5(id::text || 'seed') limit 64
  ) x;
  if array_length(v_ids, 1) < 64 then raise exception 'Need 64 basketball teams; found %', array_length(v_ids, 1); end if;

  insert into brackets (pool_id, name, week, lock_at, regions)
  values (v_pool, 'NCAA Tournament (Demo)', 2, now() + interval '2 days', array['East', 'West', 'South', 'Midwest'])
  returning id into v_id;
  insert into bracket_results (bracket_id) values (v_id);
  insert into bracket_teams (bracket_id, slot, team_id)
  select v_id, (o - 1)::smallint, t from unnest(v_ids) with ordinality x(t, o);

  -- Every fake player fills out a full bracket: the better seed usually, an upset now and then.
  for v_member in select user_id from pool_members where pool_id = v_pool and user_id <> coalesce(v_me, '00000000-0000-0000-0000-000000000000') loop
    v_picks := '{}';
    for v_r in 1..6 loop
      for v_g in 0..(32 >> (v_r - 1)) - 1 loop
        if v_r = 1 then
          select team_id::text into v_a from bracket_teams where bracket_id = v_id and slot = 2 * v_g;
          select team_id::text into v_b from bracket_teams where bracket_id = v_id and slot = 2 * v_g + 1;
        else
          v_a := v_picks ->> ((v_r - 1) || '-' || (2 * v_g));
          v_b := v_picks ->> ((v_r - 1) || '-' || (2 * v_g + 1));
        end if;
        select bracket_seed(slot) into v_sa from bracket_teams where bracket_id = v_id and team_id::text = v_a;
        select bracket_seed(slot) into v_sb from bracket_teams where bracket_id = v_id and team_id::text = v_b;
        -- Chance the worse seed wins grows with how close the seeds are.
        v_picks := v_picks || jsonb_build_object(v_r || '-' || v_g,
          case when (('x' || substr(md5(v_member::text || v_r || '-' || v_g), 1, 4))::bit(16)::int % 100)
                    < 50 - 3 * abs(v_sa - v_sb)
               then (case when v_sa < v_sb then v_b else v_a end)
               else (case when v_sa < v_sb then v_a else v_b end) end);
      end loop;
    end loop;
    insert into bracket_entries (bracket_id, user_id, picks) values (v_id, v_member, v_picks);
  end loop;

  raise notice 'Demo bracket ready: fill yours out from My Picks (Week 2) or /p/hoops-demo/bracket.';
end $$;

commit;
