import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { GolfTicker, type TickerGolfer } from "@/components/GolfTicker";
import { NewsList } from "@/components/NewsList";
import { ChevronIcon, SectionLabel, chipClass } from "@/components/ui";
import {
  getGolfContext,
  getGolfEvents,
  getGolfMyPicks,
  getGolfResults,
  getGolfStandings,
  golfWeek,
  isOpenForPicks,
  money,
  type GolfContext,
  type GolfEvent,
  type GolfPick,
  type GolfStanding,
  type GolfTickerMode,
} from "@/lib/golf";
import { espnTournamentId, formatToPar, getLiveLeaderboard, posRank } from "@/lib/golfLive";
import { getNews } from "@/lib/news";
import { getWorldRankings } from "@/lib/worldRankings";

export const metadata: Metadata = { title: "Home" };

export default async function GolfHomePage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const [events, myPicks, standings] = await Promise.all([getGolfEvents(ctx), getGolfMyPicks(ctx), getGolfStandings(ctx)]);
  // Server render time is fine here; the countdown itself ticks client-side.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const week = golfWeek(events, now);
  const current = week.current;
  const myPick = current ? myPicks.find((p) => p.event_id === current.id) : undefined;
  const lastFinal = [...events].reverse().find((e) => e.status === "final");
  const lastPick = lastFinal ? myPicks.find((p) => p.event_id === lastFinal.id) : undefined;

  return (
    // data-wide: full screen width on desktop, like the football and basketball home.
    <div data-wide className="space-y-6">
      {/* Mon–Tue last week's finish, from Wednesday tee times, then the live leaderboard. */}
      {week.mode && week.tickerEvent && (
        <Suspense fallback={<div className="h-7" />}>
          <Ticker ctx={ctx} mode={week.mode} event={week.tickerEvent} myPicks={myPicks} />
        </Suspense>
      )}
      <AutoRefresh active={week.mode === "live"} seconds={120} />

      {/* Desktop: this week + standings | news | world rankings. Phones: week, standings, rankings, news. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <section className="mb-6 border-b border-line pb-4">
            {current ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Week {week.weekNumber} of {week.weeks}
                  {current.status === "in_progress" && <span className="ml-2 normal-case tracking-normal text-live">● Under way</span>}
                </div>
                <div className="mt-0.5 text-lg font-bold leading-snug text-ink">{current.name}</div>
                <div className="text-xs text-muted">
                  {current.start_at
                    ? `First tee ${formatInTimeZone(current.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")}`
                    : "Tee times not posted yet. Picks open once they are."}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
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
                      {myPick && current.status === "in_progress" && (
                        <Suspense fallback={null}>
                          <MyPickLive espnId={espnTournamentId(current.espn_id, ctx.pool.slug, current.status) ?? current.espn_id} golferId={myPick.espn_golfer_id} />
                        </Suspense>
                      )}
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
            {lastFinal && !ctx.isGuest && (
              <LastWeek ctx={ctx} event={lastFinal} pick={lastPick} />
            )}
            <div className="mt-3 flex gap-1.5">
              {!ctx.isGuest && <Link href={`/p/${slug}/golf/picks`} className={chipClass(true, "", "sm")}>My Picks</Link>}
              <Link href={`/p/${slug}/golf/grid`} className={chipClass(ctx.isGuest, "", "sm")}>Everyone&apos;s picks</Link>
            </div>
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

/**
 * The ticker's golfers: ESPN's live page when it can be read (real events), otherwise the
 * pool's own copy of the field and finishes (demo events, or ESPN unavailable).
 */
async function Ticker({ ctx, mode, event, myPicks }: { ctx: GolfContext; mode: GolfTickerMode; event: GolfEvent; myPicks: GolfPick[] }) {
  // Live scores every 2 minutes; tee times every 10; a final leaderboard doesn't change.
  const source = espnTournamentId(event.espn_id, ctx.pool.slug, event.status);
  // The demo's upcoming event is last year's real one, already final: use its stored field.
  const live = source && (/^\d+$/.test(event.espn_id) || event.status !== "scheduled") ? await getLiveLeaderboard(source, mode === "live" ? 120 : mode === "tees" ? 600 : 3600) : null;
  let golfers: TickerGolfer[] = live
    ? live
    : (await getGolfResults(ctx, event.id)).map((r) => ({
        id: r.espn_golfer_id,
        name: r.golfer_name,
        pos: r.pos ?? "-",
        toPar: null,
        thru: null,
        tee: r.tee_at,
        earnings: Number(r.earnings),
        lastName: r.golfer_name.split(" ").slice(-1)[0],
        order: null,
      }));
  const mine = myPicks.find((p) => p.event_id === event.id)?.espn_golfer_id ?? null;

  const byTee = (a: TickerGolfer, b: TickerGolfer) => (a.tee ?? "~").localeCompare(b.tee ?? "~") || a.lastName.localeCompare(b.lastName);
  // ESPN's own order when it gives one (it breaks ties the way its leaderboard does).
  const byPlace = (a: TickerGolfer, b: TickerGolfer) =>
    posRank(a.pos) - posRank(b.pos) || (a.order ?? 9999) - (b.order ?? 9999) || b.earnings - a.earnings || a.lastName.localeCompare(b.lastName);

  if (mode === "tees") {
    // Before the event: everyone by tee time (A–Z by last name until times are posted).
    golfers.sort(byTee);
  } else if (mode === "live") {
    // Under way: the leaderboard of everyone who has a score, then everyone still to tee off
    // by tee time. Golfers who missed the cut or withdrew drop off.
    const started = golfers.filter((g) => g.toPar !== null && posRank(g.pos) < 9999).sort(byPlace);
    const waiting = golfers.filter((g) => g.toPar === null).sort(byTee);
    golfers = [...started, ...waiting];
  } else {
    // Last week's finish: the top 40, plus the viewer's pick wherever it finished.
    golfers.sort(byPlace);
    const top = golfers.filter((g) => posRank(g.pos) < 9999).slice(0, 40);
    const pick = golfers.find((g) => g.id === mine);
    golfers = pick && !top.includes(pick) ? [...top, pick] : top;
  }

  // eslint-disable-next-line react-hooks/purity
  return <GolfTicker mode={mode} eventName={event.name} golfers={golfers} myGolferId={mine} timezone={ctx.displayTz} now={Date.now()} />;
}

/** The viewer's pick on the live leaderboard: "T12 · −4 · Thru 9". */
async function MyPickLive({ espnId, golferId }: { espnId: string; golferId: string }) {
  const g = (await getLiveLeaderboard(espnId, 120))?.find((x) => x.id === golferId);
  if (!g) return null;
  const parts = [g.pos !== "-" ? g.pos : null, g.toPar ? formatToPar(g.toPar) : null, g.thru ? (g.thru === "F" ? "F" : `Thru ${g.thru}`) : null].filter(Boolean);
  return parts.length ? <div className="text-xs tabular-nums text-muted">{parts.join(" · ")}</div> : null;
}

/** Last week: the event, the entry's pick, where they finished and what they earned. */
async function LastWeek({ ctx, event, pick }: { ctx: GolfContext; event: GolfEvent; pick: GolfPick | undefined }) {
  const result = pick ? (await getGolfResults(ctx, event.id)).find((r) => r.espn_golfer_id === pick.espn_golfer_id) : undefined;
  return (
    <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm">
      <div className="text-xs text-muted">Last week · {event.name}</div>
      {pick ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-medium">
            {pick.golfer_name}
            {result?.pos && result.pos !== "-" && <span className="ml-1.5 text-xs font-normal text-muted">{result.pos}</span>}
            {result && (!result.pos || result.pos === "-") && <span className="ml-1.5 text-xs font-normal text-muted">Missed cut</span>}
          </span>
          <span className="font-semibold tabular-nums">{money(Number(result?.earnings ?? 0))}</span>
        </div>
      ) : (
        <div className="text-muted">No pick ($0)</div>
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
