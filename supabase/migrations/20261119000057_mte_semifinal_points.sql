-- In-season tournaments scored by semifinals (no 3rd-place game) pay more:
--   Champion 7 · Runner-up 5 · each semifinal loser 2   (was 5 · 3 · 1.5).
-- Third-place-game and conference (champion only) scoring are unchanged.

create or replace function tournament_place_points(p_scoring text, p_placement text) returns numeric
language sql immutable as $$
  select case
    when p_placement is null or not (p_placement = any (tournament_places(p_scoring))) then 0
    when p_scoring = 'semifinals' then
      case p_placement when 'champion' then 7 when 'runner_up' then 5 when 'semifinal' then 2 else 0 end
    when p_placement = 'champion' then 5
    when p_placement = 'runner_up' then 3
    when p_placement = 'third' then 2
    when p_placement = 'fourth' then 1
    else 0
  end;
$$;

-- Re-score tournaments already using it (and the weeks they count toward).
do $$
declare v uuid;
begin
  for v in select id from tournaments where scoring = 'semifinals' loop
    perform grade_tournament(v);
  end loop;
end $$;
