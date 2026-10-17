import { describe, expect, it } from "vitest";
import { effectiveLockAt, gameDateZone, hasStarted, isGameLocked } from "./locks";

const TIP = "2026-11-02T20:00:00.000Z";
const DEADLINE = "2026-11-02T23:00:00.000Z";

describe("effectiveLockAt", () => {
  it("locks a game tipping before the deadline at tip-off", () => {
    expect(effectiveLockAt(TIP, false, DEADLINE)).toBe(TIP);
  });
  it("locks a game tipping after the deadline at the deadline", () => {
    expect(effectiveLockAt("2026-11-04T00:00:00.000Z", false, DEADLINE)).toBe(DEADLINE);
  });
  it("ignores a TBD placeholder when there is a deadline", () => {
    // The placeholder (midnight Eastern) is before the deadline but isn't a real tip.
    expect(effectiveLockAt("2026-11-02T05:00:00.000Z", true, DEADLINE)).toBe(DEADLINE);
  });
  it("falls back to the start without a deadline (per_game mode)", () => {
    expect(effectiveLockAt(TIP, false, null)).toBe(TIP);
    expect(effectiveLockAt(TIP, true, null)).toBe(TIP);
  });
});

describe("gameDateZone", () => {
  it("reads TBD games in Eastern and others in the pool's zone", () => {
    expect(gameDateZone(true, "America/Chicago")).toBe("America/New_York");
    expect(gameDateZone(false, "America/Chicago")).toBe("America/Chicago");
  });
});

describe("isGameLocked", () => {
  const before = new Date(DEADLINE).getTime() - 60_000;
  it("locks at the effective lock", () => {
    expect(isGameLocked({ effectiveLockAt: DEADLINE, status: "scheduled" }, before)).toBe(false);
    expect(isGameLocked({ effectiveLockAt: DEADLINE, status: "scheduled" }, new Date(DEADLINE).getTime())).toBe(true);
  });
  it("locks a game ESPN has under way or final before its deadline (TBD games keep no time)", () => {
    expect(isGameLocked({ effectiveLockAt: DEADLINE, status: "in_progress" }, before)).toBe(true);
    expect(isGameLocked({ effectiveLockAt: DEADLINE, status: "final" }, before)).toBe(true);
  });
});

describe("hasStarted", () => {
  const placeholder = "2026-11-02T05:00:00.000Z";
  const later = new Date(placeholder).getTime() + 3_600_000;
  it("doesn't treat a passed TBD placeholder as a tip", () => {
    expect(hasStarted({ startAt: placeholder, timeTbd: true, status: "scheduled" }, later)).toBe(false);
    expect(hasStarted({ startAt: placeholder, timeTbd: true, status: "in_progress" }, later)).toBe(true);
  });
  it("treats a passed real tip as started", () => {
    expect(hasStarted({ startAt: placeholder, timeTbd: false, status: "scheduled" }, later)).toBe(true);
    expect(hasStarted({ startAt: TIP, timeTbd: false, status: "scheduled" }, new Date(TIP).getTime() - 1)).toBe(false);
  });
});
