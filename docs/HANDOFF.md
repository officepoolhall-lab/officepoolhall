# The Office Pool Hall — Build Handoff (v2)
*Updated October 16, 2026 · Builder: Noah Brown · Product owner / commissioner: Brooks Cross*

This file is the build spec. It replaces Brooks's v1 handoff. The v1 HTML prototype (screens listed in §9) is the UX reference; the v1 schema and plan are superseded where they conflict with this file.

---

## 1. What we're building

A site for running season-long college pick'em pools among friends. One engine, configured per pool, covers both:

| | **Pool A — NCAAB Confidence Pool** (first launch) | **Pool B — NCAAF Supercontest** |
|---|---|---|
| Sport | College basketball | College football |
| Pick type | Straight up (pick the winner) | Against the spread (ATS) |
| Picks per week | 35 (may drop to 25) from a ~40-game slate | 5 from the week's slate |
| Scoring | Confidence-weighted: seven 5s, seven 4s, seven 3s, seven 2s, seven 1s | 1 pt per win, 0.5 per push (configurable) |
| Slate | Commissioner curates ~40 games, published Sunday | All FBS games in the window, or commissioner-curated |
| Pick lock | **Per game — each pick locks at that game's tip-off** | **Per game — each pick locks at that game's kickoff** |
| Line lock | n/a (straight up) | Lines frozen when the commissioner publishes the slate |
| Start | **Week 1 begins November 1, 2026** | Next season (or mid-season test) |

**Hard deadline:** Pool A must be usable for Week 1 picks (slate out ~Oct 25, due ~Oct 27–Nov 1 per Brooks's schedule — confirm with Brooks).

### Design principles
1. **Everything that varies by pool lives in `pools.settings`** (validated JSON) — never hard-code a sport, lock rule, pick count, or scoring rule.
2. **Picks lock per game at start time (default).** A player can change any pick until that game starts; started games are frozen. A weekly lock (one deadline for the whole slate) remains available as a setting, but per-game is the default.
3. **Lines are frozen at slate publish** (ATS pools), so every player picks against the same number all week, and a pick is graded against that frozen line, never a line that moved later.
4. **Locks are enforced in the database** using DB time, not just the UI.
5. **Nobody sees another player's pick on a game until that game starts.**
6. Keep it simple enough that Brooks (a beginner) can maintain it.

---

## 2. Scope

### MVP (must ship for Nov 1)
- Auth (email magic link via Supabase Auth)
- Pool creation (commissioner) with settings; invite link `/join/[token]`
- Roster with paid/unpaid toggle
- Commissioner slate editor: pull upcoming games, select games for the week, set/confirm lock time, publish
- Player pick screen with confidence assignment (Pool A) or pick-N ATS (Pool B), auto-save, validation, countdown to lock
- Lock: each pick freezes at its game's start; ATS lines freeze at publish
- Score ingestion + auto-grading
- Standings: weekly and season
- Selections grid (everyone's picks, visible only after lock)
- Commissioner overrides: edit a game result, void a game, edit a frozen line before publish, enter picks on behalf of a player

### Phase 2 (after Week 1 is running)
- Upset bonus points, Feast Week champion picks, conference tournament champion picks
- NCAA tournament bracket contest feeding overall scoring
- Separate leaderboards: regular season, conference tournaments, NCAA tournament, overall
- Email: slate published, reminder, last call, weekly recap
- Pick history / player stat cards
- Pool B (NCAAF ATS) turned on

### Out of scope (cut from v1)
Survivor, Calcutta, PGA, NFL, Pick 8, revenue/subscriptions, the multi-sport pool-type registry. The `settings` model makes these addable later without touching the core.

> **Open questions for Brooks** (don't block the build — use the defaults shown):
> - Week window? Default: Monday 00:00 through Sunday 23:59 Central. Slate publishes before the first game of the window.
> - Can a player move a confidence value off a game that hasn't started yet after other games have started? Default yes — only picks on started games are frozen; remaining tier slots stay assignable to unstarted games.
> - 35 or 25 picks? Default 35 (7 per tier); 25 = 5 per tier. Must be a setting.
> - Missed/incomplete picks: score 0 for unpicked slots? Default yes; partial submissions are allowed and saved.
> - Postponed/cancelled game: void (0 for everyone)? Default void.
> - Upset bonus rule (Phase 2): defined by spread? ranking? See his Guidelines PDF.
> - Weekly tiebreaker? Default: none in MVP (ties share).

---

## 3. Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind | TypeScript |
| Hosting | Vercel Hobby | |
| DB + Auth | Supabase | Postgres, RLS, Auth |
| Scheduled jobs | Supabase `pg_cron` + Edge Functions | Vercel Hobby cron is limited to roughly once/day, too slow for score polling. |
| Scores + schedule | ESPN undocumented API | Basketball: `/basketball/mens-college-basketball/scoreboard?dates=YYYYMMDD&groups=50&limit=500` |
| Lines | The Odds API | `basketball_ncaab`, `americanfootball_ncaaf`; one bookmaker as source of truth (setting) |
| Email (Phase 2) | Resend or SendGrid | |
| Errors | Sentry free tier | |

Env vars (Vercel + Supabase secrets, never committed): see `.env.example`.

---

## 4. Data model

Implemented in `supabase/migrations/`. Every line pull is a new `game_lines` row (never overwritten). Team name matching between ESPN and The Odds API is the #1 data bug source: ingestion matches via `teams.odds_api_name`; unmatched names go to an admin queue, never silently dropped.

Phase 2 tables (not built yet): `season_picks`, `bracket_entries` + `bracket_picks`.

---

## 5. `pools.settings` shape

Validated by the zod schema in `lib/poolSettings.ts`. If `confidence` is set, the sum of tier counts must equal `picks_per_slate`.

**Pool A defaults:** `straight_up`, 35, `exact`, tiers 5/4/3/2/1 × 7, per-game lock, window Mon→Sun Central.
**Pool B defaults:** `ats`, 5, `exact`, no confidence, win 1 / push 0.5 / loss 0, per-game lock, lines frozen at publish.

---

## 6. Core logic

### 6.1 Slate lifecycle
```
draft ──publish (freeze lines)──▶ open ──last game starts──▶ locked ──all games final/void──▶ graded
```
- **Create:** commissioner clicks "New week"; app computes `window_start` / `window_end` from settings (DST-aware). In weekly mode it also computes `lock_at`.
- **Build:** game picker lists games in the window that haven't started. Filters: conference, ranked teams, national TV. Show current line next to each.
- **Publish:** in one transaction — ATS pools freeze lines (`locked_line_id`, `locked_home_spread`, apply `force_half_point`; commissioner can hand-edit before confirming); status → `open`.
- **Per-game lock:** `submit_picks` rejects any pick on a game whose `start_at <= now()`; RLS reveals picks per game once started. Uses `games.start_at`, not live status, so a delayed tip doesn't reopen picks.
- **Close job** (pg_cron every 5 min): open slates whose last game has started (or whose weekly `lock_at` has passed) → `locked`. Idempotent.
- **Postponed games:** moved later but still inside the window → pick window extends; moved outside → commissioner voids it.
- **Grade:** when a game goes final, grade all picks on it across slates; when every slate game is final or voided, status → `graded`.

### 6.2 Pick validation — `submit_picks(slate_id, picks jsonb)`
- Caller is a pool member; slate is `open` (weekly mode: `now() < lock_at`).
- Every game is in `slate_games` and not voided.
- Picks on started games are frozen: the submitted set must contain them unchanged.
- Count ≤ `picks_per_slate`; confidence values exist in tiers and each is used no more than its tier `count`.
- Unstarted picks are replaced atomically. All time checks use DB `now()`.

### 6.3 Grading
```
margin = home_score - away_score
straight_up: result = picked_side == (margin > 0 ? 'home' : 'away') ? 'win' : 'loss'
ats:         cover = margin + locked_home_spread
             cover == 0 → push; else covering side = cover > 0 ? home : away
void → result 'void', 0 points
points: confidence pool → win ? confidence : 0; flat pool → settings.scoring[result]
```
Grading is idempotent and re-runnable after a commissioner edits a score.

### 6.4 Ingestion jobs (Edge Functions, scheduled by pg_cron)
| Job | Schedule | Does |
|---|---|---|
| `sync-schedule` | daily 6:00 CT | Upsert next 14 days of games from ESPN; match teams; flag unknown teams |
| `sync-lines` | every 2 h while any ATS slate is in draft | Pull lines for games on draft slates only |
| `close-slates` | every 5 min | §6.1 close job |
| `poll-scores` | every 2 min, 11:00–01:00 CT | Update scores/status for games on locked/open slates; grade on `final` |

Commissioner always has a manual "refresh lines" and "edit result" button as a fallback.

---

## 7. Row-level security

Implemented in `supabase/migrations/`. Helper functions `is_pool_member` / `is_commissioner` are `security definer` to avoid policy recursion. No direct writes to `picks` — all writes go through `submit_picks()`. Invites are redeemed via `join_pool(token)`. Ingestion and grading use the service role key. **Never expose the service role key to the browser.**

Required RLS tests (`supabase/tests/`): non-member can't read a pool; player can't see another player's pick before the game starts, but can after; player can't add/change/remove a pick on a started game; player can still change unstarted picks after earlier games start; player can't edit another user's picks; player can't see draft slates.

---

## 8. Screens (MVP)

| Route | Who | Notes |
|---|---|---|
| `/login` | all | Magic link |
| `/join/[token]` | all | Joins pool, then to pool home |
| `/pools` | player | My pools; create button |
| `/pools/new` | commissioner | Name, sport, entry fee, preset (Pool A / Pool B), then editable settings |
| `/p/[slug]` | player | Home: current slate, countdown, my pick progress, mini standings |
| `/p/[slug]/picks` | player | Pick screen |
| `/p/[slug]/standings` | player | Weekly + Season tabs |
| `/p/[slug]/grid/[week]` | player | Selections grid; each game's column fills in once it starts |
| `/p/[slug]/admin/slate` | commissioner | Create week, game picker w/ filters, review frozen lines, publish |
| `/p/[slug]/admin/roster` | commissioner | Members, paid toggle, invite link |
| `/p/[slug]/admin/results` | commissioner | Override scores, void games |
| `/p/[slug]/admin/settings` | commissioner | Pool settings (pick_type, tiers locked after Week 1 opens) |

**Pick screen (confidence pool):** team toggle + confidence chips per game, remaining count per tier, auto-save with "Saved" state, sorted by start time, read-only with lock icon the moment a game starts (no reload), "Next game locks in …" banner, warning when tier slots remain and the next game is within an hour. Mobile-first.

**Pick screen (ATS):** frozen spread for both sides, N-slot tracker, same per-game lock behavior.

Every pick screen shows the line source and "lines frozen at publish · each game locks at kickoff".

---

## 10. Build order

1. Scaffold; Supabase CLI init; deploy to Vercel.
2. Migrations: schema + RLS + `is_pool_member`, `is_commissioner`, `join_pool`, `submit_picks`.
3. Seed script: ~30 teams, 2 weeks of fake games, one Pool A with 5 users.
4. Grading module + unit tests — before any UI.
5. Auth, pools, invites, roster.
6. Commissioner slate editor (manual game entry first, then ESPN schedule sync).
7. Pick screen with confidence validation.
8. Per-game lock in `submit_picks` + line freeze at publish + close job.
9. Score polling + auto-grading; commissioner result override.
10. Standings + selections grid.
11. RLS tests; mobile pass; Sentry.
12. **Dry run:** fake Week 0 with real ESPN games and 3–4 testers, full cycle publish → pick → lock → grade.
13. Pool A Week 1 live.

## 11. Definition of done for MVP
- Brooks can create Pool A, invite players, build and publish a 40-game slate in under 15 minutes.
- A player can make 35 confidence picks on a phone in under 5 minutes, and can't submit invalid tier counts.
- A pick is impossible to create, change, or remove once its game has started, verified by test.
- Another player's pick on a game is invisible until that game starts, verified by test.
- Games auto-grade within ~5 minutes of final; standings update without manual work.
- Commissioner can fix any wrong result and standings recompute.

## Working rules
- Ask before adding dependencies beyond: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `date-fns`, `date-fns-tz`, `vitest`, `@sentry/nextjs`.
- Don't build anything listed under Phase 2 or Out of scope.
- For §2 open questions, use the stated default and leave a `// TODO(brooks):` comment.
