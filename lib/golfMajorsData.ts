import "server-only";
import { cache } from "react";
import { allRows, type GolfEvent } from "./golf";
import type { PoolBase } from "./pool";
import { getEventInfo } from "./golfEventInfo";
import { majorsSettings, purseOverride, scoreLineup, majorStandings, withProjectedEarnings, type FieldGolfer, type MajorResult, type MajorsSettings, type Scorecard } from "./golfMajors";

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
export type SortKey = "score" | "name" | "toPar" | "money";

/**
 * Scores and standings for the pool's majors. Each entry's score per major (the pool's own
 * scoring; prize money projected from the leaderboard and the purse until it's final), plus
 * the same lineup's total score to par and prize money, for sorting. Only majors that have
 * started count. `results` carries projected prize money while a major is being played.
 */
export async function getMajorsScoreboard(ctx: PoolBase, events: GolfEvent[], members: { user_id: string }[]) {
  const s = getMajorsSettings(ctx);
  const started = events.filter((e) => e.status === "in_progress" || e.status === "final");
  const [lineups, raw, info] = await Promise.all([
    getVisibleLineups(ctx),
    getMajorResults(ctx, started.map((e) => e.id)),
    started.length ? getEventInfo(started, ctx.pool.slug) : Promise.resolve(new Map()),
  ]);
  const results = new Map<string, MajorResult[]>();
  // The purse: the commissioner's, else ESPN's. Projected prize money is worked out from it.
  const purses = new Map<string, { purse: number | null }>();
  for (const e of started) {
    const purse: number | null = purseOverride(ctx.pool.settings, e.id) ?? (info.get(e.id) as { purse?: number | null } | undefined)?.purse ?? null;
    purses.set(e.id, { purse });
    results.set(e.id, withProjectedEarnings(raw.get(e.id) ?? [], purse, e.status === "final"));
  }

  const byEntry = new Map<string, LineupRow[]>();
  for (const l of lineups) {
    const k = `${l.user_id}|${l.event_id}`;
    if (!byEntry.has(k)) byEntry.set(k, []);
    byEntry.get(k)!.push(l);
  }
  // The same counting rule (best N) scored three ways.
  const asToPar: MajorsSettings = { ...s, contest: "tiers", tiers: { ...s.tiers, scoring: "to_par", counting: s.contest === "salary" ? s.salary.roster : s.tiers.counting } };
  const asMoney: MajorsSettings = { ...asToPar, tiers: { ...asToPar.tiers, scoring: "earnings" } };
  const scores = new Map<string, ReturnType<typeof scoreLineup>>();
  const toPar = new Map<string, number | null>();
  const money = new Map<string, number | null>();
  for (const e of started) {
    const res = results.get(e.id) ?? [];
    const final = e.status === "final";
    for (const m of members) {
      const k = `${m.user_id}|${e.id}`;
      const rows = byEntry.get(k);
      if (!rows?.length) continue;
      const ids = rows.map((r) => r.espn_golfer_id);
      scores.set(k, scoreLineup(ids, res, s, final));
      toPar.set(k, scoreLineup(ids, res, asToPar, final).total);
      money.set(k, scoreLineup(ids, res, asMoney, final).total);
    }
  }
  const standingsFor = (eventIds: string[]) =>
    majorStandings(
      members.map((m) => m.user_id),
      eventIds,
      (u, e) => scores.get(`${u}|${e}`)?.total,
      s,
    );
  /** An entry's total over these majors by score to par or prize money (null with no lineup). */
  const totalFor = (by: "toPar" | "money", userId: string, eventIds: string[]) => {
    const m = by === "toPar" ? toPar : money;
    const vals = eventIds.map((e) => m.get(`${userId}|${e}`)).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  return { settings: s, lineups: byEntry, scores, results, standingsFor, totalFor, started, purses };
}
