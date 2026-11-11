-- What a week with no pick earns, set by the commissioner (pools.settings.missed_pick):
--   'zero' (default): $0.
--   'lowest': the lowest prize money any entry that did pick earned that week (often $0 when
--   someone's golfer missed the cut). A week where nobody picked earns $0.
-- Only final events count, as before.
create or replace function golf_standings(p_pool_id uuid)
returns table (user_id uuid, display_name text, season_earnings numeric, events_picked int)
language sql stable security definer set search_path = public as $$
  with rule as (
    select coalesce(settings->>'missed_pick', 'zero') as missed from pools where id = p_pool_id
  ),
  finals as (
    select id from golf_events where pool_id = p_pool_id and status = 'final'
  ),
  earned as (
    select p.user_id, p.event_id, coalesce(r.earnings, 0) as amount
    from golf_picks p
    join finals f on f.id = p.event_id
    left join golf_results r on r.event_id = p.event_id and r.espn_golfer_id = p.espn_golfer_id
    where p.pool_id = p_pool_id
  ),
  lowest as (
    select event_id, min(amount) as amount from earned group by event_id
  )
  select pm.user_id,
         pr.display_name,
         (coalesce((select sum(e.amount) from earned e where e.user_id = pm.user_id), 0)
          + case when (select missed from rule) = 'lowest'
                 then coalesce((select sum(l.amount) from lowest l
                                where not exists (select 1 from earned e where e.user_id = pm.user_id and e.event_id = l.event_id)), 0)
                 else 0 end)::numeric,
         (select count(*) from golf_picks gp where gp.pool_id = p_pool_id and gp.user_id = pm.user_id)::int
  from pool_members pm
  join profiles pr on pr.id = pm.user_id
  where pm.pool_id = p_pool_id and is_pool_member(p_pool_id)
  order by 3 desc, 2
$$;
