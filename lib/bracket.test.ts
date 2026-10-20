import { describe, expect, it } from "vitest";
import { choose, eliminatedTeams, gameTeams, gamesIn, prunePicks, roundPoints, scoreBracket, seedOf } from "./bracket";

const field = Array.from({ length: 64 }, (_, i) => `t${i}`);
// Chalk: the top line of every game wins; the winner of game g in round r is slot g·2^r.
const chalk = () => {
  const p: Record<string, string> = {};
  for (let r = 1; r <= 6; r++) for (let g = 0; g < gamesIn(r); g++) p[`${r}-${g}`] = `t${g * (1 << r)}`;
  return p;
};

describe("bracket", () => {
  it("seeds positions in bracket order", () => {
    expect([0, 1, 2, 3, 14, 15, 16].map(seedOf)).toEqual([1, 16, 8, 9, 2, 15, 1]);
  });

  it("scores by round and seed, per the sheet", () => {
    expect([1, 8, 9, 12, 13, 14, 15, 16].map((s) => roundPoints(1, s))).toEqual([2, 2, 3, 3, 4, 4, 5, 5]);
    expect([1, 4, 5, 6, 7, 12, 13, 14, 15].map((s) => roundPoints(2, s))).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 7]);
    expect([2, 3, 5, 7, 9, 13].map((s) => roundPoints(3, s))).toEqual([5, 6, 7, 8, 9, 10]);
    expect([1, 2, 3, 5, 7, 9, 13].map((s) => roundPoints(4, s))).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect([1, 2, 4, 6, 8, 12, 16].map((s) => roundPoints(5, s))).toEqual([10, 12, 14, 15, 16, 18, 20]);
    expect([1, 2, 3, 6, 7, 10, 13].map((s) => roundPoints(6, s))).toEqual([12, 14, 16, 18, 20, 22, 24]);
  });

  it("finds a game's teams from the field, then from winners", () => {
    expect(gameTeams(1, 3, field, {})).toEqual(["t6", "t7"]);
    expect(gameTeams(2, 0, field, { "1-0": "t1" })).toEqual(["t1", null]);
  });

  it("changing a pick clears later picks of the team it replaced", () => {
    const p = chalk();
    const next = choose(p, 1, 0, "t1");
    expect(next["1-0"]).toBe("t1");
    expect(next["2-0"]).toBeUndefined();
    expect(next["6-0"]).toBeUndefined();
    expect(next["1-1"]).toBe("t2"); // the other side is untouched
    // Tapping the same pick again clears it.
    expect(choose({ "1-0": "t1" }, 1, 0, "t1")["1-0"]).toBeUndefined();
  });

  it("scores a bracket and what it could still reach", () => {
    const results = { "1-0": "t1", "1-1": "t2" }; // a 16 seed upsets the 1; the 8 seed wins
    const s = scoreBracket(chalk(), results, field);
    expect(s.points).toBe(2);
    expect(s.correct).toBe(1);
    // t0 is out, so every later chalk pick of t0 (rounds 2–6) can't score.
    expect(eliminatedTeams(field, results)).toEqual(new Set(["t0", "t3"]));
    const full = scoreBracket(chalk(), {}, field).possible;
    const lost = roundPoints(1, 1) + roundPoints(2, 1) + roundPoints(3, 1) + roundPoints(4, 1) + roundPoints(5, 1) + roundPoints(6, 1);
    expect(s.possible).toBe(full - lost);
  });

  it("prunes picks that no longer follow the bracket", () => {
    const p = { ...chalk(), "1-0": "t1" }; // the 1 seed's later picks now have no path
    const out = prunePicks(p, field);
    expect(out["1-0"]).toBe("t1");
    expect(out["2-0"]).toBeUndefined();
    expect(out["1-1"]).toBe("t2");
  });
});
