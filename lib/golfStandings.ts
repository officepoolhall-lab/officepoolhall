import "server-only";
import {
  finishLabel,
  getGolfEvents,
  getGolfMembers,
  getGolfResultsFor,
  getGolfVisiblePicks,
  golfWeek,
  isOpenForPicks,
  type GolfContext,
  type GolfPick,
} from "./golf";
import { formatToPar, getLiveLeaderboard, posRank } from "./golfLive";

// The golf Standings page's numbers, worked out from every pick the viewer can see (their own,
// and everyone's once an event has started) and where those golfers finished. Prize money
// counts once an event is final.

export type StandingLogRow = {
  week: number;
  event: string;
  golfer: string | null;
  /** "T7", "MC", "WD"; empty while under way with no place yet. */
  finish: string;
  earned: number;
  final: boolean;
};

export type StandingRow = {
  userId: string;
  name: string;
  isMe: boolean;
  /** Tied prize money shares a place. */
  place: number;
  tied: boolean;
  /** Places gained (+) or lost (−) with the last finished event; null before two events are final. */
  move: number | null;
  total: number;
  behind: number;
  lastWeek: { golfer: string | null; finish: string; earned: number } | null;
  /** The current event: hidden until picks lock unless it's the viewer's own. */
  thisWeek: { golfer: string | null; hidden: boolean; live: string | null; liveRank: number | null } | null;
  best: { earned: number; golfer: string; event: string; week: number } | null;
  /** Picks in final events, and how many of them made the cut. */
  picks: number;
  cuts: number;
  wins: number;
  top10s: number;
  /** Final events with no pick. */
  missed: number;
  weeklyWins: number;
  log: StandingLogRow[];
};

export type WeeklyWinner = { week: number; event: string; winners: { name: string; golfer: string; isMe: boolean }[]; earned: number };

export type GolfStandingsData = {
  rows: StandingRow[];
  weekly: WeeklyWinner[];
  /** Entries with the most weekly wins, most first. */
  weeklyLeaders: { name: string; wins: number; isMe: boolean }[];
  current: { name: string; week: number; open: boolean; live: boolean } | null;
  /** Events played so far (final or under way), in order. */
  played: { week: number; name: string; final: boolean }[];
  lastFinal: { name: string; week: number } | null;
  finalCount: number;
};

/** Competition ranking: 1, 2, 2, 4. */
function places(totals: Map<string, number>) {
  const sorted = [...totals.values()].sort((a, b) => b - a);
  return new Map([...totals].map(([id, t]) => [id, { place: sorted.indexOf(t) + 1, tied: sorted.filter((x) => x === t).length > 1 }]));
}

export async function getGolfStandingsData(ctx: GolfContext, now: number): Promise<GolfStandingsData> {
  const [events, members, picks] = await Promise.all([getGolfEvents(ctx), getGolfMembers(ctx), getGolfVisiblePicks(ctx)]);
  const counted = events.filter((e) => e.status !== "canceled");
  const weekOf = new Map<string, number>(counted.map((e, i) => [e.id, i + 1] as [string, number]));
  const played = counted.filter((e) => e.status === "final" || e.status === "in_progress");
  const finals = counted.filter((e) => e.status === "final");
  const lastFinal = finals[finals.length - 1] ?? null;
  const { current } = golfWeek(events, now);
  const currentOpen = current ? isOpenForPicks(current, now) : false;

  const [results, live] = await Promise.all([
    getGolfResultsFor(ctx, played.map((e) => e.id), [...new Set(picks.map((p) => p.espn_golfer_id))]),
    current?.status === "in_progress" ? getLiveLeaderboard(current.espn_id, 120) : Promise.resolve(null),
  ]);
  const liveById = new Map((live ?? []).map((g) => [g.id, g]));
  const pickOf = new Map<string, GolfPick>(picks.map((p) => [`${p.user_id}|${p.event_id}`, p] as [string, GolfPick]));

  // Per entry: the season log, totals and stats.
  const base = members.map((m) => {
    const log: (StandingLogRow & { eventId: string; place: number })[] = played.map((e) => {
      const pick = pickOf.get(`${m.user_id}|${e.id}`);
      const result = pick ? results.get(`${e.id}|${pick.espn_golfer_id}`) : undefined;
      const final = e.status === "final";
      return {
        eventId: e.id,
        week: weekOf.get(e.id)!,
        event: e.name,
        golfer: pick?.golfer_name ?? null,
        finish: pick ? finishLabel(result?.pos, final) : "",
        earned: final ? (result?.earnings ?? 0) : 0,
        final,
        place: posRank(result?.pos ?? null),
      };
    });
    const done = log.filter((r) => r.final);
    const picked = done.filter((r) => r.golfer);
    const best = picked.reduce<(typeof picked)[number] | null>((b, r) => (r.earned > (b?.earned ?? 0) ? r : b), null);
    return {
      m,
      log,
      total: done.reduce((sum, r) => sum + r.earned, 0),
      lastEarned: lastFinal ? (log.find((r) => r.eventId === lastFinal.id)?.earned ?? 0) : 0,
      picks: picked.length,
      cuts: picked.filter((r) => r.place < 9999).length,
      wins: picked.filter((r) => r.place === 1).length,
      top10s: picked.filter((r) => r.place <= 10).length,
      missed: done.length - picked.length,
      best: best ? { earned: best.earned, golfer: best.golfer!, event: best.event, week: best.week } : null,
    };
  });

  // Who earned the most each finished week (ties share it; a week nobody earned has no winner).
  const weekly: WeeklyWinner[] = finals
    .map((e) => {
      const rows = base.map((b) => ({ b, r: b.log.find((r) => r.eventId === e.id)! }));
      const top = Math.max(0, ...rows.map(({ r }) => r.earned));
      return {
        week: weekOf.get(e.id)!,
        event: e.name,
        earned: top,
        winners: top > 0 ? rows.filter(({ r }) => r.earned === top).map(({ b, r }) => ({ name: b.m.display_name, golfer: r.golfer ?? "", isMe: b.m.user_id === ctx.entryUserId, id: b.m.user_id })) : [],
      };
    })
    .reverse();
  const weeklyWins = new Map<string, number>();
  for (const w of weekly) for (const x of w.winners as (WeeklyWinner["winners"][number] & { id: string })[]) weeklyWins.set(x.id, (weeklyWins.get(x.id) ?? 0) + 1);

  const now_ = places(new Map(base.map((b) => [b.m.user_id, b.total])));
  const before = places(new Map(base.map((b) => [b.m.user_id, b.total - b.lastEarned])));
  const leader = Math.max(0, ...base.map((b) => b.total));

  const rows: StandingRow[] = base
    .map((b) => {
      const id = b.m.user_id;
      const isMe = id === ctx.entryUserId;
      const lastRow = lastFinal ? b.log.find((r) => r.eventId === lastFinal.id) : undefined;
      const curPick = current ? pickOf.get(`${id}|${current.id}`) : undefined;
      const g = curPick ? liveById.get(curPick.espn_golfer_id) : undefined;
      const liveLine = g
        ? [g.pos !== "-" ? g.pos : g.out, g.toPar ? formatToPar(g.toPar) : null, g.thru ? (g.thru === "F" ? "F" : `Thru ${g.thru}`) : null].filter(Boolean).join(" · ")
        : null;
      return {
        userId: id,
        name: b.m.display_name,
        isMe,
        place: now_.get(id)!.place,
        tied: now_.get(id)!.tied,
        move: finals.length >= 2 ? before.get(id)!.place - now_.get(id)!.place : null,
        total: b.total,
        behind: leader - b.total,
        lastWeek: lastRow ? { golfer: lastRow.golfer, finish: lastRow.finish, earned: lastRow.earned } : null,
        // Other entries' picks for an open event aren't sent to the viewer at all.
        thisWeek: current ? { golfer: curPick?.golfer_name ?? null, hidden: currentOpen && !isMe && !curPick, live: liveLine || null, liveRank: g ? posRank(g.pos) : null } : null,
        best: b.best && b.best.earned > 0 ? b.best : null,
        picks: b.picks,
        cuts: b.cuts,
        wins: b.wins,
        top10s: b.top10s,
        missed: b.missed,
        weeklyWins: weeklyWins.get(id) ?? 0,
        log: b.log.map(({ week, event, golfer, finish, earned, final }) => ({ week, event, golfer, finish, earned, final })),
      };
    })
    .sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));

  return {
    rows,
    weekly: weekly.map((w) => ({ ...w, winners: w.winners.map(({ name, golfer, isMe }) => ({ name, golfer, isMe })) })),
    weeklyLeaders: rows
      .filter((r) => r.weeklyWins > 0)
      .map((r) => ({ name: r.name, wins: r.weeklyWins, isMe: r.isMe }))
      .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name)),
    played: played.map((e) => ({ week: weekOf.get(e.id)!, name: e.name, final: e.status === "final" })),
    current: current ? { name: current.name, week: weekOf.get(current.id)!, open: currentOpen, live: current.status === "in_progress" } : null,
    lastFinal: lastFinal ? { name: lastFinal.name, week: weekOf.get(lastFinal.id)! } : null,
    finalCount: finals.length,
  };
}
