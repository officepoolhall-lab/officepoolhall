import "server-only";
import { cache } from "react";
import { getPublishedSlates, type PoolBase } from "./pool";
import { nflWeekWindow } from "./nflWeeks";

// When a weekly pick pool's season is over (Pick 'Em, Confidence, Supercontest): its sport's
// season has ended and every game on every published week is decided. Then the standings are
// final and the top three get medals.

/** When each sport's season is over (season = the year it starts). */
function seasonEnd(sport: string, season: number): number {
  if (sport === "nfl") return nflWeekWindow(season, 23).end.getTime(); // after Super Bowl week
  if (sport === "ncaaf") return Date.UTC(season + 1, 0, 25); // after the CFP championship
  if (sport === "ncaab") return Date.UTC(season + 1, 3, 10); // after the national championship
  return Infinity;
}

/** No more games count: the season is over and nothing on a published week is still to be played. */
export const weeklySeasonFinal = cache(async (ctx: PoolBase): Promise<boolean> => {
  if (Date.now() < seasonEnd(ctx.pool.sport, ctx.pool.season)) return false;
  const slates = await getPublishedSlates(ctx);
  if (!slates.length) return false;
  const { data } = await ctx.supabase
    .from("slate_games")
    .select("voided, game:games!inner ( status )")
    .in("slate_id", slates.map((s) => s.id))
    .limit(5000);
  const done = new Set(["final", "postponed", "cancelled", "canceled"]);
  return ((data ?? []) as unknown as { voided: boolean; game: { status: string } }[]).every((r) => r.voided || done.has(r.game.status));
});
