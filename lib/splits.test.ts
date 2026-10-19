import { describe, expect, it } from "vitest";
import { inSplit, rankBySplit, splitRecords, type SplitPick } from "./splits";

const pick = (over: Partial<SplitPick>): SplitPick => ({
  user_id: "a",
  picked_side: "home",
  result: "win",
  points: 1,
  homeSpread: -3.5,
  neutral: false,
  ...over,
});

describe("inSplit", () => {
  it("home team laying points is a favorite; taking points is an underdog", () => {
    expect(inSplit(pick({ picked_side: "home", homeSpread: -3.5 }), "fav")).toBe(true);
    expect(inSplit(pick({ picked_side: "away", homeSpread: -3.5 }), "dog")).toBe(true);
    expect(inSplit(pick({ picked_side: "away", homeSpread: 7 }), "fav")).toBe(true);
    expect(inSplit(pick({ picked_side: "home", homeSpread: 7 }), "dog")).toBe(true);
  });
  it("a pick'em or a missing line is neither favorite nor underdog", () => {
    expect(inSplit(pick({ homeSpread: 0 }), "fav")).toBe(false);
    expect(inSplit(pick({ homeSpread: 0 }), "dog")).toBe(false);
    expect(inSplit(pick({ homeSpread: null }), "fav")).toBe(false);
  });
  it("neutral-site games count for neither home nor away", () => {
    expect(inSplit(pick({ picked_side: "home", neutral: true }), "home")).toBe(false);
    expect(inSplit(pick({ picked_side: "away", neutral: true }), "away")).toBe(false);
    expect(inSplit(pick({ picked_side: "away" }), "away")).toBe(true);
  });
});

describe("splitRecords + rankBySplit", () => {
  const picks = [
    pick({ user_id: "a", result: "win" }),
    pick({ user_id: "a", result: "loss", points: 0 }),
    pick({ user_id: "a", result: "push", points: 0.5 }),
    pick({ user_id: "a", result: null }), // pending
    pick({ user_id: "a", result: "void", points: 0 }),
    pick({ user_id: "b", result: "win" }),
    pick({ user_id: "b", result: "win" }),
    pick({ user_id: "b", picked_side: "away", result: "loss", points: 0 }), // underdog: not a favorite
  ];

  it("counts only graded picks in the split", () => {
    const fav = splitRecords(picks, "fav");
    expect(fav.get("a")).toEqual({ wins: 1, losses: 1, pushes: 1, points: 1.5 });
    expect(fav.get("b")).toEqual({ wins: 2, losses: 0, pushes: 0, points: 2 });
    expect(splitRecords(picks, "dog").get("b")).toEqual({ wins: 0, losses: 1, pushes: 0, points: 0 });
  });

  it("ranks by win %, then wins; nothing decided goes last", () => {
    const fav = splitRecords(picks, "fav");
    const rows = ["a", "b", "c"].map((id) => ({ name: id, ...(fav.get(id) ?? { wins: 0, losses: 0, pushes: 0, points: 0 }) }));
    expect(rankBySplit(rows).map((r) => [r.name, r.rank])).toEqual([["b", 1], ["a", 2], ["c", 3]]);
  });
});
