"use server";

import { getPoolContext } from "@/lib/pool";
import { getAllSplitStandings } from "@/lib/splitsData";

/**
 * The Season table's pick-type breakdowns (favorites, underdogs, home, away), fetched the
 * first time someone taps a filter rather than on every page load: it reads every graded
 * pick of the season, the page's heaviest query. Membership is checked by getPoolContext.
 */
export async function loadPickSplits(slug: string) {
  const ctx = await getPoolContext(slug);
  try {
    return { ok: true as const, splits: await getAllSplitStandings(ctx) };
  } catch (err) {
    console.error("Standings: pick-type breakdown failed", err);
    return { ok: false as const };
  }
}
