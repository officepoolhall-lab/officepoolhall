import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { GolfLiveTicker } from "@/components/GolfLiveTicker";
import { NewsList } from "@/components/NewsList";
import { ChevronIcon, SectionLabel } from "@/components/ui";
import {
  getGolfContext,
  getGolfEvents,
  getGolfMembers,
  golfFormat,
  getGolfMyPicks,
  getGolfResults,
  getGolfStandings,
  getMissedPickValues,
  golfWeek,
  isOpenForPicks,
  opensLater,
  picksOpenAt,
  money,
  type GolfContext,
  type GolfEvent,
  type GolfPick,
  type GolfStanding,
} from "@/lib/golf";
import { tzAbbrev } from "@/lib/format";
import { getNews } from "@/lib/news";
import { getWorldRankings } from "@/lib/worldRankings";
import { formatShown, formatToPar, golferShown } from "@/lib/golfMajors";
import { getMajorsScoreboard, getVisibleLineups } from "@/lib/golfMajorsData";

export const metadata: Metadata = { title: "Home" };

export default async function GolfHomePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  if (golfFormat(ctx.pool) === "majors") return <MajorsHome slug={slug} ctx={ctx} />;
  const [events, myPicks, standings] = await Promise.all([getGolfEvents(ctx), getGolfMyPicks(ctx), getGolfStandings(ctx)]);
  // Server render time is fine here; the countdown itself ticks client-side.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const week = golfWeek(events, now);
  const current = week.current;
  const myPick = current ? myPicks.find((p) => p.event_id === current.id) : undefined;
  const lastFinal = [...events].reverse().find((e) => e.status === "final");
  const nextOpen = current ? events.find((e) => e.id !== current.id && isOpenForPicks(e, now)) : undefined;
  const lastPick = lastFinal ? myPicks.find((p) => p.event_id === lastFinal.id) : undefined;

  return (
    // data-wide: full screen width on desktop, like the football and basketball home.
    <div data-wide className="space-y-6">
      {/* Mon–Tue last week's finish, from Wednesday tee times, then the live leaderboard. */}
      <Suspense fallback={<div className="h-7" />}>
        <GolfLiveTicker ctx={ctx} />
      </Suspense>
      <AutoRefresh active={week.mode === "live"} seconds={120} />

      {/* Desktop: this week + standings | news | world rankings. Phones: week, standings, rankings, news. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <section className="mb-4 border-b border-line pb-3">
            {current ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Week {week.weekNumber} of {week.weeks}
                  {current.status === "in_progress" && <span className="ml-2 normal-case tracking-normal text-live">● Under Way</span>}
                </div>
                <div className="mt-0.5 text-lg font-bold leading-snug text-ink">{current.name}</div>
                <div className="text-xs text-muted">
                  {current.start_at
                    ? `First Tee ${formatInTimeZone(current.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")}`
                    : "Tee Times Not Posted Yet · Picks Open Monday of Tournament Week, 7 AM Central"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  {!ctx.isGuest && (
                    <div className="min-w-0">
                      <div className="text-xs text-muted">{ctx.managing ? `${ctx.managing.ownerName}'s pick` : "My Pick"}</div>
                      <div className="mt-0.5 break-words text-base font-bold leading-snug">
                        {myPick ? (
                          myPick.golfer_name
                        ) : isOpenForPicks(current, now) ? (
                          <Link href={`/p/${slug}/golf/picks`} className="text-accent hover:underline">Make Pick</Link>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </div>
                    </div>
                  )}
                  {opensLater(current, now) && (
                    <div>
                      <div className="text-xs text-muted">Picks Open</div>
                      <div className="mt-0.5 text-base font-bold leading-snug tabular-nums">
                        {formatInTimeZone(picksOpenAt(current)!, ctx.displayTz, "EEE h:mm a")} {tzAbbrev(picksOpenAt(current)!, ctx.displayTz)}
                      </div>
                    </div>
                  )}
                  {isOpenForPicks(current, now) && current.start_at && (
                    <div>
                      <div className="text-xs text-muted">Picks Lock</div>
                      <div className="mt-0.5 text-base font-bold leading-snug tabular-nums">
                        <Countdown to={current.start_at} done="locked" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">The season is over. Thanks for playing.</p>
            )}
            {/* Another tournament already open for picks (the next one, opened early). */}
            {nextOpen && !ctx.isGuest && (
              <Link href={`/p/${slug}/golf/picks`} className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm hover:bg-hover">
                <span className="min-w-0">
                  <span className="block text-xs text-muted">Picks Open · {nextOpen.name}</span>
                  <span className="font-medium">{myPicks.some((p) => p.event_id === nextOpen.id) ? "Change Your Pick" : "Make Your Pick"}</span>
                </span>
                <ChevronIcon className="size-4 shrink-0 text-muted" />
              </Link>
            )}
            {lastFinal && !ctx.isGuest && (
              <LastWeek ctx={ctx} event={lastFinal} pick={lastPick} />
            )}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>Season standings</SectionLabel>
              <Link href={`/p/${slug}/golf/standings`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
                All <ChevronIcon className="size-4" />
              </Link>
            </div>
            <StandingsPreview rows={standings} me={ctx.entryUserId} limit={10} />
          </section>

        </div>

        <div className="order-last lg:order-none">
          <Suspense fallback={<Placeholder title="Golf news" rows={6} />}>
            <News now={now} />
          </Suspense>
        </div>

        <Suspense fallback={<Placeholder title="World golf rankings" rows={10} />}>
          <Rankings timezone={ctx.displayTz} />
        </Suspense>
      </div>
    </div>
  );
}

/** Last week: the event, the entry's pick, where they finished and what they earned. */
async function LastWeek({ ctx, event, pick }: { ctx: GolfContext; event: GolfEvent; pick: GolfPick | undefined }) {
  const result = pick ? (await getGolfResults(ctx, event.id)).find((r) => r.espn_golfer_id === pick.espn_golfer_id) : undefined;
  // No pick earns $0, or the week's lowest (the commissioner's rule).
  const missed = pick ? 0 : ((await getMissedPickValues(ctx, [event.id])).get(event.id) ?? 0);
  return (
    <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm">
      <div className="text-xs text-muted">Last Week · {event.name}</div>
      {pick ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-medium">
            {pick.golfer_name}
            {result?.pos && result.pos !== "-" && <span className="ml-1.5 text-xs font-normal text-muted">{result.pos}</span>}
            {result && (!result.pos || result.pos === "-") && <span className="ml-1.5 text-xs font-normal text-muted">Missed Cut</span>}
          </span>
          <span className="font-semibold tabular-nums">{money(Number(result?.earnings ?? 0))}</span>
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-3 text-muted">
          <span>No Pick</span>
          <span className="font-semibold tabular-nums">{money(missed)}</span>
        </div>
      )}
    </div>
  );
}

/** The top of the season standings, plus the viewer's own row when they're further down. */
function StandingsPreview({ rows, me, limit }: { rows: GolfStanding[]; me: string; limit: number }) {
  if (!rows.length) return <p className="border-y border-line py-3 text-sm text-muted">No standings yet.</p>;
  // Tied prize money shares a place.
  const places = rows.map((r, i) => (i > 0 && r.season_earnings === rows[i - 1].season_earnings ? null : i + 1));
  const placeOf = (i: number) => {
    let j = i;
    while (places[j] === null) j--;
    return places[j]!;
  };
  const meIndex = rows.findIndex((r) => r.user_id === me);
  const shown = rows.slice(0, limit).map((r, i) => ({ r, i }));
  if (meIndex >= limit) shown.push({ r: rows[meIndex], i: meIndex });
  return (
    <ol className="divide-y divide-line border-y border-line">
      {shown.map(({ r, i }, k) => (
        <li
          key={r.user_id}
          className={`flex min-h-9 items-center gap-2.5 py-1.5 text-sm ${r.user_id === me ? "bg-surface font-semibold" : ""} ${
            k === limit ? "border-t-2 border-line" : ""
          }`}
        >
          <span className="w-7 text-right tabular-nums text-muted">{placeOf(i)}</span>
          <span className="min-w-0 flex-1 truncate">{r.display_name}</span>
          <span className="tabular-nums">{money(r.season_earnings)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Golf stories from ESPN, CBS Sports, GOLF.com and others; streams in after the rest of the page. */
async function News({ now }: { now: number }) {
  return <NewsList stories={await getNews("golf", 10)} now={now} title="Golf news" />;
}

/** Official World Golf Ranking, top 25; updated each Monday. */
async function Rankings({ timezone }: { timezone: string }) {
  const owgr = await getWorldRankings(25);
  return (
    <section aria-labelledby="owgr">
      <div className="flex min-h-11 items-baseline justify-between gap-3">
        <SectionLabel>
          <span id="owgr">World golf rankings</span>
        </SectionLabel>
        {owgr?.asOf && <span className="text-xs text-muted">Week of {formatInTimeZone(owgr.asOf, timezone, "MMM d")}</span>}
      </div>
      {!owgr ? (
        <p className="border-y border-line py-3 text-sm text-muted">The rankings aren&apos;t available right now. Check back soon.</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {owgr.golfers.map((g) => {
            const move = g.previous === null ? null : g.previous - g.rank;
            return (
              <li key={`${g.rank}-${g.name}`} className="flex min-h-9 items-center gap-2.5 py-1.5 text-sm">
                <span className="w-6 text-right tabular-nums text-muted">{g.rank}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                {g.country && <span className="text-xs text-muted">{g.country}</span>}
                {g.points !== null && <span className="w-12 text-right text-xs tabular-nums text-muted">{g.points.toFixed(2)}</span>}
                <span
                  className={`w-9 text-right text-xs font-semibold tabular-nums ${
                    move === null ? "text-faint" : move > 0 ? "text-win" : move < 0 ? "text-loss" : "text-faint"
                  }`}
                >
                  {move === null ? "" : move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–"}
                  <span className="sr-only">
                    {move === null ? "" : move > 0 ? `, up ${move}` : move < 0 ? `, down ${-move}` : ", unchanged"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-faint">
        Source:{" "}
        <a href="https://www.owgr.com/current-world-ranking" target="_blank" rel="noopener noreferrer" className="underline">
          Official World Golf Ranking
        </a>
      </p>
    </section>
  );
}

/** Grey lines where news or rankings will appear, so the layout doesn't jump. */
function Placeholder({ title, rows }: { title: string; rows: number }) {
  return (
    <section aria-busy="true" aria-label={title}>
      <SectionLabel>{title}</SectionLabel>
      <ul className="mt-2 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="h-4 animate-pulse rounded bg-surface" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Home for a Majors pool: the live scroll, the next (or current) major with the entry's lineup
 * status and lock countdown, the standings so far, news and world rankings.
 */
/** $1.2M, $85K, $900 (compact). */
const shortMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : n > 0 ? `$${n}` : "$0";

async function MajorsHome({ slug, ctx }: { slug: string; ctx: GolfContext }) {
  const [events, members, lineups] = await Promise.all([getGolfEvents(ctx), getGolfMembers(ctx), getVisibleLineups(ctx)]);
  // eslint-disable-next-line react-hooks/purity -- server render
  const now = Date.now();
  const board = await getMajorsScoreboard(ctx, events, members);
  const live = events.find((e) => e.status === "in_progress");
  const next = live ?? events.find((e) => e.status === "scheduled") ?? events[events.length - 1];
  const open = next && next.status === "scheduled" && !!next.start_at && now < Date.parse(next.start_at) && !!next.picks_open_at && Date.parse(next.picks_open_at) <= now;
  const mine = next ? lineups.filter((l) => l.event_id === next.id && l.user_id === ctx.entryUserId) : [];
  const s = board.settings;
  const standingsEvents = s.standings === "each" ? (live ? [live] : board.started.slice(-1)) : board.started;
  const rows = standingsEvents.length ? board.standingsFor(standingsEvents.map((e) => e.id)) : [];
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const fmt = (v: number | null) => (v === null ? "–" : s.contest === "salary" ? (Math.round(v * 10) / 10).toString() : s.tiers.scoring === "earnings" ? money(v) : formatToPar(v));
  const myScore = next ? board.scores.get(`${ctx.entryUserId}|${next.id}`) : undefined;
  const myResultList = next ? (board.results.get(next.id) ?? []) : [];
  const myResults = new Map(myResultList.map((r) => [r.espn_golfer_id, r]));
  const shown = rows.slice(0, 10);
  const meRow = rows.find((r) => r.user_id === ctx.entryUserId);
  if (meRow && !shown.includes(meRow)) shown.push(meRow);

  return (
    <div data-wide className="space-y-6">
      <Suspense fallback={<div className="h-7" />}>
        <GolfLiveTicker ctx={ctx} />
      </Suspense>
      <AutoRefresh active={!!live} seconds={120} />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <section className="mb-4 border-b border-line pb-3">
            {next ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{live ? "Under Way" : next.status === "final" ? "Final" : "Next Major"}</div>
                <h2 className="text-lg font-bold leading-snug">{next.name}</h2>
                {next.start_at && next.status === "scheduled" && (
                  <p className="text-xs text-muted">
                    Locks {formatInTimeZone(next.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")} {tzAbbrev(next.start_at, ctx.displayTz)}
                  </p>
                )}
                <Link href={`/p/${slug}/golf/picks?event=${next.id}`} className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                  <span>
                    <span className="block text-xs text-muted">{ctx.managing ? `${ctx.managing.ownerName}'s Lineup` : "My Lineup"}</span>
                    <span className="font-semibold">
                      {mine.length ? (open ? "Edit Lineup" : "View Lineup") : open ? "Not picked yet" : next.status === "scheduled" ? "Picks not open yet" : "No lineup"}
                    </span>
                  </span>
                  {open && next.start_at ? (
                    <span className="text-right text-xs text-muted">
                      Locks in
                      <span className="block font-semibold tabular-nums text-ink">
                        <Countdown to={next.start_at} />
                      </span>
                    </span>
                  ) : (
                    <ChevronIcon className="size-4 text-muted" />
                  )}
                </Link>
                {/* The lineup itself: tier (or salary) and, once under way, place and score;
                    the golfers that count are in bold. */}
                {mine.length > 0 && (
                  <ul className="mt-1 divide-y divide-line">
                    {next.status !== "scheduled" && (
                      <li className="flex items-center gap-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint" aria-hidden>
                        <span className="w-10 shrink-0">{s.contest === "salary" ? "Salary" : "Tier"}</span>
                        <span className="min-w-0 flex-1">Golfer</span>
                        <span className="w-9 shrink-0 text-right">Place</span>
                        <span className="w-11 shrink-0 text-right">{s.contest === "salary" ? "Pts" : "Score"}</span>
                        <span className="w-14 shrink-0 text-right">{next.status === "final" ? "Earnings" : "Proj. $"}</span>
                      </li>
                    )}
                    {[...mine]
                      .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (b.salary ?? 0) - (a.salary ?? 0) || a.golfer_name.localeCompare(b.golfer_name))
                      .map((l) => {
                        const r = myResults.get(l.espn_golfer_id);
                        const g = myScore?.golfers.find((x) => x.espn_golfer_id === l.espn_golfer_id);
                        const started = next.status !== "scheduled";
                        return (
                          <li key={l.espn_golfer_id} className={`flex min-h-8 items-center gap-2 py-1 text-sm ${started && g && !g.counts ? "text-muted" : ""}`}>
                            <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">
                              {s.contest === "salary" ? `$${((l.salary ?? 0) / 1000).toFixed(1)}K` : `T${l.tier}`}
                            </span>
                            <span className={`min-w-0 flex-1 truncate ${started && g?.counts ? "font-semibold" : "font-medium"}`}>{l.golfer_name}</span>
                            {started && (
                              <>
                                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">{r?.out ? "MC" : (r?.pos ?? "")}</span>
                                {/* Score to par (points for salary cap), then prize money: projected from
                                    current standings until it's posted. */}
                                <span className="w-11 shrink-0 text-right tabular-nums">
                                  {formatShown(golferShown(l.espn_golfer_id, myResultList, s.contest === "salary" ? s : { ...s, tiers: { ...s.tiers, scoring: "to_par" } }, next.status === "final"))}
                                </span>
                                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{r ? shortMoney(r.earnings) : "–"}</span>
                              </>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
                {mine.length > 0 && next.status === "in_progress" && (
                  <p className="mt-1 text-[11px] text-muted">Proj. $ is projected from current standings and the purse (ties split), until prize money is posted.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">No majors are set up yet.</p>
            )}
          </section>
          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>{s.standings === "each" && standingsEvents[0] ? `${standingsEvents[0].name} standings` : "Standings"}</SectionLabel>
              <Link href={`/p/${slug}/golf/standings`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
                All <ChevronIcon className="size-4" />
              </Link>
            </div>
            {shown.length === 0 ? (
              <p className="border-y border-line py-3 text-sm text-muted">Standings start once the first major tees off.</p>
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {shown.map((r) => (
                  <li key={r.user_id} className={`flex min-h-9 items-center gap-2.5 py-1.5 text-sm ${r.user_id === ctx.entryUserId ? "bg-surface font-semibold" : ""}`}>
                    <span className="w-7 text-right tabular-nums text-muted">{r.total === null ? "" : r.rank}</span>
                    <span className="min-w-0 flex-1 truncate">{names.get(r.user_id) ?? "Player"}</span>
                    <span className="tabular-nums">{fmt(r.total)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <div className="order-last lg:order-none">
          <Suspense fallback={<Placeholder title="Golf news" rows={6} />}>
            <News now={now} />
          </Suspense>
        </div>
        <Suspense fallback={<Placeholder title="World golf rankings" rows={10} />}>
          <Rankings timezone={ctx.displayTz} />
        </Suspense>
      </div>
    </div>
  );
}
