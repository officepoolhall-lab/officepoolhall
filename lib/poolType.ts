// The line under a pool's name on Home: what kind of pool it is, from its sport and settings.

export type PoolKind = "football" | "basketball" | "golf";

/** Which sport icon the title badge shows. */
export function poolKind(sport: string | null | undefined): PoolKind {
  return sport === "pga" || sport === "golf" ? "golf" : sport === "ncaab" ? "basketball" : "football";
}

/** "NFL Supercontest", "NCAA Confidence Pool", "PGA One-and-Done", "PGA Majors Pool". */
export function poolTypeLabel(pool: { sport: string | null; settings: unknown }): string {
  const s = (pool.settings ?? {}) as Record<string, unknown>;
  if (poolKind(pool.sport) === "golf") return s.golf_format === "majors" ? "PGA Majors Pool" : "PGA One-and-Done";
  const league = pool.sport === "nfl" ? "NFL" : "NCAA";
  if (s.confidence) return `${league} Confidence Pool`;
  return s.pick_type === "straight_up" ? `${league} Pick'em` : `${league} Supercontest`;
}
