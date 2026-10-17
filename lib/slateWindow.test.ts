import { describe, expect, it } from "vitest";
import { PRESETS, type PoolSettings } from "./poolSettings";
import { localDate, slateWindow } from "./slateWindow";

const poolA = PRESETS.ncaab_confidence.settings;
const poolB = PRESETS.ncaaf_ats.settings;
// The two-deadline variant (Monday games due Mon 5pm, the rest Tue 5pm) is still supported.
const twoDeadlines: PoolSettings = { ...poolA, lock: { mode: "weekly", weekly: { weekday: 2, time: "17:00", first_day_time: "17:00" } } };

describe("Pool A deadline", () => {
  it("a normal week: everything due Wed noon CST, no separate Monday deadline", () => {
    const w = slateWindow("2026-11-09", poolA);
    expect(w.first_day_lock_at).toBeNull();
    expect(w.lock_at?.toISOString()).toBe("2026-11-11T18:00:00.000Z"); // Wed 12:00 CST
  });

  it("Week 1 (Sun Nov 1 – Sun Nov 8) is due Wed Nov 4 at noon", () => {
    const w = slateWindow("2026-11-01", poolA, "2026-11-08");
    expect(w.lock_at?.toISOString()).toBe("2026-11-04T18:00:00.000Z");
  });
});

describe("two-deadline weeks", () => {
  it("a normal week: Mon 5pm for Monday's games, Tue 5pm for the rest (CST)", () => {
    const w = slateWindow("2026-11-09", twoDeadlines);
    expect(w.window_start.toISOString()).toBe("2026-11-09T06:00:00.000Z");
    expect(w.window_end.toISOString()).toBe("2026-11-16T06:00:00.000Z");
    expect(w.first_day_lock_at?.toISOString()).toBe("2026-11-09T23:00:00.000Z"); // Mon 5pm CST
    expect(w.lock_at?.toISOString()).toBe("2026-11-10T23:00:00.000Z"); // Tue 5pm CST
  });

  it("Week 1 runs Sun Nov 1 – Sun Nov 8 with an explicit last day", () => {
    const w = slateWindow("2026-11-01", twoDeadlines, "2026-11-08");
    // Sun Nov 1 midnight is still CDT (DST ends at 2am that morning); Mon Nov 9 midnight is CST.
    expect(w.window_start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(w.window_end.toISOString()).toBe("2026-11-09T06:00:00.000Z");
    // The window starts Sunday, but the first-day deadline is still Monday's.
    expect(localDate(w.first_day_lock_at!, twoDeadlines.timezone)).toBe("2026-11-02");
    expect(w.first_day_lock_at?.toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(w.lock_at?.toISOString()).toBe("2026-11-03T23:00:00.000Z");
  });

  it("first-day deadline follows the wall clock across DST", () => {
    // Window starts Sun Mar 14 2027, the day DST begins: midnight is CST, Monday 5pm is CDT.
    const w = slateWindow("2027-03-14", twoDeadlines, "2027-03-21");
    expect(w.window_start.toISOString()).toBe("2027-03-14T06:00:00.000Z");
    expect(w.first_day_lock_at?.toISOString()).toBe("2027-03-15T22:00:00.000Z");
    expect(w.lock_at?.toISOString()).toBe("2027-03-16T22:00:00.000Z");
  });

  it("an explicit last day overrides length_days", () => {
    const w = slateWindow("2026-11-09", poolA, "2026-11-11");
    expect(w.window_end.toISOString()).toBe("2026-11-12T06:00:00.000Z");
    expect(slateWindow("2026-11-09", poolA, "2026-11-09").window_end.toISOString()).toBe("2026-11-10T06:00:00.000Z");
    expect(() => slateWindow("2026-11-09", poolA, "2026-11-08")).toThrow(/before the first day/);
  });

  it("a window that never reaches the first weekday has no first-day deadline", () => {
    const w = slateWindow("2026-11-10", twoDeadlines, "2026-11-15"); // Tue – Sun
    expect(w.first_day_lock_at).toBeNull();
    expect(w.lock_at?.toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });

  it("no first_day_time → single weekly deadline", () => {
    const s: PoolSettings = { ...poolA, lock: { mode: "weekly", weekly: { weekday: 2, time: "17:00" } } };
    const w = slateWindow("2026-11-09", s);
    expect(w.first_day_lock_at).toBeNull();
    expect(w.lock_at?.toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });

  it("per-game mode has no deadlines", () => {
    const w = slateWindow("2026-11-01", poolB, "2026-11-08"); // football: each game at kickoff
    expect(w.lock_at).toBeNull();
    expect(w.first_day_lock_at).toBeNull();
  });
});
