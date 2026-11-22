import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { ROUNDS, gameKey, gameTeams, gamesIn, type Picks } from "./bracket";
import type { Bracket } from "./brackets";
import { getEspnDay } from "./espnScoreboard";

// Fills a bracket's winners from ESPN: every finished game between the two teams a bracket game
// is waiting on, from the day brackets lock. Used by the commissioner's "Update from ESPN"
// button and by the cron (/api/brackets/sync), so results (and Pick X standings) keep
// themselves during the tournament. Winners the commissioner already set are never changed.

const DAY = 86_400_000;
const TOURNAMENT_DAYS = 24; // First Round Thursday to the title game Monday, with room to spare

export type BracketSync = {
  results: Picks;
  /** How many winners were added. */
  added: number;
  /** The championship game's total points, once it's final. */
  titleTotal: number | null;
};

export async function espnBracketResults(bracket: Bracket, now = Date.now()): Promise<BracketSync> {
  const start = Date.parse(bracket.lockAt);
  const results: Picks = { ...bracket.results };
  if (!Number.isFinite(start) || now < start) return { results, added: 0, titleTotal: null };

  // ESPN counts days in US Eastern.
  const day = (t: number) => formatInTimeZone(t, "America/New_York", "yyyyMMdd");
  const today = day(now);
  const dates: string[] = [];
  for (let t = start; t <= Math.min(now, start + TOURNAMENT_DAYS * DAY) + DAY && dates.length <= TOURNAMENT_DAYS + 1; t += DAY) {
    const d = day(t);
    if (d <= today && !dates.includes(d)) dates.push(d);
  }
  const days = await Promise.all(dates.map((d) => getEspnDay("ncaab", d, d === today).catch(() => [])));

  // Finished games by the pair of teams (ESPN ids) that played.
  const finals = new Map<string, { winner: string; total: number }>();
  for (const g of days.flat()) {
    if (g.status !== "final" || g.homeScore === null || g.awayScore === null || g.homeScore === g.awayScore) continue;
    const [h, a] = [g.home.espn_id, g.away.espn_id];
    if (!h || !a) continue;
    finals.set([h, a].sort().join(":"), { winner: g.homeScore > g.awayScore ? h : a, total: g.homeScore + g.awayScore });
  }

  const field = bracket.field.map((t) => t?.id ?? null);
  const espnOf = new Map(bracket.field.filter((t) => t?.espn_id).map((t) => [t!.id, t!.espn_id!]));
  const idOf = new Map([...espnOf].map(([id, espn]) => [espn, id]));
  let added = 0;
  let titleTotal: number | null = null;
  // Round by round, so a round's winners set up the next round's games.
  for (const { round } of ROUNDS) {
    for (let g = 0; g < gamesIn(round); g++) {
      const [a, b] = gameTeams(round, g, field, results);
      const [ea, eb] = [a ? espnOf.get(a) : undefined, b ? espnOf.get(b) : undefined];
      if (!ea || !eb) continue;
      const final = finals.get([ea, eb].sort().join(":"));
      if (!final) continue;
      if (round === 6) titleTotal = final.total;
      const key = gameKey(round, g);
      if (results[key]) continue;
      const winner = idOf.get(final.winner);
      if (!winner) continue;
      results[key] = winner;
      added++;
    }
  }
  return { results, added, titleTotal };
}

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A Pick X pool using the tiebreaker: record the title game's total once it's known. True if it was saved. */
export async function saveTitleTotal(supabase: unknown, pool: { id: string; settings: unknown }, total: number | null): Promise<boolean> {
  const settings = (pool.settings ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (total === null || settings.format !== "pick_x" || settings.pick_x?.tiebreaker !== "title_total" || settings.pick_x?.title_total === total) return false;
  const { error } = await (supabase as Db).from("pools").update({ settings: { ...settings, pick_x: { ...settings.pick_x, title_total: total } } }).eq("id", pool.id);
  return !error;
}
