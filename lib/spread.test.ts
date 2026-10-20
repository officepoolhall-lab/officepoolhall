import { describe, expect, it } from "vitest";
import { applyHalfPoint, parseSpread } from "./spread";

describe("applyHalfPoint", () => {
  it("moves whole numbers away from zero when forced", () => {
    expect(applyHalfPoint(-7, true)).toBe(-7.5);
    expect(applyHalfPoint(3, true)).toBe(3.5);
  });
  it("leaves half points, pick'ems, nulls, and everything when not forced", () => {
    expect(applyHalfPoint(-6.5, true)).toBe(-6.5);
    expect(applyHalfPoint(0, true)).toBe(0);
    expect(applyHalfPoint(null, true)).toBe(null);
    expect(applyHalfPoint(-7, false)).toBe(-7);
  });
});

describe("parseSpread", () => {
  it("reads typed spreads", () => {
    expect(parseSpread("-3.5")).toEqual({ value: -3.5 });
    expect(parseSpread("+7")).toEqual({ value: 7 });
    expect(parseSpread("−6")).toEqual({ value: -6 });
    expect(parseSpread("pk")).toEqual({ value: 0 });
    expect(parseSpread("  ")).toEqual({ value: null });
  });
  it("rejects anything that isn't a whole or half point", () => {
    expect("error" in parseSpread("-3.25")).toBe(true);
    expect("error" in parseSpread("abc")).toBe(true);
    expect("error" in parseSpread("120")).toBe(true);
  });
});
