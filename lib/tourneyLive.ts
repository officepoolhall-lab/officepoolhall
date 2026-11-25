import "server-only";
import type { SlateGame } from "@/lib/pool";
import { formatInTimeZone } from "date-fns-tz";
import { ROUNDS, SEED_ORDER, gameKey, gameTeams, gamesIn, type Picks } from "./bracket";
import type { Bracket } from "./brackets";

// The NCAA Tournament as it stands right now, for a pool's live bracket: the pool's field and
// winners, with ESPN's scores, clocks and tip times laid over every game, plus the First Four.
// ESPN's tournament scoreboard (groups=100) is read for each tournament day: today's every 20
// seconds, other days every hour.

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };
const DAY = 86_400_000;

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is untyped */

type EspnTeam = { espnId: string; name: string; abbr: string | null; logo: string | null; score: number | null; seed: number | null; winner: boolean };
type EspnGame = { id: string; startAt: string; status: "scheduled" | "in_progress" | "final"; detail: string | null; headline: string; /** "Buffalo, NY". */ venue: string | null; teams: [EspnTeam, EspnTeam] };

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
      // Home listed second, as ESPN shows a game.
      const [a, b] = [cs.find((x) => x?.homeAway === "away") ?? cs[0], cs.find((x) => x?.homeAway === "home") ?? cs[1]];
      out.push({
        id: String(e?.id ?? ""),
        startAt: new Date(e?.date).toISOString(),
        status,
        detail: c?.status?.type?.shortDetail ?? e?.status?.type?.shortDetail ?? null,
        headline: String(c?.notes?.[0]?.headline ?? ""),
        venue: c?.venue?.address?.city ? [c.venue.address.city, c.venue.address.state].filter(Boolean).join(", ") : null,
        teams: [team(a), team(b)],
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The First Round's first day in the bracket's year: the third Thursday of March (Mar 19 in 2026,
 * Mar 20 in 2025, Mar 21 in 2024). Going by the year rather than the pool's lock keeps the dates
 * right even when a pool's lock is set somewhere else (a demo set back to before the tournament).
 */
function tourneyStart(lockAt: string): number {
  const lock = Date.parse(lockAt);
  const year = Number(formatInTimeZone(Number.isFinite(lock) ? lock : Date.now(), "America/New_York", "yyyy"));
  const firstThu = 1 + ((4 - new Date(Date.UTC(year, 2, 1)).getUTCDay() + 7) % 7);
  return Date.UTC(year, 2, firstThu + 14, 16); // noon Eastern
}

/** Every tournament game ESPN has, from the First Four (two days before the First Round) to the title game. */
async function tourneyGames(start: number, now: number): Promise<EspnGame[]> {
  const day = (t: number) => formatInTimeZone(t, "America/New_York", "yyyyMMdd");
  const today = day(now);
  // The whole tournament, scheduled games included (tip times and networks show ahead of time).
  const last = start + 19 * DAY;
  const dates: string[] = [];
  for (let t = start - 3 * DAY; t <= last; t += DAY) if (!dates.includes(day(t))) dates.push(day(t));
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
/** The round a tournament game's headline names (1-6), or null ("… - East Region - Sweet 16"). */
function roundOf(headline: string): number | null {
  if (/first four|opening round/i.test(headline)) return null;
  if (/\b(1st|first) round\b/i.test(headline)) return 1;
  if (/\b(2nd|second) round\b/i.test(headline)) return 2;
  if (/sweet 16|regional semifinal/i.test(headline)) return 3;
  if (/elite (8|eight)|regional final/i.test(headline)) return 4;
  if (/final four|national semifinal/i.test(headline)) return 5;
  if (/national championship|championship game/i.test(headline)) return 6;
  return null;
}

export type LiveGame = {
  key: string;
  round: number;
  status: "scheduled" | "in_progress" | "final";
  /** "8:44 - 2nd Half", "Final/OT", or the tip time and network ("Thu 11:15 AM · CBS"). */
  detail: string | null;
  /** A side not decided yet: both teams of its First Four game ("Texas / NC State") or null. */
  teams: [LiveTeam | null, LiveTeam | null];
  placeholders: [string | null, string | null];
  /** The day it's played ("Thu 3/19"), when ESPN has the game; and where ("Buffalo, NY"). */
  date?: string | null;
  site?: string | null;
  /** ESPN's tip time and game id, when ESPN has the game. */
  startAt?: string | null;
  espnId?: string | null;
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
  /** Each round's days ("Mar 19–20"), from ESPN's games, else the usual schedule for the bracket's year. */
  roundDates: string[];
  /** Each region's Sweet 16 and Elite 8 site, and the Final Four's. */
  regionSites: (string | null)[];
  finalSite: string | null;
};

/** The pool's bracket with ESPN's games laid over it. */
export async function getLiveBracket(bracket: Bracket, tz: string, now = Date.now()): Promise<LiveBracket> {
  const start = tourneyStart(bracket.lockAt);
  const lockAt = Date.parse(bracket.lockAt);
  // A pool whose lock isn't this tournament's First Round (a demo set back to before the tournament)
  // is playing it back: until it locks, ESPN's schedule (days, sites, tip times) shows but not its
  // scores or winners. A real pool keeps the First Four's results from before its lock.
  const replay = now < lockAt && Math.abs(lockAt - start) > 7 * DAY;
  const games = (await tourneyGames(start, now)).map((g): EspnGame =>
    replay ? { ...g, status: "scheduled", teams: g.teams.map((t) => ({ ...t, score: null, winner: false })) as [EspnTeam, EspnTeam] } : g,
  );
  const pairKey = (a: string, b: string) => [a, b].sort().join(":");
  const byPair = new Map(games.filter((g) => g.teams[0].espnId && g.teams[1].espnId).map((g) => [pairKey(g.teams[0].espnId, g.teams[1].espnId), g]));
  const when = (g: EspnGame) =>
    g.status === "scheduled" ? formatInTimeZone(g.startAt, tz, "EEE M/d · h:mm a") : g.detail;

  const fieldIds = bracket.field.map((t) => t?.id ?? null);
  const teamOf = new Map(bracket.field.flatMap((t, slot) => (t ? [[t.id, { t, slot }] as const] : [])));
  const idOfEspn = new Map(bracket.field.flatMap((t) => (t?.espn_id ? [[t.espn_id, t.id] as const] : [])));

  // The First Four: the pool's own record of it (Commissioner → Bracket, or ESPN's sync), with
  // ESPN's score, clock or tip time laid over each game; plus any First Four game only ESPN has
  // (its headline says First Four, or it's before the first Round of 64 tip).
  const regionOf = (headline: string) => {
    const i = bracket.regions.findIndex((r) => new RegExp(`\\b${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(headline));
    return i < 0 ? null : i;
  };
  type FFGame = LiveGame & { region: string | null; seed: number | null; slot: number | null; winnerTeam: LiveTeam | null };
  const firstFourGames: FFGame[] = [];
  const usedEspn = new Set<string>();
  for (const ff of bracket.firstFour) {
    const seed = SEED_ORDER[ff.slot % 16];
    const eg = ff.teams[0]?.espn_id && ff.teams[1]?.espn_id ? byPair.get(pairKey(ff.teams[0].espn_id, ff.teams[1].espn_id)) : undefined;
    if (eg) usedEspn.add(eg.id);
    const espnWinner = eg?.status === "final" ? eg.teams.find((x) => x.winner)?.espnId : undefined;
    const winner = ff.winner ?? ff.teams.find((t) => t?.espn_id && t.espn_id === espnWinner)?.id ?? null;
    const teams = ff.teams.map((t) =>
      t
        ? {
            id: t.id,
            seed,
            name: t.short_name ?? t.name,
            abbr: t.abbreviation,
            logo: t.logo_url,
            score: eg?.teams.find((x) => x.espnId === t.espn_id)?.score ?? null,
            won: !!winner && t.id === winner,
            lost: !!winner && t.id !== winner,
          }
        : null,
    ) as [LiveTeam | null, LiveTeam | null];
    firstFourGames.push({
      key: `ff-${ff.slot}`,
      round: 0,
      status: winner ? "final" : (eg?.status ?? "scheduled"),
      detail: eg ? when(eg) : winner ? "Final" : null,
      teams,
      placeholders: [null, null],
      region: bracket.regions[Math.floor(ff.slot / 16)] ?? null,
      seed,
      slot: ff.slot,
      winnerTeam: teams.find((t) => t?.won) ?? null,
    });
  }
  const knownSlots = new Set(firstFourGames.map((g) => g.slot));
  for (const g of games) {
    if (usedEspn.has(g.id) || !(/first four/i.test(g.headline) || (!g.headline && Date.parse(g.startAt) < start - 60 * 60 * 1000))) continue;
    const inField = g.teams.map((x) => idOfEspn.get(x.espnId)).find(Boolean);
    const seed = g.teams[0].seed ?? g.teams[1].seed;
    const region = regionOf(g.headline);
    const slot = inField ? teamOf.get(inField)!.slot : region !== null && seed !== null ? region * 16 + SEED_ORDER.indexOf(seed as (typeof SEED_ORDER)[number]) : null;
    if (slot !== null && knownSlots.has(slot)) continue;
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
    firstFourGames.push({
      key: `ff-${g.id}`,
      round: 0,
      status: g.status,
      detail: when(g),
      teams,
      placeholders: [null, null],
      region: region !== null ? bracket.regions[region] : slot !== null && slot >= 0 ? bracket.regions[Math.floor(slot / 16)] : null,
      seed,
      slot: slot !== null && slot >= 0 ? slot : null,
      winnerTeam: teams.find((t) => t.won) ?? null,
    });
  }
  firstFourGames.sort((x, y) => (x.slot ?? 99) - (y.slot ?? 99));
  const ffSlot = new Map(firstFourGames.filter((g) => g.slot !== null).map((g) => [g.slot!, g]));
  const firstFour = firstFourGames.map(({ slot: _slot, winnerTeam: _w, ...g }) => g); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Each region's later-round site and the Final Four's, from ESPN games whose headlines say so
  // (they're listed before their teams are known).
  const regionSites: (string | null)[] = bracket.regions.map(() => null);
  let finalSite: string | null = null;
  const roundDays: number[][] = [[], [], [], [], [], []];
  for (const g of games) {
    const r = roundOf(g.headline);
    if (!r) continue;
    roundDays[r - 1].push(Date.parse(g.startAt));
    if (!g.venue) continue;
    if (r >= 5) finalSite ??= g.venue;
    else if (r >= 3) {
      const i = bracket.regions.findIndex((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(g.headline));
      if (i >= 0) regionSites[i] ??= g.venue;
    }
  }
  // Each round's days: ESPN's, else the usual schedule (First Round on the third Thursday of March and the Friday).
  const OFFSETS = [[0, 1], [2, 3], [7, 8], [9, 10], [16, 16], [18, 18]];
  const roundDates = OFFSETS.map((off, i) => {
    const days = roundDays[i].length ? [Math.min(...roundDays[i]), Math.max(...roundDays[i])] : off.map((d) => start + d * DAY);
    const [a, b] = days.map((t) => formatInTimeZone(t, tz, "MMM d"));
    if (a === b) return a;
    return a.slice(0, 3) === b.slice(0, 3) ? `${a}–${b.slice(4)}` : `${a} – ${b}`;
  });

  // Round by round: who's in each game (the pool's winners, then ESPN's finals for any the pool
  // hasn't entered yet), and ESPN's score and clock for it.
  // First Round games by region and seed line too ("0:1-16"), for teams without an ESPN id on file.
  const r1BySeeds = new Map<string, EspnGame>();
  for (const x of games) {
    if (roundOf(x.headline) !== 1) continue;
    const r = regionOf(x.headline);
    const [s1, s2] = [x.teams[0].seed, x.teams[1].seed];
    if (r !== null && s1 && s2) r1BySeeds.set(`${r}:${Math.min(s1, s2)}-${Math.max(s1, s2)}`, x);
  }
  const winners: Picks = { ...bracket.results };
  const rounds: LiveGame[][] = [];
  for (const { round } of ROUNDS) {
    const list: LiveGame[] = [];
    for (let g = 0; g < gamesIn(round); g++) {
      const key = gameKey(round, g);
      const ids = gameTeams(round, g, fieldIds, winners);
      // A First Round side still waiting on its First Four game: that game's winner once it's
      // final, else both its teams ("Texas / NC State").
      const placeholders: [string | null, string | null] = [null, null];
      const sides = ids.map((id, i): LiveTeam | null => {
        // A First Four game not decided yet: both its teams on the line ("Texas / NC State"), even when
        // the pool's field already has a team in that spot.
        const ffOpen = round === 1 ? ffSlot.get(2 * g + i) : undefined;
        if (ffOpen && !ffOpen.winnerTeam) {
          placeholders[i] = ffOpen.teams.map((t) => t?.name ?? "TBD").join(" / ");
          return null;
        }
        if (id) {
          const { t, slot } = teamOf.get(id)!;
          return { id, seed: SEED_ORDER[slot % 16], name: t.short_name ?? t.name, abbr: t.abbreviation, logo: t.logo_url, score: null, won: false, lost: false };
        }
        if (round === 1) {
          const ff = ffSlot.get(2 * g + i);
          if (ff) {
            const w = ff.winnerTeam;
            if (w) return { ...w, seed: SEED_ORDER[(2 * g + i) % 16], score: null, won: false, lost: false };
            placeholders[i] = ff.teams.map((t) => t?.name ?? "TBD").join(" / ");
          }
        }
        return null;
      }) as [LiveTeam | null, LiveTeam | null];
      // ESPN's game between these two teams.
      const ffEspn = (slot: number) => {
        const w = ffSlot.get(slot)?.winnerTeam;
        if (!w) return null;
        if (w.id) return bracket.firstFour.flatMap((f) => f.teams).find((t) => t?.id === w.id)?.espn_id ?? null;
        return games.flatMap((x) => x.teams).find((x) => x.name === w.name && x.abbr === w.abbr)?.espnId ?? null;
      };
      const espnIds = sides.map((s, i) => (s?.id ? (teamOf.get(s.id)?.t.espn_id ?? null) : round === 1 ? ffEspn(2 * g + i) : null));
      const eg = espnIds[0] && espnIds[1] ? byPair.get(pairKey(espnIds[0], espnIds[1])) : undefined;
      // Its day, place and tip time, matched by region and seeds when the teams aren't (First Round).
      const seeds = [SEED_ORDER[(2 * g) % 16], SEED_ORDER[(2 * g + 1) % 16]];
      const sched = eg ?? (round === 1 ? r1BySeeds.get(`${Math.floor(g / 8)}:${Math.min(...seeds)}-${Math.max(...seeds)}`) : undefined);
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
      // Where: ESPN's game, else the pod's site (Second Round), the region's (Sweet 16, Elite 8) or the Final Four's.
      const site =
        sched?.venue ??
        (round === 2 ? (rounds[0][2 * g]?.site ?? rounds[0][2 * g + 1]?.site ?? null) : round <= 4 && round >= 3 ? regionSites[Math.floor(g / (gamesIn(round) / 4))] : round >= 5 ? finalSite : null);
      list.push({
        key,
        round,
        status: winner ? "final" : (eg?.status ?? "scheduled"),
        detail: eg ? when(eg) : winner ? "Final" : sched ? when(sched) : null,
        teams: sides,
        placeholders,
        date: sched ? formatInTimeZone(sched.startAt, tz, "EEE M/d") : roundDates[round - 1],
        site,
        startAt: sched?.startAt ?? null,
        espnId: eg?.id ?? null,
      });
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
    roundDates,
    regionSites,
    finalSite,
  };
}

/** One of a team's tournament games, from that team's side. */
export type TeamGame = {
  round: number;
  status: LiveGame["status"];
  opp: { name: string; seed: number | null } | null;
  /** Its score and the other team's (null until the game starts). */
  score: number | null;
  oppScore: number | null;
  won: boolean;
  lost: boolean;
  /** The clock, "Final", or the tip time. */
  detail: string | null;
};

/** Each team's games so far and its next one, by our team id (First Round first). */
export function gamesByTeam(b: LiveBracket): Record<string, TeamGame[]> {
  const out: Record<string, TeamGame[]> = {};
  for (const games of b.rounds)
    for (const g of games)
      g.teams.forEach((t, i) => {
        if (!t?.id) return;
        const o = g.teams[1 - i];
        (out[t.id] ??= []).push({
          round: g.round,
          status: g.status,
          opp: o ? { name: o.name, seed: o.seed } : g.placeholders[1 - i] ? { name: g.placeholders[1 - i]!, seed: null } : null,
          score: t.score,
          oppScore: o?.score ?? null,
          won: t.won,
          lost: t.lost,
          detail: g.detail,
        });
      });
  return out;
}

/**
 * The page header's games: the round being played (the first with a game not final, else the
 * title game), its games with both teams known, by tip time.
 */
export function tourneyTicker(b: LiveBracket): SlateGame[] {
  const r = b.rounds.findIndex((games) => games.some((g) => g.status !== "final" && g.teams[0] && g.teams[1]));
  const games = b.rounds[r < 0 ? 5 : r] ?? [];
  const team = (t: LiveTeam) => ({ id: t.id ?? `espn-${t.name}`, espn_id: null, name: t.name, short_name: t.name, abbreviation: t.abbr, logo_url: t.logo, conference: null });
  return games
    .filter((g) => g.teams[0] && g.teams[1] && (g.startAt || g.status !== "scheduled"))
    .map((g) => {
      const [away, home] = g.teams as [LiveTeam, LiveTeam];
      const startAt = g.startAt ?? new Date().toISOString();
      return {
        id: g.espnId ?? g.key, startAt, timeTbd: !g.startAt, manualTime: false, lockAt: null, effectiveLockAt: startAt,
        status: g.status, homeScore: home.score, awayScore: away.score,
        overridden: false, neutral: true, venue: g.site ?? null, tv: null, homeRank: home.seed, awayRank: away.seed, spread: null, voided: false,
        espnId: g.espnId ?? null, clock: g.status === "in_progress" ? g.detail : null, lastPlay: null, situation: null, possession: null,
        home: team(home), away: team(away),
      } as unknown as SlateGame;
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}
