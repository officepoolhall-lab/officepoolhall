-- Adds 24 more fake players to an EXISTING Hoops Sandbox demo, for 35 in all.
-- (Building it fresh with create-ncaab-demo-pool.sql already includes all 35.)
-- Each new player gets a full Week 1 card (graded) and a Week 2 card, except Drew and Molly,
-- who haven't submitted Week 2. Kelsey and Zach are marked unpaid.
-- Paste into Supabase → SQL Editor → Run. Running it again adds nobody twice.
begin;

do $$
declare
  v_pool uuid;
  v_w1 uuid;
  v_w2 uuid;
begin
  select id into v_pool from pools where slug = 'hoops-demo';
  if v_pool is null then raise exception 'No demo pool yet. Run create-ncaab-demo-pool.sql instead.'; end if;
  select id into v_w1 from slates where pool_id = v_pool and week = 1;
  select id into v_w2 from slates where pool_id = v_pool and week = 2;

  create temp table new_people (id uuid, email text, name text) on commit drop;
  insert into new_people
  select gen_random_uuid(), 'demo.' || lower(split_part(n, ' ', 1)) || '@example.com', n
  from unnest(array['Greg Thompson','Nina Patel','Ryan Fisher','Olivia Grant','Marcus Bell','Hannah Lee',
                    'Tyler Jensen','Megan Cole','Derek Shaw','Priya Raman','Josh Whitaker','Allie Carter',
                    'Brandon Moss','Kelsey Ford','Luis Ortega','Jenna Park','Matt Hughes','Rachel Kim',
                    'Drew Collins','Sophie Lane','Andre Wallace','Katie Nolan','Zach Rivera','Molly Burke']) n;
  delete from new_people n where exists (select 1 from auth.users u where u.email = n.email);

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
         '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', name),
         now(), now(), '', '', '', ''
  from new_people;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
         now(), now(), now()
  from new_people;

  insert into pool_members (pool_id, user_id, role, paid, joined_at)
  select v_pool, id, 'player', name not in ('Zach Rivera', 'Kelsey Ford'), now() - interval '30 days' from new_people;

  -- 25 of the week's games each, 5 at each confidence level, ~60% home teams.
  insert into picks (slate_id, game_id, user_id, picked_side, confidence)
  select r.slate_id, r.game_id, r.user_id,
         case when ('x' || substr(md5(r.user_id::text || r.game_id::text || 'side'), 1, 4))::bit(16)::int % 100 < 60
              then 'home' else 'away' end,
         5 - (r.rn - 1) / 5
  from (
    select sg.slate_id, n.id as user_id, sg.game_id,
           row_number() over (partition by sg.slate_id, n.id order by md5(n.id::text || sg.game_id::text)) as rn
    from new_people n
    join slate_games sg on sg.slate_id = v_w1
                        or (sg.slate_id = v_w2 and n.name not in ('Drew Collins', 'Molly Burke'))
  ) r
  where r.rn <= 25;

  perform grade_slate(v_w1);
  perform grade_slate(v_w2);
  raise notice 'Added % players', (select count(*) from new_people);
end $$;

commit;
