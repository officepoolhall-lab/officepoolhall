import { describe, expect, it } from "vitest";
import { PRESETS, evenTiers, parsePoolSettings, settingsError } from "./poolSettings";
import { nextWindowStartDate, slateWindow } from "./slateWindow";

const poolA = PRESETS.ncaab_confidence.settings;
const poolB = PRESETS.ncaaf_ats.settings;

describe("pool settings", () => {
  it("accepts both presets", () => {
    expect(parsePoolSettings(poolA).success).toBe(true);
    expect(parsePoolSettings(poolB).success).toBe(true);
  });

  it("Pool A is seven each of 5/4/3/2/1", () => {
    expect(poolA.confidence.tiers).toEqual([5, 4, 3, 2, 1].map((points) => ({ points, count: 7 })));
  });

  it("25-pick variant is five per tier", () => {
    const s = { ...poolA, picks_per_slate: 25, confidence: { tiers: evenTiers(25) } };
    expect(parsePoolSettings(s).success).toBe(true);
    expect(s.confidence.tiers.every((t) => t.count === 5)).toBe(true);
  });

  it("rejects tiers that don't add up to picks_per_slate", () => {
    expect(settingsError({ ...poolA, picks_per_slate: 25 })).toMatch(/add up to 35 but picks per slate is 25/);
  });

  it("rejects duplicate tier values", () => {
    const s = { ...poolA, picks_per_slate: 2, confidence: { tiers: [{ points: 5, count: 1 }, { points: 5, count: 1 }] } };
    expect(settingsError(s)).toMatch(/different point value/);
  });

  it("weekly lock needs a day and time", () => {
    expect(settingsError({ ...poolB, lock: { mode: "weekly" } })).toMatch(/Weekly lock/);
    expect(parsePoolSettings({ ...poolB, lock: { mode: "weekly", weekly: { weekday: 2, time: "19:00" } } }).success).toBe(true);
  });

  it("rejects an unknown time zone", () => {
    expect(settingsError({ ...poolA, timezone: "Mars/Olympus" })).toMatch(/time zone/);
  });
});

describe("slate window", () => {
  it("Mon 00:00 → next Mon 00:00 Central (CST)", () => {
    const w = slateWindow("2026-11-02", poolA);
    expect(w.window_start.toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(w.window_end.toISOString()).toBe("2026-11-09T06:00:00.000Z");
    expect(w.lock_at).toBeNull();
  });

  it("handles the DST change inside a window", () => {
    // DST ends Sun Nov 1 2026 at 2am; a window starting Mon Oct 26 begins in CDT and ends in CST.
    const w = slateWindow("2026-10-26", poolA);
    expect(w.window_start.toISOString()).toBe("2026-10-26T05:00:00.000Z");
    expect(w.window_end.toISOString()).toBe("2026-11-02T06:00:00.000Z");
  });

  it("weekly lock lands on the first lock day in the window", () => {
    const s = { ...poolB, lock: { mode: "weekly" as const, weekly: { weekday: 2 as const, time: "19:00" } } };
    expect(slateWindow("2026-11-02", s).lock_at?.toISOString()).toBe("2026-11-04T01:00:00.000Z"); // Tue 7pm CST
  });

  it("next window start is the upcoming Monday", () => {
    // Sun Nov 1 2026, noon Central → Mon Nov 2
    expect(nextWindowStartDate(new Date("2026-11-01T18:00:00Z"), poolA)).toBe("2026-11-02");
    // Mon Nov 2, 10am Central → that window has started, so Mon Nov 9
    expect(nextWindowStartDate(new Date("2026-11-02T16:00:00Z"), poolA)).toBe("2026-11-09");
  });
});
