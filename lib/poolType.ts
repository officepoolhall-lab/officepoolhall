// The line under a pool's name on Home: what kind of pool it is, from its sport and settings.

export type PoolKind = "football" | "basketball" | "golf";

/** Which sport icon the title badge shows. */
export function poolKind(sport: string | null | undefined): PoolKind {
  return sport === "pga" || sport === "golf" ? "golf" : sport === "ncaab" ? "basketball" : "football";
}

/** "NFL Supercontest", "NCAA Confidence Pool", "NFL Survivor", "PGA One-and-Done", "PGA Majors Pool". */
export function poolTypeLabel(pool: { sport: string | null; settings: unknown }): string {
  const s = (pool.settings ?? {}) as Record<string, unknown>;
  if (poolKind(pool.sport) === "golf") {
    if (s.golf_format !== "majors") return "PGA One-and-Done";
    const contest = (s.majors as { scope?: string; contest?: string } | undefined) ?? {};
    // A Majors-format pool on one regular tour event.
    if (contest.scope === "event") return contest.contest === "salary" ? "PGA Salary Cap Pool" : "PGA Tiers Pool";
    return "PGA Majors Pool";
  }
  const league = pool.sport === "nfl" ? "NFL" : "NCAA";
  if (s.format === "pick_x") {
    const n = (s.pick_x as { picks?: unknown } | undefined)?.picks;
    return `NCAA Pick ${typeof n === "number" ? n : "X"}`;
  }
  if (s.format === "survivor") return "NFL Survivor";
  if (s.format === "squares") return "Super Bowl Squares";
  if (s.format === "playoff_fantasy") return "NFL Playoff Fantasy";
  if (s.confidence) return `${league} Confidence Pool`;
  return s.pick_type === "straight_up" ? `${league} Pick'em` : `${league} Supercontest`;
}
