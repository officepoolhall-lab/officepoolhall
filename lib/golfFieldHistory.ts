import "server-only";
import type { GolfEvent } from "./golf";
import { getTournamentHistory } from "./golfHistory";
import type { PoolBase } from "./pool";

// Everything the History pop-up shows, for the whole field at once, loaded while the My Picks
// page renders. Fetches made during a page render use the saved copies of ESPN's old
// leaderboards; the same fetches from a per-click server action would re-read ESPN every time,
// which is what made the pop-up slow.

export type FieldHistory = {
  eventName: string;
  /** Earlier years of this tournament that were found, newest first. */
  years: { year: number; formerName: string | null }[];
  /** Per golfer id: one entry per year above; null when they didn't play that year. */
  at: Record<string, ({ pos: string | null; toPar: string | null; earnings: number } | null)[]>;
  /** This season's events played so far (final or under way), in order. */
  played: { week: number; name: string; final: boolean }[];
  /** Per golfer id: the events above they played (`i` indexes `played`). */
  season: Record<string, { i: number; pos: string | null; earnings: number }[]>;
};

const PAGE = 1000;

/** Never rejects: whatever can't be loaded is left empty, and the pop-up says so. */
export async function loadFieldHistory(ctx: PoolBase, event: GolfEvent, events: GolfEvent[], golferIds: string[]): Promise<FieldHistory> {
  const counted = events.filter((e) => e.status !== "canceled");
  const playedEvents = counted.map((e, i) => ({ e, week: i + 1 })).filter(({ e }) => e.status === "final" || e.status === "in_progress");
  const index = new Map(playedEvents.map(({ e }, i) => [e.id, i]));

  const seasonRows = async () => {
    const rows: { event_id: string; espn_golfer_id: string; pos: string | null; earnings: number }[] = [];
    if (!playedEvents.length || !golferIds.length) return rows;
    // The API returns at most 1,000 rows a request; a full season for a full field is more.
    for (let from = 0; ; from += PAGE) {
      const { data } = await ctx.supabase
        .from("golf_results")
        .select("event_id, espn_golfer_id, pos, earnings")
        .in("event_id", playedEvents.map(({ e }) => e.id))
        .in("espn_golfer_id", golferIds)
        .order("event_id")
        .order("espn_golfer_id")
        .range(from, from + PAGE - 1);
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) return rows;
    }
  };

  const [rows, history] = await Promise.all([
    seasonRows().catch(() => []),
    getTournamentHistory(event.name, ctx.pool.season).catch(() => []),
  ]);

  const season: FieldHistory["season"] = {};
  for (const r of rows) {
    const i = index.get(r.event_id);
    if (i === undefined) continue;
    (season[r.espn_golfer_id] ??= []).push({ i, pos: r.pos, earnings: Number(r.earnings) });
  }
  for (const list of Object.values(season)) list.sort((a, b) => a.i - b.i);

  const at: FieldHistory["at"] = {};
  for (const id of golferIds) {
    at[id] = history.map((y) => {
      const g = y.golfers.get(id);
      // A numbered place, else why they didn't finish (MC, WD, DQ).
      return g ? { pos: g.pos !== "-" ? g.pos : g.out, toPar: g.toPar, earnings: g.earnings } : null;
    });
  }

  return {
    eventName: event.name,
    years: history.map((y) => ({ year: y.year, formerName: y.renamed ? y.name : null })),
    at,
    played: playedEvents.map(({ e, week }) => ({ week, name: e.name, final: e.status === "final" })),
    season,
  };
}
