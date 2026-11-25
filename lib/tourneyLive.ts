import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { ROUNDS, SEED_ORDER, gameKey, gameTeams, gamesIn, type Picks } from "./bracket";
import type { Bracket } from "./brackets";

// The NCAA Tournament as it stands right now, for a pool's live bracket: the pool's field and
// winners, with ESPN's scores, clocks and tip times laid over every game, plus the First Four.
// ESPN's tournament scoreboard (groups=100) is read for each tournament day up to tomorrow:
// today's every 20 seconds, earlier days every hour.

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };
const DAY = 86_400_000;

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is untyped */

type EspnTeam = { espnId: string; name: string; abbr: string | null; logo: string | null; score: number | null; seed: number | null; winner: boolean };
type EspnGame = { id: string; startAt: string; status: "scheduled" | "in_progress" | "final"; detail: string | null; tv: string | null; headline: string; teams: [EspnTeam, EspnTeam] };

async function espnDay(date: string, today: boolean): Promise<EspnGame[]> {
  try {
    const res = await fetch(`${BASE}?dates=${date}&groups=100&limit=100`, { headers: HEADERS, next: { revalidate: today ? 20 : 3600 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    const out: EspnGame[] = [];
    for (const e of data?.events ?? []) {
      const c = e?.competitions?.[0];
      const cs = (c?.competitors ?? []) as any[];
      if (cs.length !== 2) continue;
      const state = c?.status?.type?.state ?? e?.status?.type?.state;
      const status = state === "post" ? "final" : state === "in" ? "in_progress" : "scheduled";
      const seedOf = (x: any) => {
        const n = Number(x?.seed ?? x?.curatedRank?.current);
        return Number.isInteger(n) && n >= 1 && n <= 16 ? n : null;
      };
      const team = (x: any): EspnTeam => ({
        espnId: String(x?.team?.id ?? ""),
        name: String(x?.team?.shortDisplayName ?? x?.team?.location ?? x?.team?.displayName ?? ""),
        abbr: x?.team?.abbreviation ?? null,
        logo: x?.team?.logo ?? null,
        score: status !== "scheduled" && x?.score != null && x.score !== "" ? Number(x.score) : null,
        seed: seedOf(x),
        winner: x?.winner === true,
      });
      const national = (c?.broadcasts ?? []).find((b: any) => b?.market === "national") ?? c?.broadcasts?.[0];
      // Home listed second, as ESPN shows a game.
      const [a, b] = [cs.find((x) => x?.homeAway === "away") ?? cs[0], cs.find((x) => x?.homeAway === "home") ?? cs[1]];
      out.push({
        id: String(e?.id ?? ""),
        startAt: new Date(e?.date).toISOString(),
        status,
        detail: c?.status?.type?.shortDetail ?? e?.status?.type?.shortDetail ?? null,
        tv: national?.names?.join("/") || null,
        headline: String(c?.notes?.[0]?.headline ?? ""),
        teams: [team(a), team(b)],
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Every tournament game ESPN has from three days before the lock (the First Four) to tomorrow. */
async function tourneyGames(lockAt: string, now: number): Promise<EspnGame[]> {
  const lock = Date.parse(lockAt);
  if (!Number.isFinite(lock)) return [];
  const day = (t: number) => formatInTimeZone(t, "America/New_York", "yyyyMMdd");
  const today = day(now);
  const last = Math.min(lock + 24 * DAY, now + DAY);
  const dates: string[] = [];
  for (let t = lock - 3 * DAY; t <= last; t += DAY) if (!dates.includes(day(t))) dates.push(day(t));
  const days = await Promise.all(dates.map((d) => espnDay(d, d === today)));
  return days.flat();
}

export type LiveTeam = {
  /** Our team's id (null for a First Four team that isn't in the pool's field). */
  id: string | null;
  seed: number | null;
  name: string;
  abbr: string | null;
  logo: string | null;
  score: number | null;
  /** Won this game / lost it (both false until it's decided). */
  won: boolean;
  lost: boolean;
};
export type LiveGame = {
  key: string;
  round: number;
  status: "scheduled" | "in_progress" | "final";
  /** "8:44 - 2nd Half", "Final/OT", or the tip time and network ("Thu 11:15 AM · CBS"). */
  detail: string | null;
  /** A side not decided yet: a placeholder ("Winner of TEX/NCSU") or null. */
  teams: [LiveTeam | null, LiveTeam | null];
  placeholders: [string | null, string | null];
};
export type LiveBracket = {
  regions: string[];
  /** rounds[r - 1]: that round's games, in bracket order. */
  rounds: LiveGame[][];
  firstFour: (LiveGame & { region: string | null; seed: number | null })[];
  /** A game is being played right now. */
  live: boolean;
  /** A game tips (or tipped) within the next/last few hours: worth refreshing for. */
  soon: boolean;
  /** ESPN answered (scores and times are showing). */
  fromEspn: boolean;
};

/** The pool's bracket with ESPN's games laid over it. */
export async function getLiveBracket(bracket: Bracket, tz: string, now = Date.now()): Promise<LiveBracket> {
  const games = await tourneyGames(bracket.lockAt, now);
  const pairKey = (a: string, b: string) => [a, b].sort().join(":");
  const byPair = new Map(games.filter((g) => g.teams[0].espnId && g.teams[1].espnId).map((g) => [pairKey(g.teams[0].espnId, g.teams[1].espnId), g]));
  const when = (g: EspnGame) =>
    g.status === "scheduled" ? [formatInTimeZone(g.startAt, tz, "EEE M/d · h:mm a"), g.tv].filter(Boolean).join(" · ") : g.detail;

  const fieldIds = bracket.field.map((t) => t?.id ?? null);
  const teamOf = new Map(bracket.field.flatMap((t, slot) => (t ? [[t.id, { t, slot }] as const] : [])));
  const idOfEspn = new Map(bracket.field.flatMap((t) => (t?.espn_id ? [[t.espn_id, t.id] as const] : [])));

  // The First Four: ESPN's games before the lock that its headline calls First Four (or, without
  // a headline, any game before the first Round of 64 tip).
  const lock = Date.parse(bracket.lockAt);
  const ffGames = games.filter((g) => /first four/i.test(g.headline) || (!g.headline && Date.parse(g.startAt) < lock - 60 * 60 * 1000));
  const regionOf = (headline: string) => {
    const i = bracket.regions.findIndex((r) => new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(headline));
    return i < 0 ? null : i;
  };
  // Slot each First Four game feeds: a team of it already in the field, else its region and seed.
  const ffSlot = new Map<number, EspnGame>();
  const firstFour = ffGames.map((g) => {
    const inField = g.teams.map((x) => idOfEspn.get(x.espnId)).find(Boolean);
    const seed = g.teams[0].seed ?? g.teams[1].seed;
    const region = regionOf(g.headline);
    const slot = inField ? teamOf.get(inField)!.slot : region !== null && seed !== null ? region * 16 + SEED_ORDER.indexOf(seed as (typeof SEED_ORDER)[number]) : null;
    if (slot !== null && slot >= 0) ffSlot.set(slot, g);
    const decided = g.status === "final";
    const teams = g.teams.map((x) => ({
      id: idOfEspn.get(x.espnId) ?? null,
      seed: x.seed ?? seed,
      name: x.name,
      abbr: x.abbr,
      logo: x.logo,
      score: x.score,
      won: decided && x.winner,
      lost: decided && !x.winner,
    })) as [LiveTeam, LiveTeam];
    return {
      key: `ff-${g.id}`,
      round: 0,
      status: g.status,
      detail: when(g),
      teams,
      placeholders: [null, null] as [null, null],
      region: region !== null ? bracket.regions[region] : slot !== null && slot >= 0 ? bracket.regions[Math.floor(slot / 16)] : null,
      seed,
    };
  });

  // Round by round: who's in each game (the pool's winners, then ESPN's finals for any the pool
  // hasn't entered yet), and ESPN's score and clock for it.
  const winners: Picks = { ...bracket.results };
  const rounds: LiveGame[][] = [];
  for (const { round } of ROUNDS) {
    const list: LiveGame[] = [];
    for (let g = 0; g < gamesIn(round); g++) {
      const key = gameKey(round, g);
      const ids = gameTeams(round, g, fieldIds, winners);
      // A First Round side still waiting on its First Four game: that game's winner once it's
      // final, else "TEX/NCSU".
      const placeholders: [string | null, string | null] = [null, null];
      const sides = ids.map((id, i): LiveTeam | null => {
        if (id) {
          const { t, slot } = teamOf.get(id)!;
          return { id, seed: SEED_ORDER[slot % 16], name: t.short_name ?? t.name, abbr: t.abbreviation, logo: t.logo_url, score: null, won: false, lost: false };
        }
        if (round === 1) {
          const ff = ffSlot.get(2 * g + i);
          if (ff) {
            const w = ff.status === "final" ? ff.teams.find((x) => x.winner) : undefined;
            if (w) return { id: null, seed: SEED_ORDER[(2 * g + i) % 16], name: w.name, abbr: w.abbr, logo: w.logo, score: null, won: false, lost: false };
            placeholders[i] = `${ff.teams[0].abbr ?? ff.teams[0].name}/${ff.teams[1].abbr ?? ff.teams[1].name}`;
          }
        }
        return null;
      }) as [LiveTeam | null, LiveTeam | null];
      // ESPN's game between these two teams.
      const espnIds = sides.map((s, i) => (s?.id ? teamOf.get(s.id)?.t.espn_id : round === 1 ? ffSlot.get(2 * g + i)?.teams.find((x) => x.winner)?.espnId : null));
      const eg = espnIds[0] && espnIds[1] ? byPair.get(pairKey(espnIds[0], espnIds[1])) : undefined;
      if (eg) for (const s of sides) if (s) {
        const espnId = s.id ? teamOf.get(s.id)?.t.espn_id : espnIds[sides.indexOf(s)];
        s.score = eg.teams.find((x) => x.espnId === espnId)?.score ?? null;
      }
      // The winner: the pool's, else ESPN's final.
      let winner = winners[key] ?? null;
      if (!winner && eg?.status === "final") {
        const w = eg.teams.find((x) => x.winner);
        const id = w ? idOfEspn.get(w.espnId) : undefined;
        if (id) winners[key] = winner = id;
      }
      if (winner) for (const s of sides) if (s) (s.won = s.id === winner), (s.lost = s.id !== winner);
      list.push({ key, round, status: winner ? "final" : (eg?.status ?? "scheduled"), detail: eg ? when(eg) : winner ? "Final" : null, teams: sides, placeholders });
    }
    rounds.push(list);
  }
  return {
    regions: bracket.regions,
    rounds,
    firstFour,
    live: games.some((g) => g.status === "in_progress"),
    soon: games.some((g) => g.status !== "final" && Math.abs(Date.parse(g.startAt) - now) < 3 * 60 * 60 * 1000),
    fromEspn: games.length > 0,
  };
}
