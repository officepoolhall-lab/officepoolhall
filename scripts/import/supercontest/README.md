# NCAA Supercontest history import

One-off importer that moves Brooks's 2026 NCAA Supercontest workbook (pick 5 games ATS each
week, 1 point per cover, half-point lines so no pushes) into the `2026-ncaa-supercontest` pool:
the roster as members (pre-created accounts, no email sent), Brooks and Noah as
commissioners, the segment split (weeks 1–5, 6–10, 11–end), and one graded slate per
completed week with the sheet's own lines and picks.

| File | Does |
|---|---|
| `parse.py` | Workbook → JSON. Validates every matchup, outcome, cover cell, pick and weekly record; exits 1 with a list of problems. |
| `build.mjs` | JSON → one idempotent SQL statement. Matches each sheet game to exactly one final ESPN event (both teams and the score must agree), converts spreads to `locked_home_spread` and picks to home/away, and checks every cover against the sheet. |
| `verify.mjs` | Compares per-week, season and segment W-L in the database with the sheet (and the Standings tab), plus membership, paid flags, commissioners and the segments setting. |

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
node $D/verify.mjs $OUT/parsed.json --db $DB --pool-slug 2026-ncaa-supercontest
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
node $D/verify.mjs $OUT/parsed.json --db "<production connection string>" --pool-slug 2026-ncaa-supercontest
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

## After week 7 finishes

Week 7 was in progress at import time, so only weeks 1–6 were loaded. Once every week 7
outcome is in the sheet, download it again and re-run everything with `--weeks 1-7`:

```sh
/tmp/xlenv/bin/python -I $D/parse.py <new.xlsx> $OUT/parsed.json --weeks 1-7
node $D/build.mjs $OUT/parsed.json --pool-slug 2026-ncaa-supercontest --season 2026 --out $OUT/import.sql --report $OUT/report.json
npx supabase db query --linked -f $OUT/import.sql
node $D/verify.mjs $OUT/parsed.json --db "<production connection string>" --pool-slug 2026-ncaa-supercontest
```

Re-running is safe: accounts and members aren't duplicated, a member marked paid in the app is
never un-marked (the sheet can only add paid flags), and display names are set only on accounts
the import created or that still have the default name (the email's local part); a name
someone chose stays, since profiles are shared by every pool. Each imported week's slate is updated in place with its picks deleted and
re-inserted from the sheet, then regraded. Anything changed in the app on those weeks
(result overrides, voids, edited spreads) is reset to the sheet. Weeks not in `--weeks` are
left alone, and the week-number guard above refuses to overwrite a slate the app created.

`parse.py` refuses a week whose outcomes aren't all filled in.

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
