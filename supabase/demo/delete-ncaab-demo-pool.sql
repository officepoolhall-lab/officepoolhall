-- Removes the Hoops Sandbox demo completely: the pool (its weeks, picks, tournaments, bracket,
-- Message Board posts, roster), the fake @example.com players, and every made-up 'demo-…' game,
-- including any that ended up on another pool's slate. Real teams it added stay (they're real
-- schools that the ESPN schedule uses anyway).
-- Paste into Supabase → SQL Editor → Run. Safe to run again.
begin;

do $$
declare
  v_pools int;
  v_users int;
  v_games int;
  v_elsewhere int;
begin
  delete from pools where slug = 'hoops-demo';
  get diagnostics v_pools = row_count;

  -- A made-up game added to a real pool's slate comes off it (with any picks on it).
  delete from slate_games where game_id in (select id from games where espn_id like 'demo-%');
  get diagnostics v_elsewhere = row_count;
  delete from games where espn_id like 'demo-%';
  get diagnostics v_games = row_count;

  delete from audit_log where actor_id in (select id from auth.users where email like 'demo.%@example.com');
  delete from auth.users where email like 'demo.%@example.com';   -- their profiles go with them
  get diagnostics v_users = row_count;

  raise notice 'Removed % demo pool, % fake players, % demo games (% were on another pool''s slate).',
    v_pools, v_users, v_games, v_elsewhere;
end $$;

commit;
