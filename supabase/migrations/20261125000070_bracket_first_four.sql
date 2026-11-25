-- The First Four (the NCAA Tournament's play-in games) on a pool's bracket, so the live bracket
-- can show them even when ESPN's scoreboard can't be read: each game's First Round slot (the
-- spot its winner takes), its two teams and, once played, the winner.
--   [{ "slot": 15, "teams": ["<team id>", "<team id>"], "winner": "<team id>" | null }]
alter table brackets add column if not exists first_four jsonb not null default '[]'::jsonb;
