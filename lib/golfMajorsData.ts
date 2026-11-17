import "server-only";
import { cache } from "react";
import { allRows, type GolfEvent } from "./golf";
import type { PoolBase } from "./pool";
import { majorsSettings, scoreLineup, majorStandings, type FieldGolfer, type MajorResult, type MajorsSettings, type Scorecard } from "./golfMajors";

export type LineupRow = { user_id: string; event_id: string; espn_golfer_id: string; golfer_name: string; tier: number | null; salary: number | null };

export function getMajorsSettings(ctx: PoolBase): MajorsSettings {
  return majorsSettings(ctx.pool.settings);
}

/** A major's field as the admin saved it (tiers, salaries), strongest first. */
export const getMajorField = cache(async (ctx: PoolBase, eventId: string): Promise<FieldGolfer[]> => {
  const rows = await allRows<FieldGolfer>((from, to) =>
    ctx.supabase
      .from("golf_field")
      .select("espn_golfer_id, golfer_name, world_rank, odds, tier, salary")
      .eq("event_id", eventId)
      .order("tier", { nullsFirst: false })
      .order("salary", { ascending: false, nullsFirst: false })
      .order("world_rank", { nullsFirst: false })
      .order("golfer_name")
      .range(from, to),
  );
  return rows;
});

/** Every lineup row the viewer can see (their own; everyone's once a major has started). */
export const getVisibleLineups = cache(async (ctx: PoolBase): Promise<LineupRow[]> => {
  return allRows<LineupRow>((from, to) =>
    ctx.supabase
      .from("golf_lineups")
      .select("user_id, event_id, espn_golfer_id, golfer_name, tier, salary")
      .eq("pool_id", ctx.pool.id)
      .order("event_id")
      .order("user_id")
      .order("espn_golfer_id")
      .range(from, to),
  );
});

/** Results for these majors, for scoring. */
export const getMajorResults = cache(async (ctx: PoolBase, eventIds: string[]): Promise<Map<string, MajorResult[]>> => {
  const out = new Map<string, MajorResult[]>(eventIds.map((id) => [id, []]));
  if (!eventIds.length) return out;
  type Row = Omit<MajorResult, "scorecard" | "earnings"> & { event_id: string; earnings: number; scorecard: unknown };
  const rows = await allRows<Row>((from, to) =>
    ctx.supabase
      .from("golf_results")
      .select("event_id, espn_golfer_id, pos, to_par, out, thru, earnings, rounds, scorecard")
      .in("event_id", eventIds)
      .order("event_id")
      .order("espn_golfer_id")
      .range(from, to),
  );
  for (const r of rows) {
    out.get(r.event_id)?.push({ ...r, earnings: Number(r.earnings), scorecard: (r.scorecard as Scorecard | null) ?? null });
  }
  return out;
});

/** Stored odds to win (American) by golfer name for one tournament market. */
export async function getStoredOdds(ctx: PoolBase, oddsKey: string): Promise<{ odds: Map<string, number>; updatedAt: string | null }> {
  const { data } = await ctx.supabase.from("golf_odds").select("golfer_name, price, updated_at").eq("odds_key", oddsKey);
  const rows = data ?? [];
  return {
    odds: new Map(rows.map((r) => [r.golfer_name, r.price])),
    updatedAt: rows.map((r) => r.updated_at).sort().at(-1) ?? null,
  };
}

/**
 * Scores and standings for the pool's majors: each entry's score per major (lineups grouped by
 * entry), and standings over the given majors. Only majors that have started count.
 */
export async function getMajorsScoreboard(ctx: PoolBase, events: GolfEvent[], members: { user_id: string }[]) {
  const s = getMajorsSettings(ctx);
  const started = events.filter((e) => e.status === "in_progress" || e.status === "final");
  const [lineups, results] = await Promise.all([getVisibleLineups(ctx), getMajorResults(ctx, started.map((e) => e.id))]);
  const byEntry = new Map<string, LineupRow[]>();
  for (const l of lineups) {
    const k = `${l.user_id}|${l.event_id}`;
    if (!byEntry.has(k)) byEntry.set(k, []);
    byEntry.get(k)!.push(l);
  }
  const scores = new Map<string, ReturnType<typeof scoreLineup>>();
  for (const e of started) {
    const res = results.get(e.id) ?? [];
    for (const m of members) {
      const rows = byEntry.get(`${m.user_id}|${e.id}`);
      if (rows?.length) scores.set(`${m.user_id}|${e.id}`, scoreLineup(rows.map((r) => r.espn_golfer_id), res, s, e.status === "final"));
    }
  }
  const standingsFor = (eventIds: string[]) =>
    majorStandings(
      members.map((m) => m.user_id),
      eventIds,
      (u, e) => scores.get(`${u}|${e}`)?.total,
      s,
    );
  return { settings: s, lineups: byEntry, scores, results, standingsFor, started };
}
