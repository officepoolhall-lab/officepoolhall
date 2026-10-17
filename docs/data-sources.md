# Data sources — current choice and alternatives

Researched 2026-10-16. **[V]** = verified on the provider's page/API spec that day; **[I]** = inferred / third-party.

## Current
| Need | Source | Notes |
|---|---|---|
| Schedule, live scores, TV, AP rank, conferences, logos | ESPN site API (unofficial) | Free, no SLA. Needs a browser-like User-Agent (403s otherwise). Disney ToS bans automated access [V] — tolerated, not permitted. |
| Spreads / moneylines | The Odds API v4 | Free: 500 credits/mo [V]. A call with `markets=h2h,spreads&bookmakers=draftkings` = 2 credits and returns the whole sport [V]. ~15–30 calls/week ≈ 130–260 credits/mo — fits free. CFB + CBB drafts overlapping (Nov–Jan) can approach 500; $30/mo = 20k credits. Responses include `x-requests-remaining` (sync-lines returns it). |

## Alternatives
| Source | Covers | Price | Notes |
|---|---|---|---|
| **CollegeBasketballData / CollegeFootballData** | Games (with `startTimeTbd`, `neutralSite`, `tv`, `status`), live scoreboard, rankings, teams + conference + logos, lines [V] | Free 1k calls/mo; **$1/mo = 5k + live scoreboard**; $5 = 30k; $10 = 75k (shared across both sites) [V] | Documented, keyed, MIT. Team `sourceId` is likely the ESPN id [I — verify]. **Best fallback.** Confirm DraftKings via `/lines/providers`. |
| henrygd/ncaa-api (ncaa.com scraper) | Scores, schedules, rankings, SVG logos | Free / self-host | Public instance 3 req/s, "not for long-term reliance" [V]. Slug ids → a third mapping. Skip. |
| SportsGameOdds | Odds incl. DraftKings | Free 2,500 objects/mo, 10 req/min [V] | Emergency second odds source. |
| odds-api.io | Odds | Free 500/day [V] | Free tier "not for production" since Jul 2026 [V]. |
| BALLDONTLIE | NCAAB/NCAAF | Games $9.99/mo/sport, odds $39.99 [V] | No TV/neutral fields seen. |
| SportsDataIO, Sportradar, OpticOdds | Everything | Enterprise / sales | Over budget. |
| MySportsFeeds | NCAAB/NCAAF | From $5/mo personal, non-live [V] | Live costs more. |
| TheSportsDB | Badges | Free / $9 | NCAA coverage unclear. |

## Recommendation
- **Scores/schedule:** stay on ESPN; add CBBD (Tier 1, $1/mo) as a switchable fallback if ESPN breaks. Add a `cbbd_id` column then — one column per provider, never fuzzy matching.
- **Logos:** copy once per season into Supabase Storage / `public/` instead of hotlinking ESPN's CDN at runtime. Logos are school trademarks; fine for a private, non-monetized friends' site, but not licensed.
- **Odds:** stay on The Odds API free tier; watch `x-requests-remaining`. SportsGameOdds free tier as an emergency backup.

## Sources
github.com/henrygd/ncaa-api · api.collegebasketballdata.com/api-docs.json · collegefootballdata.com/api-tiers ·
collegebasketballdata.com/api-tiers · the-odds-api.com · the-odds-api.com/liveapi/guides/v4/ ·
disneytermsofuse.com/english/ · balldontlie.io · sportsgameodds.com/pricing · docs.odds-api.io/changelog ·
sportsdata.io · developer.sportradar.com · mysportsfeeds.com/feed-pricing/ · thesportsdb.com/pricing
