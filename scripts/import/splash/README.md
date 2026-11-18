# Splash Sports NFL Supercontest import

Moves a Splash Sports pick'em (5 ATS picks a week) into an NFL Supercontest pool, from the
"Picks by Week" pages saved in Chrome (`Save page as… → Webpage, Single File`, `.mhtml`).
Splash loads entries as you scroll, so scroll to the bottom before saving each week.

| File | Does |
|---|---|
| `extract.py` | `.mhtml` → the page's HTML: `python3 -I extract.py Week_1_Picks.mhtml Week_1.html` |
| `parse.py` | HTML → table rows as JSON: `python3 -I parse.py Week_1.html Week_1.rows.json` |
| `build_import.py` | `Week_N.rows.json` files → one SQL statement: `python3 -I build_import.py <dir> 1-10 "RT Supercontest" import.sql` |

`build_import.py` refuses to write anything if a week is incomplete or inconsistent: a game not
final, lines that disagree between entries, a Splash result that doesn't follow from Splash's
own score and line, or picks that don't add up to the entry's weekly points.

The SQL is a single `do` block (all-or-nothing) and safe to re-run. It:

- finds the pool by name (it must be an NFL ATS pool for 2026 with 5 picks and win 1 / push
  0.5 / loss 0);
- matches each Splash game to ESPN's final game with the same teams and score (Splash's
  `JAC`/`LA`/`WAS` are ESPN's `JAX`/`LAR`/`WSH`; a game ESPN lists the other way round, e.g.
  abroad, is flipped). ESPN's games must be in the database first:
  `select invoke_edge_function('sync-ranks', '{"sport":"nfl","back":75,"days":1}');`;
- creates one account per Splash entry, named after the username (a second entry is
  "username (Entry 2)"), with a placeholder email `splash-<username>@rt-supercontest.invalid`
  so nobody is emailed (the Splash username is kept in `raw_user_meta_data.splash_username`);
- adds them to the pool, writes one `locked` slate per week with Splash's lines as
  `locked_home_spread` and every pick, grades it, and raises unless every pick result and
  every weekly total equals Splash's.

It refuses to overwrite a slate the app created for one of the imported week numbers.

The saved pages and generated SQL hold the pool's entrants: keep them outside the repo.

## Real names and emails later

The placeholder accounts can't sign in. Once the commissioner has each username's name and
email, an account is handed over by setting its email (and name), after which the person signs
in with a code sent to that address. If the person already has an account here, move the
placeholder's picks, scores and membership to it instead and delete the placeholder.
