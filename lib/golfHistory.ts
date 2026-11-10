import "server-only";
import { getLiveLeaderboard, type LiveGolfer } from "./golfLive";

// How the field has done at one tournament in earlier years. ESPN's season calendar gives each
// year's tournament ids (checked Nov 2026: scoreboard?dates=YYYY → leagues[0].calendar), and
// that year's final leaderboard page reads like the current one. Past results never change,
// so both are cached for a long time; the first look at a tournament fetches a page per year.

const YEARS_BACK = 5;
const CALENDAR_REVALIDATE = 7 * 86_400;
const LEADERBOARD_REVALIDATE = 30 * 86_400;
const FETCH_TIMEOUT_MS = 8000;

type CalendarEntry = { id: string; label: string };

async function seasonCalendar(year: number): Promise<CalendarEntry[]> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${year}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: CALENDAR_REVALIDATE },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { leagues?: { calendar?: { id?: unknown; label?: unknown }[] }[] };
    return (body.leagues?.[0]?.calendar ?? [])
      .filter((c) => c.id !== undefined && typeof c.label === "string")
      .map((c) => ({ id: String(c.id), label: c.label as string }));
  } catch {
    return [];
  }
}

// Words that come and go with sponsors and wording, ignored when comparing names.
const FILLER = new Set(["the", "in", "at", "of", "by", "pres", "presented", "and", "tournament", "championship", "open", "classic", "invitational", "golf"]);

function words(name: string) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The same tournament in another year's calendar. In order: the same name (ignoring "the");
 * the entry sharing most of its distinctive words (more than half); or the only entry whose
 * distinctive words contain this one's or the reverse ("Houston Open" and "Texas Children's
 * Houston Open"). A tournament renamed outright by a new sponsor isn't matched, and that year
 * is left out.
 */
export function matchTournament(name: string, calendar: CalendarEntry[]): CalendarEntry | null {
  const plain = (n: string) => words(n).filter((w) => w !== "the").join(" ");
  // "The Open Championship" is "The Open" on ESPN.
  const short = (n: string) => plain(n).replace(/ championship$/, "");
  const exact = calendar.find((c) => plain(c.label) === plain(name)) ?? calendar.find((c) => short(c.label) === short(name));
  if (exact) return exact;
  const key = new Set(words(name).filter((w) => !FILLER.has(w)));
  if (key.size === 0) return null;
  let best: CalendarEntry | null = null;
  let bestScore = 0;
  const contained: CalendarEntry[] = [];
  for (const c of calendar) {
    const other = new Set(words(c.label).filter((w) => !FILLER.has(w)));
    if (other.size === 0) continue;
    const shared = [...key].filter((w) => other.has(w)).length;
    const score = shared / Math.max(key.size, other.size);
    if (score > bestScore) [best, bestScore] = [c, score];
    if (shared === Math.min(key.size, other.size)) contained.push(c);
  }
  if (bestScore > 0.5) return best;
  return contained.length === 1 ? contained[0] : null;
}

export type TournamentYear = {
  year: number;
  /** That year's name, when it differs from today's. */
  name: string;
  golfers: Map<string, LiveGolfer>;
};

/** The last few years of one tournament, newest first; years that can't be found are left out. */
export async function getTournamentHistory(eventName: string, season: number): Promise<TournamentYear[]> {
  const years = Array.from({ length: YEARS_BACK }, (_, i) => season - 1 - i);
  const found = await Promise.all(
    years.map(async (year): Promise<TournamentYear | null> => {
      const match = matchTournament(eventName, await seasonCalendar(year));
      if (!match) return null;
      const golfers = await getLiveLeaderboard(match.id, LEADERBOARD_REVALIDATE, FETCH_TIMEOUT_MS);
      // A year with nobody finished (canceled, or not played yet) isn't history.
      if (!golfers || !golfers.some((g) => g.status === "post")) return null;
      return { year, name: match.label, golfers: new Map(golfers.map((g) => [g.id, g])) };
    }),
  );
  return found.filter((y): y is TournamentYear => !!y);
}
