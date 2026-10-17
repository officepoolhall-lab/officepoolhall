import { describe, expect, it } from "vitest";
import { LOCKED_AFTER_OPEN, PRESETS, parsePoolSettings, parseSegmentWeeks, segmentForWeek, segmentRanges, segmentWeeksLabel, settingsError } from "./poolSettings";
import { winPct } from "./record";

const poolB = PRESETS.ncaaf_ats.settings;
const three = [
  { name: "Segment 1", first_week: 1 },
  { name: "Segment 2", first_week: 6 },
  { name: "Segment 3", first_week: 11 },
];
const withSegments = { segments: three };

describe("segments setting", () => {
  it("defaults to null when missing (pools saved before segments existed)", () => {
    const old: Record<string, unknown> = { ...poolB };
    delete old.segments;
    const r = parsePoolSettings(old);
    expect(r.success && r.data.segments).toBe(null);
  });

  it("accepts increasing start weeks", () => {
    expect(parsePoolSettings({ ...poolB, segments: three }).success).toBe(true);
  });

  it("rejects non-increasing, non-integer, zero and empty-name segments, and an empty list", () => {
    expect(settingsError({ ...poolB, segments: [three[1], three[0]] })).toMatch(/increasing start weeks/);
    expect(settingsError({ ...poolB, segments: [three[0], { name: "B", first_week: 1 }] })).toMatch(/increasing start weeks/);
    expect(parsePoolSettings({ ...poolB, segments: [{ name: "A", first_week: 1.5 }] }).success).toBe(false);
    expect(parsePoolSettings({ ...poolB, segments: [{ name: "A", first_week: 0 }] }).success).toBe(false);
    expect(settingsError({ ...poolB, segments: [{ name: "  ", first_week: 1 }] })).toMatch(/name/);
    expect(parsePoolSettings({ ...poolB, segments: [] }).success).toBe(false);
  });

  it("stays adjustable after a week opens", () => {
    expect(LOCKED_AFTER_OPEN as readonly string[]).not.toContain("segments");
  });
});

describe("segment helpers", () => {
  it("ranges run to the week before the next start; the last is open unless capped", () => {
    expect(segmentRanges(withSegments)).toEqual([
      { name: "Segment 1", first_week: 1, last_week: 5 },
      { name: "Segment 2", first_week: 6, last_week: 10 },
      { name: "Segment 3", first_week: 11, last_week: null },
    ]);
    expect(segmentRanges(withSegments, 14)[2].last_week).toBe(14);
    expect(segmentRanges(withSegments, 3)[2].last_week).toBe(11);
    expect(segmentRanges({ segments: null })).toEqual([]);
  });

  it("finds the segment for a week", () => {
    expect(segmentForWeek(withSegments, 1)?.name).toBe("Segment 1");
    expect(segmentForWeek(withSegments, 5)?.name).toBe("Segment 1");
    expect(segmentForWeek(withSegments, 6)?.name).toBe("Segment 2");
    expect(segmentForWeek(withSegments, 10)?.name).toBe("Segment 2");
    expect(segmentForWeek(withSegments, 15)?.name).toBe("Segment 3");
    expect(segmentForWeek({ segments: [{ name: "Late", first_week: 3 }] }, 2)).toBe(null);
    expect(segmentForWeek({ segments: null }, 2)).toBe(null);
  });

  it("labels week ranges", () => {
    const [a, , c] = segmentRanges(withSegments);
    expect(segmentWeeksLabel(a)).toBe("Wks 1–5");
    expect(segmentWeeksLabel(c)).toBe("Wks 11+");
    expect(segmentWeeksLabel({ name: "x", first_week: 4, last_week: 4 })).toBe("Wk 4");
  });

  it("parses the settings text field", () => {
    expect(parseSegmentWeeks("1, 6, 11")).toEqual({ segments: three, error: null });
    expect(parseSegmentWeeks(" 1 6,11 ").segments).toEqual(three);
    expect(parseSegmentWeeks("  ")).toEqual({ segments: null, error: null });
    expect(parseSegmentWeeks("1, 6, 4").error).toMatch(/increasing/);
    expect(parseSegmentWeeks("1, x").error).toMatch(/whole week/);
    expect(parseSegmentWeeks("0, 5").error).toMatch(/whole week/);
  });
});

describe("win percentage", () => {
  it("formats like a baseball average", () => {
    expect(winPct(2, 1)).toBe(".667");
    expect(winPct(5, 0)).toBe("1.000");
    expect(winPct(0, 5)).toBe(".000");
    expect(winPct(0, 0)).toBe("—");
  });
});
