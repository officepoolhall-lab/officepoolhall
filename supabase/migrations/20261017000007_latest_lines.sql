-- Most recent line per game per bookmaker (for the slate editor's "current line" column).
create view latest_game_lines with (security_invoker = true) as
  select distinct on (game_id, bookmaker) id, game_id, bookmaker, home_spread, home_moneyline, away_moneyline, captured_at
  from game_lines
  order by game_id, bookmaker, captured_at desc;
