import { describe, expect, it } from "vitest";
import {
  buildSalaries,
  buildTiers,
  fantasyPoints,
  finishPoints,
  majorsSettings,
  majorStandings,
  scoreLineup,
  toParScores,
  type FieldGolfer,
  type MajorResult,
} from "./golfMajors";

const golfer = (id: string, rank: number | null, odds: number | null): FieldGolfer => ({
  espn_golfer_id: id,
  golfer_name: `Golfer ${id}`,
  world_rank: rank,
  odds,
  tier: null,
  salary: null,
});
const result = (id: string, to_par: number | null, extra: Partial<MajorResult> = {}): MajorResult => ({
  espn_golfer_id: id,
  pos: null,
  to_par,
  out: false,
  thru: 18,
  earnings: 0,
  rounds: null,
  scorecard: null,
  ...extra,
});

describe("majorsSettings", () => {
  it("defaults to 6 tiers, 8 golfers, all counting, score to par", () => {
    const s = majorsSettings({});
    expect(s.contest).toBe("tiers");
    expect(s.tiers.picks).toEqual([1, 1, 1, 1, 1, 3]);
    expect(s.tiers.counting).toBe(8);
    expect(s.tiers.scoring).toBe("to_par");
    expect(s.salary).toMatchObject({ budget: 50000, roster: 8 });
  });
  it("uses the default picks for the tier count", () => {
    expect(majorsSettings({ majors: { tiers: { count: 4 } } }).tiers.picks).toEqual([2, 2, 2, 2]);
    expect(majorsSettings({ majors: { tiers: { count: 8 } } }).tiers.picks).toHaveLength(8);
  });
});

describe("buildTiers", () => {
  it("fills tiers in strength order, the last tier taking the rest", () => {
    const field = Array.from({ length: 40 }, (_, i) => golfer(String(i + 1), i + 1, null));
    const tiers = buildTiers(field, [5, 5, 5, 5, 5, 0], "rank");
    expect(tiers.filter((g) => g.tier === 1).map((g) => g.espn_golfer_id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(tiers.filter((g) => g.tier === 6)).toHaveLength(15);
  });
  it("orders by odds when asked", () => {
    const field = [golfer("a", 1, 2000), golfer("b", 50, 400), golfer("c", 10, 1000)];
    expect(buildTiers(field, [1, 0], "odds").find((g) => g.tier === 1)!.espn_golfer_id).toBe("b");
  });
});

describe("buildSalaries", () => {
  it("prices the best golfer at the max and the worst at the min, in $100 steps", () => {
    const field = Array.from({ length: 100 }, (_, i) => golfer(String(i + 1), i + 1, (i + 1) * 100));
    const priced = buildSalaries(field, { min: 4000, max: 10000, rankWeight: 0.5 });
    expect(priced[0].salary).toBe(10000);
    expect(priced[99].salary).toBe(4000);
    expect(priced.every((g) => g.salary! % 100 === 0)).toBe(true);
    // Eight average golfers fit the $50,000 budget.
    const avg = priced.reduce((t, g) => t + g.salary!, 0) / priced.length;
    expect(avg * 8).toBeLessThan(50000);
  });
});

describe("toParScores", () => {
  it("gives a golfer out of the event the worst score among those still in it", () => {
    const tp = toParScores([result("a", -10), result("b", 4), result("c", 6, { out: true })]);
    expect(tp.get("c")).toBe(4);
    expect(tp.get("a")).toBe(-10);
  });
});

describe("scoreLineup", () => {
  it("counts the best N scores to par", () => {
    const s = majorsSettings({ majors: { tiers: { counting: 2 } } });
    const r = scoreLineup(["a", "b", "c"], [result("a", -5), result("b", 2), result("c", -1)], s, false);
    expect(r.total).toBe(-6);
    expect(r.golfers.find((g) => g.espn_golfer_id === "b")!.counts).toBe(false);
  });
  it("counts the most prize money for earnings pools", () => {
    const s = majorsSettings({ majors: { tiers: { scoring: "earnings", counting: 1 } } });
    const r = scoreLineup(["a", "b"], [result("a", 0, { earnings: 100 }), result("b", 0, { earnings: 500 })], s, true);
    expect(r.total).toBe(500);
  });
});

describe("fantasyPoints", () => {
  const holes = (scores: number[]) => scores.map((strokes, i) => ({ hole: i + 1, par: 4, strokes }));
  it("scores holes, a birdie streak and a bogey-free round", () => {
    // Three birdies in a row, then pars: 3×3 + 15×0.5 = 16.5, +3 streak, +3 bogey-free.
    const card = { rounds: [{ round: 1, holes: holes([3, 3, 3, ...Array(15).fill(4)]) }] };
    const p = fantasyPoints(result("a", -3, { scorecard: card }), false);
    expect(p.holes).toBe(16.5);
    expect(p.streaks).toBe(3);
    expect(p.bogeyFree).toBe(3);
    expect(p.total).toBe(22.5);
  });
  it("adds place points once final, none for a missed cut", () => {
    expect(finishPoints(1)).toBe(30);
    expect(finishPoints(12)).toBe(6);
    expect(finishPoints(51)).toBe(0);
    expect(fantasyPoints(result("a", 0, { pos: "T3" }), true).finish).toBe(18);
    expect(fantasyPoints(result("a", 0, { pos: "T3", out: true }), true).finish).toBe(0);
  });
});

describe("majorStandings", () => {
  it("adds majors together and gives a missing lineup the worst score to par", () => {
    const s = majorsSettings({});
    const scores: Record<string, Record<string, number>> = { u1: { m1: -5, m2: 1 }, u2: { m1: -2 } };
    const rows = majorStandings(["u1", "u2"], ["m1", "m2"], (u, e) => scores[u]?.[e], s);
    expect(rows.map((r) => [r.user_id, r.total])).toEqual([
      ["u1", -4],
      ["u2", -1],
    ]);
  });
});
