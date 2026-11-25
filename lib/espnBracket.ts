import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { SEED_ORDER, gameKey, gamesIn, type Picks } from "./bracket";

// The NCAA Tournament field straight from ESPN, so no commissioner has to type in a bracket:
// once the bracket is announced (Selection Sunday, mid-March), ESPN's tournament scoreboard
// (groups=100) lists every First Round game with both teams' seeds and the region in its
// headline ("Men's Basketball Championship - East Region - 1st Round"), and the First Four
// games the same way. Read here for every pool with an NCAA Tournament bracket (lib/bracketAuto.ts).
//
// Which regions meet in the national semifinals comes from ESPN's posted bracket page, which
// lays the regions out top-left, top-right, bottom-left, bottom-right with the left pair meeting
// in one semifinal and the right pair in the other (2026: EAST, WEST, SOUTH, MIDWEST → East plays
// South, West plays Midwest). If that page can't be read, the regions start in the order the
// scoreboard lists them, and `semifinalPairs` corrects the pairing once the Final Four is set.

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is untyped */

export type EspnTeam = { espnId: string; name: string; abbr: string | null; logo: string | null };
type Side = EspnTeam & { seed: number | null; winner: boolean; placeholder: boolean };
type Game = { id: string; startAt: string; status: "pre" | "in" | "post"; headline: string; sides: [Side, Side] };

async function day(date: string): Promise<Game[]> {
  try {
    const res = await fetch(`${BASE}?dates=${date}&groups=100&limit=100`, { headers: HEADERS, next: { revalidate: 900 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    const out: Game[] = [];
    for (const e of data?.events ?? []) {
      const c = e?.competitions?.[0];
      const cs = (c?.competitors ?? []) as any[];
      if (cs.length !== 2) continue;
      const side = (x: any): Side => {
        const n = Number(x?.seed ?? x?.curatedRank?.current);
        const id = String(x?.team?.id ?? "");
        const name = String(x?.team?.shortDisplayName ?? x?.team?.location ?? x?.team?.displayName ?? "");
        return {
          espnId: id,
          name,
          abbr: x?.team?.abbreviation ?? null,
          logo: x?.team?.logo ?? null,
          seed: Number.isInteger(n) && n >= 1 && n <= 16 ? n : null,
          winner: x?.winner === true,
          // A spot still waiting on a First Four game: no real team id, or a "TBD"-style name.
          placeholder: !/^\d+$/.test(id) || Number(id) <= 0 || /^(tbd|tba)$/i.test(name) || /\//.test(name),
        };
      };
      out.push({
        id: String(e?.id ?? ""),
        startAt: new Date(e?.date).toISOString(),
        status: c?.status?.type?.state ?? e?.status?.type?.state ?? "pre",
        headline: String(c?.notes?.[0]?.headline ?? ""),
        sides: [side(cs[0]), side(cs[1])],
      });
    }
    return out;
  } catch {
    return [];
  }
}

const regionIn = (headline: string) => /(?:^|[-–]\s*)([A-Za-z]+(?: [A-Za-z]+)?) Region/i.exec(headline)?.[1]?.trim() ?? null;
const isFirstRound = (h: string) => /\b(1st|first) round\b/i.test(h) && !/first four/i.test(h);
const isFirstFour = (h: string) => /first four|opening round/i.test(h);
const isSemifinal = (h: string) => /final four|national semifinal/i.test(h);

export type EspnField = {
  /** The four regions in semifinal order (0 meets 1, 2 meets 3), from ESPN's bracket page when it can be read. */
  regions: string[];
  /** 64 slots (region * 16 + bracket position); null where a First Four game hasn't been played. */
  slots: (EspnTeam | null)[];
  /** The First Four: each game's slot, its two teams and, once played, the winner's ESPN id. */
  firstFour: { slot: number; teams: [EspnTeam, EspnTeam]; winner: string | null }[];
  /** The first Round of 64 tip: when picks lock. */
  firstTip: string;
};

/**
 * The regions in semifinal order (0 meets 1, 2 meets 3) from ESPN's bracket page, or null if
 * it can't be read or doesn't show all four. The page labels each quadrant in capitals, in
 * reading order: top-left, top-right, bottom-left, bottom-right.
 */
async function bracketPageOrder(year: number, regions: string[]): Promise<string[] | null> {
  for (const url of [
    `https://www.espn.com/mens-college-basketball/bracket/_/season/${year}/${year}-ncaa-tournament`,
    "https://www.espn.com/mens-college-basketball/tournament/bracket",
  ]) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"], Accept: "text/html" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const html = await res.text();
      // Each region's quadrant label: the name alone in capitals between tags (">EAST<").
      const at = regions.map((r) => ({ r, i: html.search(new RegExp(`>\\s*${r.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*<`)) }));
      if (at.some((x) => x.i < 0)) continue;
      const [tl, tr, bl, br] = [...at].sort((a, b) => a.i - b.i).map((x) => x.r);
      return [tl, bl, tr, br];
    } catch {
      // try the next page
    }
  }
  return null;
}

/** Every tournament game ESPN lists from March 14 to March 24 of `year` (Selection Sunday through the first weekend). */
async function openingGames(year: number): Promise<Game[]> {
  const dates = Array.from({ length: 11 }, (_, i) => `${year}03${String(14 + i).padStart(2, "0")}`);
  return (await Promise.all(dates.map(day))).flat();
}

/** The year's field from ESPN, or null until all 32 First Round games are listed with their regions and seeds. */
export async function getEspnField(year: number): Promise<EspnField | null> {
  const games = await openingGames(year);
  const firstRound = games.filter((g) => isFirstRound(g.headline));
  if (firstRound.length < 32) return null;
  // Regions in the order ESPN first lists them (by tip time).
  const regions: string[] = [];
  for (const g of [...firstRound].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    const r = regionIn(g.headline);
    if (r && !regions.some((x) => x.toLowerCase() === r.toLowerCase())) regions.push(r);
  }
  if (regions.length !== 4) return null;
  // The real semifinal pairing, from ESPN's posted bracket.
  const paired = await bracketPageOrder(year, regions);
  if (paired) regions.splice(0, 4, ...paired);
  const regionIndex = (h: string) => regions.findIndex((r) => r.toLowerCase() === (regionIn(h) ?? "").toLowerCase());

  const slots: (EspnTeam | null)[] = Array.from({ length: 64 }, () => null);
  const filled = new Set<number>();
  for (const g of firstRound) {
    const r = regionIndex(g.headline);
    if (r < 0) return null;
    // A First Round game against a First Four winner may list only one seed: the other is 17 minus it.
    const seeds = g.sides.map((s) => s.seed);
    const [a, b] = [seeds[0] ?? (seeds[1] ? 17 - seeds[1] : null), seeds[1] ?? (seeds[0] ? 17 - seeds[0] : null)];
    if (a === null || b === null || a + b !== 17) return null;
    for (const [s, seed] of [[g.sides[0], a], [g.sides[1], b]] as [Side, number][]) {
      const slot = r * 16 + SEED_ORDER.indexOf(seed as (typeof SEED_ORDER)[number]);
      if (filled.has(slot)) return null;
      filled.add(slot);
      if (!s.placeholder) slots[slot] = { espnId: s.espnId, name: s.name, abbr: s.abbr, logo: s.logo };
    }
  }
  if (filled.size !== 64) return null;

  // The First Four: each game's region (headline) and seed, so its winner's slot; a game whose
  // headline has no region takes the open slot with its seed.
  const firstFour: EspnField["firstFour"] = [];
  for (const g of games.filter((x) => isFirstFour(x.headline))) {
    if (g.sides.some((s) => s.placeholder)) continue;
    const seed = g.sides[0].seed ?? g.sides[1].seed;
    if (seed === null) continue;
    const pos = SEED_ORDER.indexOf(seed as (typeof SEED_ORDER)[number]);
    let r = regionIndex(g.headline);
    if (r < 0) r = [0, 1, 2, 3].find((i) => !slots[i * 16 + pos] && !firstFour.some((f) => f.slot === i * 16 + pos)) ?? -1;
    if (r < 0) continue;
    const slot = r * 16 + pos;
    const winner = g.status === "post" ? (g.sides.find((s) => s.winner)?.espnId ?? null) : null;
    const team = (s: Side): EspnTeam => ({ espnId: s.espnId, name: s.name, abbr: s.abbr, logo: s.logo });
    firstFour.push({ slot, teams: [team(g.sides[0]), team(g.sides[1])], winner });
    // Its winner takes the slot.
    if (winner && !slots[slot]) slots[slot] = team(g.sides.find((s) => s.espnId === winner)!);
  }

  const firstTip = firstRound.map((g) => g.startAt).sort()[0];
  return { regions, slots, firstFour, firstTip };
}

/**
 * Which regions meet in each national semifinal, once ESPN lists both semifinals with their
 * teams: pairs of region names, or null before then. `regionOfTeam` maps an ESPN team id to its
 * region.
 */
export async function semifinalPairs(lockAt: string, regionOfTeam: Map<string, string>): Promise<[string, string][] | null> {
  // The Final Four is the third weekend: 15 to 18 days after the first Round of 64 tip.
  const start = Date.parse(lockAt);
  if (!Number.isFinite(start)) return null;
  const dates = Array.from({ length: 5 }, (_, i) => formatInTimeZone(start + (14 + i) * 86_400_000, "America/New_York", "yyyyMMdd"));
  const semis = (await Promise.all(dates.map(day))).flat().filter((g) => isSemifinal(g.headline) && !g.sides.some((s) => s.placeholder));
  if (semis.length !== 2) return null;
  const pairs = semis.map((g) => g.sides.map((s) => regionOfTeam.get(s.espnId) ?? null));
  if (pairs.some((p) => !p[0] || !p[1] || p[0] === p[1])) return null;
  return pairs as [string, string][];
}

/**
 * Re-pair a bracket's regions: `order` is the new region order (as old region indexes), so
 * regions order[0] and order[1] meet in one semifinal and order[2] and order[3] in the other.
 * Moves the field's slots and the winners (or picks) of the first four rounds with their regions;
 * later rounds' keys stay (the pairing is fixed before the Final Four is played).
 */
export function remapRegions<T>(order: number[], slots: Map<number, T>): Map<number, T> {
  const out = new Map<number, T>();
  for (const [slot, v] of slots) out.set(order.indexOf(Math.floor(slot / 16)) * 16 + (slot % 16), v);
  return out;
}
export function remapPicks(order: number[], picks: Picks): Picks {
  const out: Picks = {};
  for (const [key, team] of Object.entries(picks)) {
    const [r, g] = key.split("-").map(Number);
    if (r >= 1 && r <= 4) {
      const per = gamesIn(r) / 4;
      out[gameKey(r, order.indexOf(Math.floor(g / per)) * per + (g % per))] = team;
    } else out[key] = team;
  }
  return out;
}
