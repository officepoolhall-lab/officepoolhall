# Pool A rules — 2026-27 NCAA Basketball Pool

Source of truth: Brooks's "2026-27 NCAA Basketball Pool Guidelines" and the Week 1 pick sheet
(Oct 2026). Where the app interprets something, the interpretation is marked **[default]** and
has a `TODO(brooks)` in code. Everything here is configurable per pool in `pools.settings`.

## Weekly picks (MVP)
| Rule (Brooks) | App behavior | Setting |
|---|---|---|
| Weeks run Monday → Sunday | Default window Mon 00:00 – next Mon 00:00 Central. The commissioner can set any first/last day for a slate (Week 1 = Sun Nov 1 – Sun Nov 8). | `window` + per-slate dates |
| ~40–45 nationally/regionally televised games, mostly American, A-10, ACC, Big 12, Big East, Big Ten, Mountain West, Pac-12, SEC, WCC | Commissioner curates the slate; editor filters by conference, ranked, national TV | — |
| Pick the winner straight up of **35** games | 35 picks, straight up | `pick_type: straight_up`, `picks_per_slate: 35` |
| Seven 5s, seven 4s, seven 3s, seven 2s, seven 1s | Enforced by the database | `confidence.tiers` |
| Correct pick = + its points; **incorrect pick = − its points** | Win +N, loss −N, void 0 | `confidence.wrong_pick: "minus_points"` |
| **Upset bonus** by how the pool split its points on the game: 50–80% on one side → none; 80–90% → +1; 90–95% → +2; 95–100% → +3, for a correct pick on the side the pool was against | For each game, sum the confidence points every player put on each side. If a player correctly picked the side with fewer points, they get the bonus for the majority side's share: **> 80% → +1, > 90% → +2, > 95% → +3** [default: exactly 80/90/95% falls in the lower bracket]. No bonus on a 50/50 split or when nobody picked the other side. Bonus is shown separately and included in weekly points. | `upset_bonus.tiers` |
| **All picks due Wednesday 12:00 PM CT** (Brooks, Oct 2026 — replaces the Mon/Tue deadlines in the guidelines) | Every game locks at Wednesday noon Central | `lock.mode: weekly`, `lock.weekly: {weekday: 3, time: "12:00"}` |
| Games before the deadline lock at tip-off | Any game that tips before Wednesday noon locks at tip-off. Games with no announced time (TBD) lock at the deadline, not ESPN's midnight placeholder. The commissioner can set a TBD game's real time. | — |
| (optional) an earlier deadline for the week's first day | Supported but off for Pool A: games on the first weekday lock at the earlier of that time and the day's first tip | `lock.weekly.first_day_time` |
| Football (Pool B): each game locks at kickoff | Per-game lock | `lock.mode: per_game` |
| Week 1 | Window Sun Nov 1 – Sun Nov 8; due Wed Nov 4 at noon unless Brooks sets a different deadline on the Week 1 slate (his original sheet said Mon Nov 2, 3pm). The Sun Nov 1 Rome game and the Nov 2–3 games lock at tip. | per-slate deadline |
| Missed a game's lock → skip it | Locked games can't be picked; unpicked slots score 0 | — |
| **No selections at all → same total as the week's last-place finisher** | A player with zero picks on a slate gets the lowest weekly total among players who picked | `missed_week: "last_place"` |
| Neutral site: first team listed is AWAY; location shown | Neutral games list the away team first with "vs" and show the city | — |
| Everyone's picks shared for auditing | Selections grid shows each game's picks once it locks | — |
| $100 season fee, paid before 11/1 | Roster paid/unpaid toggle; money handled outside the app | `entry_fee` |

## Football Supercontest (Pool B)
| Rule (Brooks) | App behavior | Setting |
|---|---|---|
| Pick 5 games against the spread each week; 1 point per win | 5 ATS picks, win 1 / push ½ / loss 0 | `pick_type: ats`, `picks_per_slate: 5` |
| Half-point lines (no pushes) | Whole-number spreads get a half point at publish | `lines.force_half_point: true` |
| Each game locks at kickoff | Per-game lock | `lock.mode: per_game` |
| Season split into segments with their own payouts: weeks 1–5, 6–10, 11–end | Segment standings | `segments` |
| More than 5 picks submitted → only the first 5 by kickoff count | The app can't accept a sixth pick; for imported history, the picks on the 5 earliest-starting games are kept | — |

## Later in the season (Phase 2)
| Rule (Brooks) | When it's needed |
|---|---|
| In-season tournaments (Players Era, Maui Invitational, Paradise Jam): pick a champion; 5 pts champion, 3 runner-up, 2 third-place winner, 1 third-place loser | before Feast Week — **~Nov 20** |
| Conference tournaments (American, A-10, ACC, Big East, Big Ten, Big 12, CUSA, MAC, Missouri Valley, Mountain West, Pac-12, SEC, Summit, Sun Belt, WCC): pick each champion, 5 pts | early March |
| NCAA bracket from the first round (no play-in), seed-weighted points (table below) | Selection Sunday |
| Prizes: best weekly score, regular season, conference tournaments, NCAA tournament, full season | separate leaderboards by March |

### NCAA Tournament scoring (points for a correct winner, by the winner's seed)
| Round | 1 | 2 | 3–4 | 5–6 | 7–8 | 9–12 | 13–14 | 15–16 |
|---|---|---|---|---|---|---|---|---|
| First round | 2 | 2 | 2 | 2 | 2 | 3 | 4 | 5 |
| Second round | 3 | 3 | 3 | 4 | 5 | 5 | 6 | 7 |
| Sweet 16 | 5 | 5 | 6 | 7 | 8 | 9 | 10 | 10 |
| Elite 8 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 13 |
| Final Four | 10 | 12 | 14 | 15 | 16 | 18 | 20 | 20 |
| Champion | 12 | 14 | 16 | 18 | 20 | 22 | 24 | 24 |

## Open questions for Brooks
1. Upset bonus boundaries: is exactly 80/20 a +1 or no bonus? (App: no bonus; > 80% needed.)
2. Upset bonus: computed from points (as written) — confirm, not from number of players.
3. Week 1: due Wed Nov 4 at noon (new rule) or Mon Nov 2 at 3pm (original sheet)?
4. Pushes can't happen in basketball; a cancelled/postponed game is void (0) — confirm.
5. Weekly ties: split the weekly prize, or a tiebreaker?
