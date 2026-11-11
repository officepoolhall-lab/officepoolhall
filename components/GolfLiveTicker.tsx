import { getGolfEvents, getGolfMyPicks, getGolfResults, golfWeek, type GolfContext, type GolfEvent, type GolfPick, type GolfTickerMode } from "@/lib/golf";
import { currentRound, espnTournamentId, getLiveLeaderboard, posRank } from "@/lib/golfLive";
import { GolfTicker, type TickerGolfer } from "./GolfTicker";

/**
 * The golf scroll for the top of Home, My Picks and Standings: Monday–Tuesday last week's
 * finish, from Wednesday the coming event's tee times, during play the live leaderboard. Wrap
 * it in <Suspense>: it reads ESPN.
 */
export async function GolfLiveTicker({ ctx }: { ctx: GolfContext }) {
  const [events, myPicks] = await Promise.all([getGolfEvents(ctx), getGolfMyPicks(ctx)]);
  // eslint-disable-next-line react-hooks/purity
  const week = golfWeek(events, Date.now());
  if (!week.mode || !week.tickerEvent) return null;
  return <Ticker ctx={ctx} mode={week.mode} event={week.tickerEvent} myPicks={myPicks} />;
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
  return <GolfTicker mode={mode} eventName={event.name} golfers={golfers} myGolferId={mine} timezone={ctx.displayTz} now={Date.now()} round={mode === "live" && source ? await currentRound(source, live) : null} />;
}

