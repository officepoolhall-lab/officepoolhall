-- NFL pools (the Supercontest and every other football format), alongside college football,
-- college basketball and golf. Games, teams and lines come from the same ESPN and Odds API
-- imports; sport 'nfl'.
alter table pools drop constraint if exists pools_sport_check;
alter table pools add constraint pools_sport_check check (sport in ('ncaab','ncaaf','nfl','pga'));
alter table teams drop constraint if exists teams_sport_check;
alter table teams add constraint teams_sport_check check (sport in ('ncaab','ncaaf','nfl'));
alter table team_match_queue drop constraint if exists team_match_queue_sport_check;
alter table team_match_queue add constraint team_match_queue_sport_check check (sport in ('ncaab','ncaaf','nfl'));
alter table games drop constraint if exists games_sport_check;
alter table games add constraint games_sport_check check (sport in ('ncaab','ncaaf','nfl'));
alter table odds_pulls drop constraint if exists odds_pulls_sport_check;
alter table odds_pulls add constraint odds_pulls_sport_check check (sport in ('ncaab','ncaaf','nfl'));
