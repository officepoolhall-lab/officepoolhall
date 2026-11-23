-- Playoff Fantasy: each player's place on his team's depth chart at his position (1 = the
-- starter), from ESPN when the players load. Null when ESPN doesn't list him. The lineup
-- builder lists starters first; demo lineups use it to pick team leaders.
alter table pf_players add column if not exists depth int;
