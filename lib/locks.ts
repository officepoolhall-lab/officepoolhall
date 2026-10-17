// Pure lock-time helpers shared by server pages and the client pick board. They mirror
// the SQL in 20261017000008_pool_rules.sql, which is what actually enforces locks.

/**
 * When a game stops taking picks; mirrors SQL effective_lock_at(). A real tip always wins
 * if it's before the deadline. A TBD game's start is ESPN's midnight placeholder, so with
 * a deadline it locks at the deadline instead; without one (per_game mode) the placeholder
 * is all we have.
 */
export function effectiveLockAt(startAt: string, timeTbd: boolean, deadline: string | null): string {
  if (timeTbd) return deadline ?? startAt;
  if (deadline === null) return startAt;
  return new Date(deadline).getTime() < new Date(startAt).getTime() ? deadline : startAt;
}

/**
 * The time zone to read a game's calendar date in; mirrors SQL game_local_date(). ESPN's
 * TBD placeholder is midnight Eastern on the game's date, which is the previous evening in
 * Central, so a TBD game's date is read in Eastern.
 */
export function gameDateZone(timeTbd: boolean, timezone: string) {
  return timeTbd ? "America/New_York" : timezone;
}

/** ESPN statuses that mean a game is under way or over, whatever its listed time says. */
const PLAYED = new Set(["in_progress", "final"]);

/**
 * Whether a game has stopped taking picks; mirrors SQL game_locked(). ESPN keeps a TBD
 * game's time invalid after it tips, so the status locks it even before its deadline.
 */
export function isGameLocked(g: { effectiveLockAt: string; status: string }, now: number): boolean {
  return PLAYED.has(g.status) || new Date(g.effectiveLockAt).getTime() <= now;
}

/**
 * Whether a game has really tipped; mirrors SQL game_started(). A TBD game's start is a
 * placeholder, so passing it doesn't count.
 */
export function hasStarted(g: { startAt: string; timeTbd: boolean; status: string }, now: number): boolean {
  return PLAYED.has(g.status) || (!g.timeTbd && new Date(g.startAt).getTime() <= now);
}
