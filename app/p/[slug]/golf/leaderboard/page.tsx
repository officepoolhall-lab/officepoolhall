import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfEventSelect } from "@/components/GolfEventSelect";
import { GolfLeaderboard, type LeaderRow } from "@/components/GolfLeaderboard";
import { Empty, PageTitle } from "@/components/ui";
import { tzAbbrev } from "@/lib/format";
import { getGolfContext, getGolfEvents, getGolfMyPicks, getGolfResults, getGolfVisiblePicks, golfWeek } from "@/lib/golf";
import { espnTournamentId, getLiveLeaderboard, posRank } from "@/lib/golfLive";

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
  const state: "scheduled" | "live" | "final" = event.status === "final" ? "final" : event.status === "in_progress" ? "live" : "scheduled";
  const tournamentId = espnTournamentId(event.espn_id, ctx.pool.slug);
  // The demo's upcoming event is last year's real one, already final: show its stored field instead.
  const readEspn = tournamentId && (/^\d+$/.test(event.espn_id) || state !== "scheduled");

  const live = readEspn ? await getLiveLeaderboard(tournamentId!, state === "live" ? 60 : state === "final" ? 3600 : 600) : null;
  const stored = live ? [] : await getGolfResults(ctx, event.id);

  const pickedBy = new Map<string, number>();
  for (const p of picks) if (p.event_id === event.id) pickedBy.set(p.espn_golfer_id, (pickedBy.get(p.espn_golfer_id) ?? 0) + 1);
  const mine = myPicks.find((p) => p.event_id === event.id)?.espn_golfer_id ?? null;
  const tee = (iso: string | null) => (iso ? `${formatInTimeZone(iso, ctx.displayTz, "EEE h:mm a")}` : null);

  let rows: LeaderRow[] = live
    ? live.map((g) => {
        // A tee time still ahead means the golfer hasn't started today's round.
        const waiting = g.tee && Date.parse(g.tee) > now;
        return {
          id: g.id,
          name: g.name,
          country: g.country,
          pos: g.pos !== "-" ? g.pos : (g.out ?? (state === "scheduled" ? "" : "–")),
          toPar: g.toPar,
          thru: state === "scheduled" || waiting ? tee(g.tee) : g.thru === "F" ? "F" : g.thru ? `Thru ${g.thru}` : null,
          rounds: g.rounds,
          total: g.total,
          earnings: g.earnings,
          pickedBy: pickedBy.get(g.id) ?? 0,
          mine: g.id === mine,
          _order: g.order ?? 9999,
          _tee: g.tee ?? "~",
          _last: g.lastName,
        };
      })
    : stored.map((r) => ({
        id: r.espn_golfer_id,
        name: r.golfer_name,
        country: null,
        pos: r.pos && r.pos !== "-" ? r.pos : state === "final" ? "MC" : "",
        toPar: null,
        thru: state === "scheduled" ? tee(r.tee_at) : null,
        rounds: [null, null, null, null],
        total: null,
        earnings: Number(r.earnings),
        pickedBy: pickedBy.get(r.espn_golfer_id) ?? 0,
        mine: r.espn_golfer_id === mine,
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

  const status =
    state === "final"
      ? "Final"
      : state === "live"
        ? "Under way · updates every minute"
        : event.start_at
          ? `Starts ${formatInTimeZone(event.start_at, ctx.displayTz, "EEE, MMM d · h:mm a")} ${tzAbbrev(event.start_at, ctx.displayTz)}`
          : "Tee times not posted yet";

  return (
    // Fills the screen like the League Grid: the header stays put and the board scrolls below it.
    <div
      data-fill-viewport
      className="flex max-h-[max(24rem,calc(100dvh-7.75rem-4px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col sm:max-h-[max(24rem,calc(100dvh-8rem-3px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
    >
      <h1 className="sr-only">Leaderboard</h1>
      <AutoRefresh active={state === "live"} seconds={60} />
      {/* One compact header: the tournament and its status on the left, the dropdown on the right. */}
      <div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Leaderboard · Week {weekNo}
          </div>
          <h2 className="text-lg font-bold leading-tight">{event.name}</h2>
          <p className={`text-xs ${state === "live" ? "text-live" : "text-muted"}`}>{status}</p>
        </div>
        <GolfEventSelect
          basePath={`/p/${slug}/golf/leaderboard`}
          value={event.id}
          // Week 1 at the top, through the season.
          events={counted.map((e, i) => ({ id: e.id, label: `Week ${i + 1} · ${e.name}` }))}
        />
      </div>
      {rows.length === 0 ? (
        <Empty>The field for this tournament hasn&apos;t been posted yet.</Empty>
      ) : (
        <GolfLeaderboard rows={rows} state={state} tournamentId={readEspn && live ? tournamentId : null} eventName={event.name} />
      )}
    </div>
  );
}
