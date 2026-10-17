# Design direction

From a survey of sportsbook, DFS pick'em, and prediction-market UIs (FanDuel's Formation
design system, Polymarket/Kalshi, ESPN Tournament Challenge, Yahoo/Splash pick'em, Underdog).
Goal: borrow their clarity, skip the casino feel.

**Feel:** billiard felt + brass on warm paper. A friends' club, not a sportsbook.

| Token | Light | Dark |
|---|---|---|
| bg | #F7F5EF | #0F1513 |
| surface | #FFFFFF | #17201C |
| raised | #F0EDE4 | #1F2A25 |
| ink | #1B1F1D | #ECEFEA |
| muted | #6B706C | #9AA59F |
| border | #E3DFD4 | #2A3631 |
| felt (brand chrome only) | #1E5B45 | #3FA37C |
| brass (selection) | #F2B53A | #F2B53A |
| win | #15803D | #22C55E |
| loss | #B91C1C | #F87171 |
| live | #EA580C | #FB923C |

Selection is brass, never green, so "my pick" never reads as "won".

**Type:** Barlow Condensed (team names, labels, chips, big numbers), Inter (body),
Alfa Slab One (wordmark only).

## Rules
1. `tabular-nums` on every score, spread, countdown, rank, and total. Spreads always signed with a true minus (−3.5, +3.5); 0 is "PK".
2. The team line *is* the button: two stacked lines per game (away over home), ≥44px tall each.
3. Selected side: brass fill + check icon — never color alone.
4. Confidence chips are round, condensed numerals; spent tiers are greyed out.
5. A sticky bottom tracker (bet-slip style) shows tier pills ("5s · 3 left") and "18/35 picked".
6. Locked games: controls dimmed + lock icon; your own pick stays full strength. Countdown under 3h, orange under 15m.
7. Autosave each change with an inline "Saved" state; toast only on errors. No confirm modals for picks.
8. Grid: sticky name column + sticky header, 44px cells, win/loss tints, your row highlighted.
9. Standings: rank, name, points (tabular). Your row highlighted. Weekly/Season segmented control.
10. Hairline-divided rows grouped under sticky date headers; cards only for featured content.
11. ATS: show the frozen spread on both team lines plus "Line frozen at publish".
12. Commissioner editor: filter chips (conference, ranked, TV), checkbox list, sticky action bar.

**Avoid:** neon-on-black, gold gradients, glowing CTAs, confetti, "+150" moneylines,
"bet/wager/odds" copy, $ symbols outside entry fees.
