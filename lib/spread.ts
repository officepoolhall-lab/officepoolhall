// Home-team spreads as the commissioner types them (slate editor) and as the pool stores them.

/** Mirrors SQL apply_half_point: with force on, a whole-number spread moves half a point away from 0. */
export function applyHalfPoint(spread: number | null, force: boolean): number | null {
  if (!force || spread === null || spread === 0 || spread !== Math.trunc(spread)) return spread;
  return spread > 0 ? spread + 0.5 : spread - 0.5;
}

/**
 * "-3.5", "+7", "−6", "PK" → a number (PK = 0); "" → null. An error message for anything else.
 * Spreads are whole or half points within ±99.
 */
export function parseSpread(input: string): { value: number | null } | { error: string } {
  const t = input.trim().replace("−", "-");
  if (t === "") return { value: null };
  const v = /^pk$/i.test(t) ? 0 : Number(t);
  if (!Number.isFinite(v) || Math.abs(v) > 99 || (v * 2) % 1 !== 0) {
    return { error: "Spreads are whole or half points, e.g. -3.5 (home favored) or 7." };
  }
  return { value: v };
}
