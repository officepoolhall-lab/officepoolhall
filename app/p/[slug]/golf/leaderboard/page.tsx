import type { Metadata } from "next";
import { PlaySuspended } from "@/components/PlaySuspended";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { GolfLeaderboard, type LeaderRow } from "@/components/GolfLeaderboard";
import { Empty, PageTitle } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import { getGolfContext, getGolfEvents, getGolfMyPicks, getGolfResults, getGolfVisiblePicks, golfFormat, golfWeek } from "@/lib/golf";
import { getVisibleLineups } from "@/lib/golfMajorsData";
import { getEventInfo } from "@/lib/golfEventInfo";
import { projectedEarnings } from "@/lib/golfMajors";
import { currentRound, espnTournamentId, getLiveLeaderboard, posRank } from "@/lib/golfLive";
import { getCoursePar, getRoundProgress, type RoundProgress } from "@/lib/golfScorecard";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * One tournament's leaderboard, from ESPN's live page (refreshed every minute while under way):
 * place, score to par, holes played, each round and the total, plus prize money once final.
 * ?event= picks the tournament; otherwise the one under way, else (Mon–Tue) the one that just
 * finished, else the next one. Golfers picked in the pool are marked (others' picks only once
 * the event has started). Falls back to the pool's own copy of the field when ESPN can't be read.
 */
export default async function GolfLeaderboardPage({ params, searchParams }: PageProps<"/p/[slug]/golf/leaderboard">) {
  const { slug } = await params;
  const { event: eventParam } = await searchParams;
  const ctx = await getGolfContext(slug);
  const [events, picks, myPicks] = await Promise.all([getGolfEvents(ctx), getGolfVisiblePicks(ctx), getGolfMyPicks(ctx)]);
  const counted = events.filter((e) => e.status !== "canceled");
  if (counted.length === 0) {
    return (
      <>
        <PageTitle>Leaderboard</PageTitle>
        <Empty>No tournaments are set up for this pool yet.</Empty>
      </>
    );
  }

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const week = golfWeek(events, now);
  const event = counted.find((e) => e.id === eventParam) ?? week.tickerEvent ?? week.current ?? counted[counted.length - 1];
  const weekNo = counted.indexOf(event) + 1;
  const dbState: "scheduled" | "live" | "final" = event.status === "final" ? "final" : event.status === "in_progress" ? "live" : "scheduled";
  const tournamentId = espnTournamentId(event.espn_id, ctx.pool.slug, event.status);
  // The demo's upcoming event is last year's real one, already final: show its stored field instead.
  const readEspn = tournamentId && (/^\d+$/.test(event.espn_id) || dbState !== "scheduled");
  // From the first tee time on, read ESPN every minute even if the pool's own status (set by the
  // 10-minute import) hasn't caught up yet.
  const teedOff = dbState === "scheduled" && !!event.start_at && Date.parse(event.start_at) <= now;
  // While under way: read fresh every time the page loads (no cache), so moving to the page shows
  // the latest scores, not a copy up to a minute old.
  const live = readEspn ? await getLiveLeaderboard(tournamentId!, dbState === "live" || teedOff ? 0 : dbState === "final" ? 3600 : 600) : null;
  // ESPN's own word wins for a real event: anyone started or finished means it's under way;
  // final needs round 4 and prize money too (between rounds everyone can show finished).
  const espnState = live && /^\d+$/.test(event.espn_id) ? (live.every((g) => g.status === "post") && live.some((g) => g.rounds[3] !== null) && live.some((g) => g.earnings > 0) ? "final" : live.some((g) => g.status === "in" || g.status === "post" || (g.thru !== null && g.thru !== "0")) ? "live" : null) : null;
  const state: "scheduled" | "live" | "final" = dbState === "final" ? "final" : (espnState ?? dbState);
  const stored = live ? [] : await getGolfResults(ctx, event.id);
  // While a round is being played: which one, and the course's par, to give each golfer on the
  // course their score for the round so far (total to par less the finished rounds' scores).
  const [round, coursePar] = state === "live" && live && tournamentId ? await Promise.all([currentRound(tournamentId, live), getCoursePar(tournamentId)]) : [null, null];
  const parNum = (t: string | null) => {
    const v = t?.replace(/[\u2212\u2013\u2014]/g, "-").trim() ?? null;
    return v === "E" ? 0 : v && /^[+-]?\d+$/.test(v) ? Number(v) : null;
  };
  const fmt = (d: number) => (d === 0 ? "E" : d > 0 ? `+${d}` : String(d));
  const today = (g: { toPar: string | null; thru: string | null; rounds: (number | null)[] }) => {
    if (!round || !coursePar || !g.thru || g.thru === "F") return null;
    const total = parNum(g.toPar);
    const before = g.rounds.slice(0, round - 1);
    if (total === null || before.some((r) => r === null)) return null;
    return fmt(total - before.reduce((t: number, r) => t + (r! - coursePar), 0));
  };

  // Majors pools: each entry's lineup counts every golfer in it; the viewer's lineup is "mine".
  const majors = golfFormat(ctx.pool) === "majors";
  const lineups = majors ? (await getVisibleLineups(ctx)).filter((l) => l.event_id === event.id) : [];
  const pickedBy = new Map<string, number>();
  for (const p of majors ? lineups : picks.filter((p) => p.event_id === event.id)) pickedBy.set(p.espn_golfer_id, (pickedBy.get(p.espn_golfer_id) ?? 0) + 1);
  const mineSet = new Set(majors ? lineups.filter((l) => l.user_id === ctx.entryUserId).map((l) => l.espn_golfer_id) : (myPicks.filter((p) => p.event_id === event.id).map((p) => p.espn_golfer_id)));
  // Tee times: with the day before the tournament starts; once it's under way, just the time
  // (today's round), so it stays on one line.
  const tee = (iso: string | null) => (iso ? formatInTimeZone(iso, ctx.displayTz, state === "scheduled" ? "EEE h:mm a" : "h:mm a") : null);

  // Between rounds (and early in the next) ESPN's leaderboard page can still show the last round:
  // "F" and that round's tee time. For those golfers, the next round's tee time, holes played
  // and score come from their linescores instead (in batches, so ESPN isn't hit all at once).
  const next = new Map<string, RoundProgress>();
  if (live && state === "live" && tournamentId) {
    const between = live.filter((g) => {
      const played = g.rounds.filter((r) => r !== null).length;
      return !g.out && g.thru === "F" && played >= 1 && played < 4 && !(g.tee && Date.parse(g.tee) > now);
    });
    for (let i = 0; i < between.length; i += 20) {
      const batch = between.slice(i, i + 20);
      const got = await Promise.all(batch.map((g) => getRoundProgress(tournamentId, g.id, g.rounds.filter((r) => r !== null).length + 1)));
      batch.forEach((g, j) => {
        const p = got[j];
        if (p && (p.tee || p.holes > 0)) next.set(g.id, p);
      });
    }
  }
  const addToPar = (total: string | null, round: string | null) => {
    const a = parNum(total);
    const b = round === "E" ? 0 : round ? Number(round) : null;
    return a === null || b === null || !Number.isFinite(b) ? total : fmt(a + b);
  };

  let rows: LeaderRow[] = live
    ? live.map((g) => {
        // The next round from the linescores, when ESPN's page hasn't caught up.
        const n = next.get(g.id);
        const started = !!n && n.holes > 0;
        // A tee time still ahead means the golfer hasn't started today's round; so does a next
        // round with no holes yet.
        const teeAt = n?.tee ?? g.tee;
        const waiting = (!!n && !started && !!n.tee) || (!!teeAt && Date.parse(teeAt) > now);
        return {
          id: g.id,
          name: g.name,
          country: g.country,
          flag: g.flag,
          // A withdrawal or disqualification shows as WD / DQ even where ESPN still lists a place;
          // a missed cut once ESPN drops the place (before the cut is made it flags golfers
          // projected to miss while they keep their place: that's the projected cut line below).
          // No cut is made before round 2 ends, so a golfer ESPN drops from the board earlier with
          // only its cut flag has withdrawn.
          pos:
            g.out && g.out !== "MC"
              ? g.out
              : g.pos !== "-"
                ? g.pos
                : g.out === "MC" && state === "live" && (round ?? 1) <= 2 && !g.rounds[1]
                  ? "WD"
                  : (g.out ?? (state === "scheduled" ? "" : "–")),
          toPar: started ? addToPar(g.toPar, n!.toPar) : g.toPar,
          thru: started ? (n!.holes >= 18 ? "F" : String(n!.holes)) : state === "scheduled" || waiting ? tee(teeAt) : g.thru === "F" ? "F" : (g.thru ?? null),
          rounds: g.rounds,
          today: started ? n!.toPar : today(g),
          earnings: g.earnings,
          pickedBy: pickedBy.get(g.id) ?? 0,
          mine: mineSet.has(g.id),
          _order: g.order ?? 9999,
          _tee: teeAt ?? "~",
          _last: g.lastName,
        };
      })
    : stored.map((r) => ({
        id: r.espn_golfer_id,
        name: r.golfer_name,
        country: null,
        flag: null,
        pos: r.pos && r.pos !== "-" ? r.pos : state === "final" ? "MC" : "",
        toPar: null,
        thru: state === "scheduled" ? tee(r.tee_at) : null,
        rounds: [null, null, null, null],
        today: null,
        earnings: Number(r.earnings),
        pickedBy: pickedBy.get(r.espn_golfer_id) ?? 0,
        mine: mineSet.has(r.espn_golfer_id),
        _order: 9999,
        _tee: r.tee_at ?? "~",
        _last: r.golfer_name.split(" ").slice(-1)[0],
      }));
  rows = (rows as (LeaderRow & { _order: number; _tee: string; _last: string })[])
    .sort((a, b) =>
      state === "scheduled"
        ? a._tee.localeCompare(b._tee) || a._last.localeCompare(b._last)
        : // Missed cuts and withdrawals last; then ESPN's own order (its tiebreaks), then place.
          Number(/^(MC|CUT|WD|DQ)$/.test(a.pos)) - Number(/^(MC|CUT|WD|DQ)$/.test(b.pos)) || a._order - b._order || posRank(a.pos) - posRank(b.pos) || a._last.localeCompare(b._last),
    )
    .map(({ _order, _tee, _last, ...r }) => r);

  // While it's played: each golfer's prize money projected from their current place and the
  // purse (ties split), shown until the real amounts are posted.
  if (state === "live") {
    const purse = (await getEventInfo([event], ctx.pool.slug)).get(event.id)?.purse ?? null;
    const proj = projectedEarnings(
      rows.map((r) => ({ espn_golfer_id: r.id, pos: r.pos, out: /^(MC|CUT|WD|DQ)$/.test(r.pos), to_par: null, thru: null, earnings: 0, rounds: null, scorecard: null })),
      purse,
      false,
    );
    rows = rows.map((r) => ({ ...r, projected: proj.get(r.id) ?? null }));
  }

  // Rounds 1 and 2, before the cut is made: where it projects to fall, by the cut rule (top 65 and
  // ties on the PGA Tour; the Masters 50, U.S. Open 60, PGA Championship and The Open 70), from
  // the golfers still in it in their current order. Not for small no-cut fields.
  const OUT = /^(MC|CUT|WD|DQ)$/;
  let projectedCut: { score: string; after: number } | null = null;
  // (A real missed cut, once made, ends it; withdrawals don't.)
  if (state === "live" && live && (round ?? 1) <= 2 && rows.length > 80 && !rows.some((r) => r.pos === "MC")) {
    const places = /masters/i.test(event.name) ? 50 : /u\.?s\.? open/i.test(event.name) ? 60 : /pga championship|open championship|^the open$/i.test(event.name) ? 70 : 65;
    const scored = rows.map((r, i) => ({ i, s: OUT.test(r.pos) ? null : parNum(r.toPar) })).filter((x): x is { i: number; s: number } => x.s !== null);
    // ESPN's own projection when it gives one: it flags the golfers projected to miss.
    const flagged = new Set((live ?? []).filter((g) => g.cutFlag && g.pos !== "-").map((g) => g.id));
    const inside = scored.filter((x) => !flagged.has(rows[x.i].id));
    if (flagged.size && inside.length) {
      const last = inside[inside.length - 1];
      projectedCut = { score: fmt(Math.max(...inside.map((x) => x.s))), after: last.i };
    } else if (scored.length > places) {
      const line = [...scored].sort((a, b) => a.s - b.s)[places - 1].s;
      const after = Math.max(...scored.filter((x) => x.s <= line).map((x) => x.i));
      projectedCut = { score: fmt(line), after };
    }
  }

  const status =
    state === "final"
      ? "Final"
      : state === "live"
        ? `${round ? `Round ${round} · ` : ""}${projectedCut ? `Projected Cut ${projectedCut.score.replace(/^-/, "−")} · ` : ""}Under Way · Updates Every Minute`
        : event.start_at
          ? `Starts ${formatInTimeZone(event.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")} ${tzAbbrev(event.start_at, ctx.displayTz)}`
          : "Tee Times Not Posted Yet";

  return (
    // Phones and tablets: fills the screen like the League Grid, the header staying put and the
    // board scrolling below it. Desktop: the board runs the full width and the page scrolls as
    // one (no scroll box), the column titles pinned under the app header.
    <div
      data-fill-viewport
      className="flex lg:max-h-none max-h-[max(24rem,calc(100dvh-7.75rem-4px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col sm:max-h-[max(24rem,calc(100dvh-8rem-3px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
    >
      <h1 className="sr-only">Leaderboard</h1>
      {/* Refresh every minute while under way, and from the first tee time so it notices the start. */}
      <AutoRefresh active={state === "live" || teedOff} seconds={60} />
      {/* One compact header: the tournament and its status on the left, the dropdown on the right. */}
      <div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {majors ? "Leaderboard" : `Leaderboard · Week ${weekNo}`}
          </div>
          <h2 className="text-lg font-bold leading-tight">{event.name}</h2>
          <p className={`text-xs ${state === "live" ? "text-live" : "text-muted"}`}>{status}</p>
        </div>
        {/* A pool with one tournament (a single-major pool) has nothing to switch between. */}
        {counted.length > 1 && <GolfEventSelect
          basePath={`/p/${slug}/golf/leaderboard`}
          value={event.id}
          // Week 1 at the top, through the season.
          events={counted.map((e, i) => ({ id: e.id, label: majors ? e.name : `Week ${i + 1} · ${e.name}` }))}
        />}
      </div>
      {state === "live" && <PlaySuspended tournamentId={tournamentId} className="mb-2 shrink-0" />}
      {rows.length === 0 ? (
        <Empty>The field for this tournament hasn&apos;t been posted yet.</Empty>
      ) : (
        <GolfLeaderboard rows={rows} round={round} state={state} projectedCut={projectedCut} tournamentId={readEspn && live ? tournamentId : null} eventName={event.name} />
      )}
    </div>
  );
}
