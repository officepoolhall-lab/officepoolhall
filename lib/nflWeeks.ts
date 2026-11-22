// NFL weeks, the same for every NFL pool: Tuesday to Tuesday, starting the Tuesday after Labor
// Day (the season opens the Thursday after Labor Day). Weeks 1–18 are the regular season; then
// the Wild Card round (19), Divisional (20), Conference Championships (21), the week off before
// the Super Bowl (22, skipped) and the Super Bowl (23). A week runs from 4:00 AM Eastern
// Tuesday (after Monday night's game) to the next Tuesday, so every game ESPN files under an
// NFL week falls inside it.

export const NFL_WEEKS = [...Array.from({ length: 18 }, (_, i) => i + 1), 19, 20, 21, 23];

const PLAYOFF_LABEL: Record<number, string> = { 19: "Wild Card", 20: "Divisional", 21: "Conference Championships", 23: "Super Bowl" };

export const nflWeekLabel = (week: number) => PLAYOFF_LABEL[week] ?? `Week ${week}`;

/** The Tuesday after Labor Day (the first Monday of September), 09:00 UTC. */
function seasonStart(season: number): Date {
  const sep1 = new Date(Date.UTC(season, 8, 1));
  const toMonday = (8 - sep1.getUTCDay()) % 7; // 0 when Sep 1 is a Monday
  return new Date(Date.UTC(season, 8, 1 + toMonday + 1, 9));
}

/** When an NFL week starts and ends (end exclusive). */
export function nflWeekWindow(season: number, week: number): { start: Date; end: Date } {
  const start = new Date(seasonStart(season).getTime() + (week - 1) * 7 * 86_400_000);
  return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
}

/**
 * The NFL week going on now: before the season, Week 1; the week off before the Super Bowl
 * counts as Super Bowl week; after the Super Bowl, still the Super Bowl.
 */
export function currentNflWeek(season: number, now: number = Date.now()): number {
  const days = Math.floor((now - seasonStart(season).getTime()) / 86_400_000);
  if (days < 0) return 1;
  const week = Math.floor(days / 7) + 1;
  if (week >= 22) return 23;
  return week;
}
