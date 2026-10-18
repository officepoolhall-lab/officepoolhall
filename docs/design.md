# Design system

**Reference:** a prediction-market game list (black background, team rows, rounded gray
"cells" with a white value and an accent sub-value, gray column headers, orange live status).
Clean and minimal: no cards around games, no borders, no colored headers, one font, one accent.

Earlier research (sportsbooks, DFS pick'em, ESPN/Yahoo pick'em) still applies for behavior:
tabular numbers, the team line as the tap target, never color alone for selection, a
bet-slip-style bottom tracker, per-game lock states, no casino tells.

## Tokens (`app/globals.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #ffffff | #000000 | page |
| `surface` | #f2f2f5 | #1c1c1e | cells, inputs, panels |
| `hover` | #e8e8ed | #2a2a2d | cell hover / pressed |
| `ink` | #0a0a0a | #f5f5f7 | primary text, values |
| `muted` | #6e6e73 | #8e8e93 | secondary text, column headers, records |
| `faint` | #aeaeb2 | #48484a | disabled, spent, placeholders |
| `line` | #e5e5ea | #1f1f22 | hairline separators |
| `accent` | #0066d6 | #3b9eff | the one accent: sub-values, selection, links |
| `live` | #c2410c | #ff7a1a | live status only |
| `win` | #15803d | #3dd68c | graded win |
| `loss` | #c8262c | #ff6369 | graded loss / destructive |

Font: **Inter** only (`font-sans`), `tabular-nums` on every number.

## Layout rules
1. **No cards around list content.** Lists are rows on the page background separated by
   `border-b border-line` hairlines (`divide-y divide-line`). Panels (`bg-surface rounded-2xl`)
   only for forms and small summaries.
2. **Cells** (`<Cell>` in `components/ui.tsx`) are the only filled interactive elements in a row:
   `rounded-[10px] bg-surface`, value in `text-ink` (15–16px, medium), optional sub-value in
   `text-accent` (15px, semibold). Selected: `bg-accent/15 ring-1 ring-accent` + the value in accent.
   Disabled/locked: `text-faint`, no hover.
3. **Team row:** 28–32px logo · name (`font-semibold`, 15–16px) with a muted second line
   (record / rank / conference) · score right-aligned (`font-semibold tabular-nums`) · cells.
4. **Column headers** above cell columns: `text-xs text-muted`, centered over the cells, shown
   once per game block (like "Spread · Total · Winner").
5. **Status line** above each game: `text-xs font-semibold`. Live = `text-live` with a small dot;
   upcoming = `text-muted` time · TV; final = `text-muted "Final"`. Lock icon in `text-faint`.
6. **Footer line** below a game, optional: `text-xs text-muted`, left meta (conference), right
   action/meta ("locks in 2h", "›").
7. **Page titles:** `text-2xl font-semibold tracking-tight`, sentence case. Section labels:
   `text-xs font-medium uppercase tracking-wide text-muted`. No other uppercase.
8. **Buttons:** primary = `bg-ink text-bg` (white-on-black in dark), secondary = `bg-surface`,
   destructive = `bg-surface text-loss`. `rounded-full`, `h-11`, `font-semibold`, sentence case.
9. **Segmented controls / chips:** `bg-surface rounded-full`, active = `bg-ink text-bg`.
10. **Tracker bar** (bottom, fixed): `bg-bg/90 backdrop-blur border-t border-line`, plain text
    counts — no colored pills. Accent only for the "active"/remaining emphasis.
11. Win/loss shown as small `text-win`/`text-loss` text or a 2px left edge — never full-row fills.
12. Header: `bg-bg border-b border-line`, wordmark in `font-semibold text-ink`. No brand color bars.
13. Spacing: rows `py-3`, page gutter `px-4`, max width `max-w-5xl` (the Grid uses the full width). Touch targets ≥ 44px.

## Avoid
Card borders, colored header bars, uppercase display type, multiple accent colors, gradients,
glows, pills with fills for counts, "bet/wager/odds" copy, moneyline prices.
