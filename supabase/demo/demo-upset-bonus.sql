-- Hoops Sandbox demo: give YOU an upset bonus in Week 2, so you can see it on My Picks.
-- Run AFTER you've saved your Week 2 picks. Paste into Supabase → SQL Editor → Run.
--
-- It takes your lowest-confidence Week 2 pick (one that hasn't tipped yet, if there is one),
-- moves every other player's pick on that game to the other team, then makes the game final
-- with YOUR team winning. You end up the lone pick on the winner, so you earn the top upset
-- bonus, and the game moves to earlier today. Re-running it does the same to another game.
begin;

do $$
declare
  v_me uuid;
  v_slate uuid;
  v_game uuid;
  v_side text;
  v_conf int;
  v_bonus numeric;
begin
  select id into v_me from auth.users where lower(email) = 'cross.brooks.a@gmail.com';
  select s.id into v_slate from slates s join pools p on p.id = s.pool_id where p.slug = 'hoops-demo' and s.week = 2;
  if v_slate is null then raise exception 'No demo pool yet. Run create-ncaab-demo-pool.sql first.'; end if;

  select pk.game_id, pk.picked_side, pk.confidence into v_game, v_side, v_conf
  from picks pk join games g on g.id = pk.game_id
  where pk.slate_id = v_slate and pk.user_id = v_me and g.status <> 'final'
  order by (g.start_at < now()), pk.confidence, g.start_at
  limit 1;
  if v_game is null then
    raise exception 'Save your Week 2 picks on My Picks first (you need at least one pick on a game that isn''t final).';
  end if;

  -- Everyone else who picked this game now has the other team.
  update picks set picked_side = case when v_side = 'home' then 'away' else 'home' end
  where slate_id = v_slate and game_id = v_game and user_id <> v_me;

  -- Your team wins, earlier today.
  update games
  set start_at = least(start_at, now() - interval '3 hours'),
      status = 'final',
      home_score = case when v_side = 'home' then 78 else 66 end,
      away_score = case when v_side = 'home' then 66 else 78 end
  where id = v_game;
  update slate_games set override_home_score = null, override_away_score = null
  where slate_id = v_slate and game_id = v_game;

  perform grade_slate(v_slate);

  select bonus into v_bonus from picks where slate_id = v_slate and game_id = v_game and user_id = v_me;
  raise notice 'Done: your %-point pick won with an upset bonus of +%. Refresh My Picks.', v_conf, coalesce(v_bonus, 0);
end $$;

commit;
