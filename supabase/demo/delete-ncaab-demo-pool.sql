-- Removes everything create-ncaab-demo-pool.sql made: the Hoops Sandbox pool, its weeks and
-- picks, the fake @example.com players and the 'demo-…' games. Teams stay (they're real).
-- Paste into Supabase → SQL Editor → Run.
begin;

delete from pools where slug = 'hoops-demo';   -- weeks, picks, members, invites, posts go with it
delete from audit_log where actor_id in (select id from auth.users where email like 'demo.%@example.com');
delete from games where espn_id like 'demo-%' and not exists (select 1 from slate_games sg where sg.game_id = games.id);
delete from auth.users where email like 'demo.%@example.com'; -- their profiles go with them

commit;
