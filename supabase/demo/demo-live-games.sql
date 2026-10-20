-- Hoops Sandbox demo: make two Week 2 games LIVE right now, to see the score ticker,
-- My Picks and the League Grid mid-game. Paste into Supabase → SQL Editor → Run.
--
-- It takes the two best-ranked Week 2 games that haven't tipped, moves their tip to about an
-- hour ago, and gives them second-half scores and a TV channel. They stay "live" until you
-- enter a final score in Admin → Results (or run delete-ncaab-demo-pool.sql).
-- Note: a game that tips becomes locked, so make any picks you want on them first.
begin;

do $$
declare
  v_slate uuid;
  v_n int;
begin
  select s.id into v_slate from slates s join pools p on p.id = s.pool_id where p.slug = 'hoops-demo' and s.week = 2;
  if v_slate is null then raise exception 'No demo pool yet. Run create-ncaab-demo-pool.sql first.'; end if;

  with pick as (
    select g.id, row_number() over (order by least(coalesce(g.home_rank, 99), coalesce(g.away_rank, 99)), g.start_at) as n
    from slate_games sg join games g on g.id = sg.game_id
    where sg.slate_id = v_slate and not sg.voided and g.status = 'scheduled' and g.start_at > now()
    order by n
    limit 2
  )
  update games g
  set status = 'in_progress',
      start_at = now() - case when p.n = 1 then interval '70 minutes' else interval '40 minutes' end,
      home_score = case when p.n = 1 then 58 else 31 end,
      away_score = case when p.n = 1 then 61 else 27 end,
      tv_network = coalesce(g.tv_network, case when p.n = 1 then 'ESPN' else 'CBS' end)
  from pick p
  where g.id = p.id;
  get diagnostics v_n = row_count;
  raise notice '% games are live. Open Home or My Picks in the demo pool.', v_n;
end $$;

commit;
