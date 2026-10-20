# Data sources — current choice and alternatives

Researched 2026-10-16. **[V]** = verified on the provider's page/API spec that day; **[I]** = inferred / third-party.

## Current
| Need | Source | Notes |
|---|---|---|
| Schedule, live scores, TV, AP rank, conferences, logos | ESPN site API (unofficial) | Free, no SLA. Needs a browser-like User-Agent (403s otherwise). Disney ToS bans automated access [V] — tolerated, not permitted. |
| Spreads / moneylines | The Odds API v4 | Free: 500 credits/mo [V]. One call = 2 credits for the whole sport, covering up to 10 bookmakers [V]. The app pulls **at most once per sport per Central day** (`odds_pulls`), so ~60 credits/mo per sport, ~120 when CFB and CBB overlap. The $30 tier (20k credits) is the planned upgrade if lines need refreshing more often; raise the daily limit then. `x-requests-remaining` is stored in `odds_pulls.quota_remaining`. |

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

## Live scores (researched 2026-10-17)
Our polling: one call per sport every 2 min, only while a slate game is live — about 4,500/mo
for NCAAB and 2,900/mo for NCAAF, ~7,400/mo at the Nov–Dec overlap [I].

| Option | Fit | Cost at our volume |
|---|---|---|
| **ESPN** (current) | Both sports, all of D-I, seconds-fresh; unofficial (no SLA, ToS) | $0 |
| **CFBD / CBBD `/scoreboard`** | Official, both sports on one key, has TBD/neutral/clock; CFBD has no postponed/cancelled status and no date param (current scoreboard only); CFBD team ids very likely = ESPN ids [I] | **$5/mo (30k)** — the $1 tier (5k) is too small in Nov–Dec, and going over disables the key |
| The Odds API `/scores` | Official, refreshes ~30 s [V]; team names only, games with odds only, no cancelled/TBD | 1–2 credits/call: finals-only daily sweep ≈ 120/mo (fits free); as the live poller ≈ $30 tier |
| NCAA.com (henrygd/ncaa-api) | Unofficial scraper, breaks when NCAA.com rotates query hashes | $0 |
| BALLDONTLIE / API-Sports / SportsGameOdds | $20/mo for both sports / free tier too small / free tier 10-min delay | — |
| TheSportsDB | No NCAA live scores | — |
| Sportradar / SportsDataIO / Goalserve | Enterprise | $$$ |

**Plan:** ESPN now (it also covers NFL and PGA for later). When we want insurance, add CFBD/CBBD
($5/mo) behind a provider interface in `supabase/functions/_shared/` with automatic failover
after 3 consecutive ESPN failures, and hold grading on a fallback-only final until a second
source confirms. Commissioners can always fix a result by hand meanwhile.

## AP Top 25 (Home page)
ESPN's site API `.../{sport path}/rankings`, the `rankings[]` entry with `type: "ap"`
(`ranks[].current/previous/recordSummary/firstPlaceVotes/team`). Fetched by the Home page
itself (`lib/apPoll.ts`) and cached for an hour, so a new poll (AP releases Sundays) shows up
within the hour. No table or cron job; if ESPN is down the panel says so and the page still loads.
Once the College Football Playoff committee releases its rankings, ESPN adds them to the same
feed (a `rankings[]` entry named "College Football Playoff Rankings"); `getApPoll` prefers it.

## Top stories (Home page)
`lib/news.ts` mixes several free sources, newest first, at most 4 per source, repeated headlines
once; each source is cached 15 minutes and skipped if it fails. Stories open on their own site.
- ESPN: site API `.../{sport path}/news` (`articles[]`, `type` Story or Media); ESPN+ (`premium`) skipped.
- CBS Sports: RSS `https://www.cbssports.com/rss/headlines/college-football/` (image in `<enclosure>`).
- Fox Sports: RSS `https://api.foxsports.com/v2/content/optimized-rss?partnerKey=…&tags=fs/cfb` (image in `media:content`).
- Basketball pools: ESPN, CBS Sports (`/rss/headlines/college-basketball/`), Fox Sports (`tags=fs/cbk`,
  kept to `/college-basketball/` links), NBC Sports (`https://www.nbcsports.com/mens-college-basketball.rss`,
  image in the `image/*` `media:content`; a video one may come first) and The Field of 68
  (Substack, `https://thefieldof68.substack.com/feed`).
- Removed: Yahoo Sports (Oct 2026).
- Not added: The Athletic (subscription; most links are paywalled). Add a feed to `RSS_FEEDS` once its URL is known.
