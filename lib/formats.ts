// A pool's format: the kinds of pool that don't run on weekly picks (settings.format). Each
// keeps its rules in a settings block of the same name and has its own pages; everything else
// (the weekly Supercontest, Pick 'Em and Confidence pools) has no format set.

export type PoolFormat = "pick_x" | "survivor" | "squares" | "playoff_fantasy";

const FORMATS: PoolFormat[] = ["pick_x", "survivor", "squares", "playoff_fantasy"];

export function poolFormat(settings: unknown): PoolFormat | null {
  const f = (settings as Record<string, unknown> | null)?.format;
  return FORMATS.includes(f as PoolFormat) ? (f as PoolFormat) : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- settings are stored as loose JSON */
export const block = (settings: unknown, key: string): Record<string, any> => (((settings as Record<string, any> | null)?.[key] ?? {}) as Record<string, any>);
export const int = (v: unknown, lo: number, hi: number): number | null => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
export const num = (v: unknown, lo = -Infinity, hi = Infinity): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
