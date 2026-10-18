import { describe, expect, it } from "vitest";
import { possiblePoints, slotValuesFor } from "./possible";

const tiers = slotValuesFor({ picks_per_slate: 4, confidence: { tiers: [{ points: 5, count: 2 }, { points: 3, count: 2 }] }, scoring: { win: 1 } });
const flat = slotValuesFor({ picks_per_slate: 5, confidence: null, scoring: { win: 1 } });

describe("slotValuesFor", () => {
  it("expands confidence tiers and repeats the flat win value", () => {
    expect(tiers).toEqual([5, 5, 3, 3]);
    expect(flat).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("possiblePoints", () => {
  it("is the whole slate before anything is picked", () => {
    expect(possiblePoints({ points: 0, picks: [], openGameIds: ["a", "b", "c", "d", "e"], slotValues: tiers })).toBe(16);
  });

  it("drops a lost pick's value and keeps a won one", () => {
    const picks = [
      { game_id: "a", confidence: 5, result: "win" },
      { game_id: "b", confidence: 5, result: "loss" },
      { game_id: "c", confidence: 3, result: null },
    ];
    // 5 earned + 3 pending + one 3 left for the one open game.
    expect(possiblePoints({ points: 5, picks, openGameIds: ["d"], slotValues: tiers })).toBe(11);
  });

  it("counts minus-points losses through the current total", () => {
    const picks = [{ game_id: "a", confidence: 5, result: "loss" }];
    expect(possiblePoints({ points: -5, picks, openGameIds: ["b", "c", "d"], slotValues: tiers })).toBe(6);
  });

  it("places unused slots highest first, only on open unpicked games", () => {
    // Hidden picks on open games look unpicked: 2 open games take the two 5s.
    expect(possiblePoints({ points: 0, picks: [], openGameIds: ["a", "b"], slotValues: tiers })).toBe(10);
  });

  it("works for flat pools", () => {
    const picks = [
      { game_id: "a", confidence: null, result: "win" },
      { game_id: "b", confidence: null, result: "loss" },
      { game_id: "c", confidence: null, result: null },
    ];
    expect(possiblePoints({ points: 1, picks, openGameIds: ["d", "e", "f"], slotValues: flat })).toBe(4);
  });

  it("never goes above 5 in the NCAAF Supercontest, however many games are open", () => {
    const sc = slotValuesFor({ picks_per_slate: 5, confidence: null, scoring: { win: 1 } });
    const twenty = Array.from({ length: 20 }, (_, i) => `g${i}`);
    expect(possiblePoints({ points: 0, picks: [], openGameIds: twenty, slotValues: sc })).toBe(5);
    // 2 wins + a push (0.5) = 2.5 so far; a loss is gone; one pick still to play.
    const picks = [
      { game_id: "a", confidence: null, result: "win" },
      { game_id: "b", confidence: null, result: "win" },
      { game_id: "c", confidence: null, result: "push" },
      { game_id: "d", confidence: null, result: "loss" },
      { game_id: "e", confidence: null, result: null },
    ];
    expect(possiblePoints({ points: 2.5, picks, openGameIds: twenty, slotValues: sc })).toBe(3.5);
  });

  it("is the current total once everything is decided and locked", () => {
    expect(possiblePoints({ points: 7.5, picks: [], openGameIds: [], slotValues: tiers })).toBe(7.5);
  });
});
