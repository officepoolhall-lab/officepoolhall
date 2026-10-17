# NCAA Supercontest history import

One-off importer that moves Brooks's 2026 NCAA Supercontest workbook (pick 5 games ATS each
week, 1 point per cover, half-point lines so no pushes) into the `2026-ncaa-supercontest` pool:
the roster as members (pre-created accounts, no email sent), Brooks and Noah as
commissioners, the segment split (weeks 1–5, 6–10, 11–end), and one graded slate per
completed week with the sheet's own lines and picks.

| File | Does |
|---|---|
| `parse.py` | Workbook → JSON. Validates every matchup, outcome, cover cell, pick and weekly record; exits 1 with a list of problems. |
| `build.mjs` | JSON → one idempotent SQL statement. Matches each sheet game to exactly one final ESPN event (both teams and the score must agree), converts spreads to `locked_home_spread` and picks to home/away, and checks every cover against the sheet. With `--partial N --lock-at <ISO>`, week N is imported in progress (see below). |
| `verify.mjs` | Compares per-week, season and segment W-L in the database with the sheet (and the Standings tab), plus membership, paid flags, commissioners and the segments setting. An in-progress week is compared on its decided games. |

## Privacy

The workbook and everything derived from it (`parsed.json`, `import.sql`, `report.json`) hold
real names and emails. Keep them **outside the repo** (e.g. your scratchpad or `~/Downloads`);
only this code lives here. `verify.mjs` prints names, never emails.

## Requirements

- Python 3 with `openpyxl` in a throwaway venv (`python -m venv /tmp/xlenv && /tmp/xlenv/bin/pip install openpyxl`). Run it with `-I`.
- Node 22+ (`build.mjs` uses `fetch`; no npm packages). Network access to `site.api.espn.com`.
- `psql` for the local run and for `verify.mjs`.

## Run locally

```sh
D=scripts/import/supercontest
OUT=/path/outside/repo           # data directory
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres

/tmp/xlenv/bin/python -I $D/parse.py ~/Downloads/supercontest.xlsx $OUT/parsed.json --weeks 1-6
node $D/build.mjs $OUT/parsed.json --pool-slug 2026-ncaa-supercontest --season 2026 \
  --reserve-weeks 7 --out $OUT/import.sql --report $OUT/report.json

psql $DB -v ON_ERROR_STOP=1 -f $OUT/local-setup.sql   # local only: creates the pool (see below)
psql $DB -v ON_ERROR_STOP=1 -f $OUT/import.sql
node $D/verify.mjs $OUT/parsed.json --db $DB --pool-slug 2026-ncaa-supercontest --report $OUT/report.json
```

Locally the pool doesn't exist, so `local-setup.sql` (kept with the data, not here) creates
`2026-ncaa-supercontest` owned by the seeded `brooks@example.com` with the `ncaaf_ats` preset
and `force_half_point: true`. The roster emails don't exist locally either, so the import
creates them.

## Run against production

The pool must already exist (Brooks created `2026-ncaa-supercontest` in the app). The import
raises before touching anything if it doesn't, if it isn't an ncaaf ATS pool for 2026, or if
its scoring rules aren't the sheet's: `picks_per_slate` 5, `scoring.win` 1 and `scoring.loss` 0,
`confidence` and `upset_bonus` null, `missed_week` zero. Check them in the app first: once a
non-draft slate exists, `guard_pool_settings` freezes most of these, so fix them before importing.

To rehearse without committing, wrap it in a transaction and look before rolling back:
`psql "<production url>" -v ON_ERROR_STOP=1 -c 'begin' -f $OUT/import.sql -c '<checks>' -c 'rollback'`
(or `begin; \i import.sql; ...; rollback;` interactively).

```sh
npx supabase db query --linked -f $OUT/import.sql
node $D/verify.mjs $OUT/parsed.json --db "<production connection string>" --pool-slug 2026-ncaa-supercontest --report $OUT/report.json
```

The SQL is a single `do` block, so it is all-or-nothing under any client. It only touches:
teams and games (through `ingest_espn`), the roster's `auth.users`/`auth.identities` (inserted
only when the email has no account) and their `profiles.display_name`, and the target pool's
members, settings (`segments` key only), slates, slate games and picks.

## Week numbers: reserve week 7

The app numbers a new slate `max(week) + 1`. After importing weeks 1–6, the slate Brooks
creates for next week's picks (sheet week 8) would become week 7, and segment boundaries
(6–10, 11–end) would be off by one. `--reserve-weeks 7` creates an empty draft labelled
`Week 7 (pending sheet import)` (players don't see drafts) so the next in-app slate is week 8.
Brooks should leave that draft alone (no games, don't delete it); the week-7 re-import fills it.

The import fails closed if an imported or reserved week number is taken by a slate it didn't
create: an in-app draft other than the untouched placeholder, any non-draft slate at a reserved
week, or a non-draft slate with games that aren't that sheet week's. Nothing is overwritten.

## Tomorrow: importing an in-progress week

Brooks's week 7 picks lock Saturday Oct 17, 2026 at 11:00 AM Central. Once he sends the sheet
with every player's picks (outcomes only for games already played), import week 7 as an
in-progress week. Use `--partial 7` on both scripts and a `--lock-at` with an explicit offset
(Central daylight time is `-05:00`); do **not** pass `--reserve-weeks 7`:

```sh
D=scripts/import/supercontest
OUT=/path/outside/repo

# Chained, and old outputs removed first: a failed parse/build writes nothing, so a stale
# import.sql from an earlier run must never be the one that gets applied.
rm -f $OUT/parsed.json $OUT/import.sql $OUT/report.json &&
/tmp/xlenv/bin/python -I $D/parse.py <new.xlsx> $OUT/parsed.json --weeks 1-7 --partial 7 &&
node $D/build.mjs $OUT/parsed.json --pool-slug 2026-ncaa-supercontest --season 2026 \
  --partial 7 --lock-at '2026-10-17T11:00:00-05:00' --out $OUT/import.sql --report $OUT/report.json &&
npx supabase db query --linked -f $OUT/import.sql &&
node $D/verify.mjs $OUT/parsed.json --db linked --pool-slug 2026-ncaa-supercontest --report $OUT/report.json
```

What `--partial 7` changes for week 7 (weeks 1–6 are re-imported exactly as before):

- **Sheet.** A game with neither an outcome nor a cover cell is *undecided*. A game with only
  one of the two is still an error, and so is everything the parser normally rejects. Each
  entry's "Week 7 Record" must match its picks on the decided games.
- **ESPN.** Decided games must still match a final ESPN score exactly. Undecided games match on
  both teams alone and keep ESPN's live status, start time and score (scheduled, in progress or
  final). An undecided game that ESPN already shows final is fine (the sheet is just behind);
  the build lists those. A postponed or cancelled game stops the build: ask Brooks how it
  counts, then add `--allow-postponed` to the build to import it with ESPN's status (a cancelled
  game is voided by the grader; a postponed one stays ungraded, keeping the slate `locked`,
  until ESPN finishes it or Brooks voids it in the app).
- **Locking.** The week 7 slate is imported `locked` with `lock_at` = `--lock-at`, and every
  week 7 game gets the same `slate_games.lock_at`, so nobody can pick or change picks in the app
  (`submit_picks` needs an open slate; effective lock is `least(kickoff, lock_at)`).
  `close_slates` only looks at open slates and `refresh_slate_locks` only runs for open slates
  in weekly mode (this pool is per-game), so nothing reopens or moves it. Players can see
  everyone's week 7 picks once it's imported (a locked slate shows all picks).
- **Grading.** Every pick is imported (the week's picks are replaced, as for history; the
  first-5-by-kickoff rule still applies). Final games are graded at import; the rest stay
  ungraded. `games_to_poll()` returns them from 10 minutes before kickoff, the `poll-scores`
  cron grades each as ESPN marks it final, and the slate moves to `graded` after the last one.
- **Ownership.** The importer's empty `Week 7 (pending sheet import)` draft becomes week 7.
  Re-running the partial import (e.g. with a corrected sheet) is safe: the locked week 7 slate
  only has this sheet's games, so it is replaced in place and regraded. A re-run resets week 7
  games to ESPN's current status/scores and clears any void or result override made in the app,
  so **don't re-run it after Brooks voids or overrides a week 7 game**.
- **verify.** Week 7 is compared on the sheet's decided games only (that's also what the
  Standings tab counts), and it prints how many week 7 games/picks the app has graded or still
  has pending. It needs `--report` from the same build.

If the import runs before 11:00, the build warns that the deadline is in the future; the slate
is locked regardless, so nobody can pick after the sheet's picks are loaded.

## After week 7 finishes

Once every week 7 outcome is in the sheet, download it again and re-run without `--partial`
(and without `--lock-at`). Week 7 ends `graded` with the sheet's results; anything the poller
graded is regraded from the same scores. This only works once ESPN shows **every** week 7 game
final (the last kickoff is about 10 PM Central Saturday), so run it late Saturday night or
Sunday; before that the build fails with "ESPN shows in_progress/scheduled; wait until it is
final" and writes nothing. It isn't required for the app: the poller grades week 7 on its own.

```sh
rm -f $OUT/parsed.json $OUT/import.sql $OUT/report.json &&
/tmp/xlenv/bin/python -I $D/parse.py <new.xlsx> $OUT/parsed.json --weeks 1-7 &&
node $D/build.mjs $OUT/parsed.json --pool-slug 2026-ncaa-supercontest --season 2026 --out $OUT/import.sql --report $OUT/report.json &&
npx supabase db query --linked -f $OUT/import.sql &&
node $D/verify.mjs $OUT/parsed.json --db linked --pool-slug 2026-ncaa-supercontest --report $OUT/report.json
```

Re-running is safe: accounts and members aren't duplicated, a member marked paid in the app is
never un-marked (the sheet can only add paid flags), and display names are set only on accounts
the import created or that still have the default name (the email's local part); a name
someone chose stays, since profiles are shared by every pool. Each imported week's slate is updated in place with its picks deleted and
re-inserted from the sheet, then regraded. Anything changed in the app on those weeks
(result overrides, voids, edited spreads) is reset to the sheet. Weeks not in `--weeks` are
left alone, and the week-number guard above refuses to overwrite a slate the app created.

Without `--partial`, `parse.py` refuses a week whose outcomes aren't all filled in.

## Sheet conventions the parser relies on

- `Week N` row 2: `Team -6.5 vs Other` — the spread belongs to the team it follows; `#NN` is the AP rank.
- Row 3: `<winner> <w>-<l>` (winner may be shortened or misspelled; matched to the closer team).
- Row 4: the covering side with its spread. Rows 6+: entry name, `W-L`, one pick per game column.
- The two footer rows count winning and losing picks per game (checked as a warning).
- Roster `Payment Received = Yes` → paid.

## Team-name matching

Names are normalized (case, accents, punctuation, `St` → `State`, `&` → `and`) and compared with
ESPN's display name, short name, location and abbreviation. `ALIASES` in `build.mjs` covers the
rest (Miami (FL), FAU, Cal, UConn, Southern Miss, NDSU, …). A game that doesn't match ESPN week
N is retried in weeks N−1 and N+1, then without the FBS filter; unmatched or ambiguous games
fail the build. Add an alias and re-run.
