// Playoff Fantasy, weekly style: a lineup each round, last
// round's carrying over, points multiplied by how many rounds in a row a player has been in it.
// Everything here is plain logic on the playoff games and the saved lineups, shared by the pages
// and the save action (which checks a change against the same locks the pages show).

import type { PlayoffGame } from "./nflPlayoffs";
import type { PfWeeklyLock, Position } from "./playoffFantasy";

export const WEEKLY_ROUNDS = 4;
/** The most a player's points are multiplied by (his fourth straight round). */
export const MAX_MULT = 4;

/** What the logic needs to know about a player: his position and his team's ESPN id. */
export type WeeklyPlayer = { id: string; pos: Position; team: string };

const kick = (g: PlayoffGame) => (g.date ? Date.parse(g.date) : NaN);
const startedGame = (g: PlayoffGame, now: number) => g.state !== "pre" || (Number.isFinite(kick(g)) && kick(g) <= now);

/** A round's games with both teams known. */
export const roundGames = (games: PlayoffGame[], r: number) => games.filter((g) => g.round === r && g.teams.length === 2);

/** The round each team lost in (teams still alive aren't listed). */
export function lostIn(games: PlayoffGame[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of games) if (g.state === "post") for (const t of g.teams) if (t.lost) out.set(t.espnId, g.round);
  return out;
}

/** A team can be in a round's lineup: it hasn't lost before that round. */
export const aliveAt = (lost: Map<string, number>, team: string, r: number) => !lost.has(team) || lost.get(team)! >= r;

/** The team's game in a round, if it has one (a Wild Card bye, or out: none). */
export const teamGame = (games: PlayoffGame[], r: number, team: string) => roundGames(games, r).find((g) => g.teams.some((t) => t.espnId === team)) ?? null;

/** When a round's first and last games kick off (ms), or null before its schedule is out. */
export function roundKicks(games: PlayoffGame[], r: number): { first: number; last: number } | null {
  const ks = roundGames(games, r).map(kick).filter(Number.isFinite);
  return ks.length ? { first: Math.min(...ks), last: Math.max(...ks) } : null;
}

/**
 * A player can't come in or out of the round's lineup any more. "week": once the round's first
 * game kicks off. "player": once his own game kicks off; a player with no game that round (a
 * Wild Card bye) locks with the round's last kickoff.
 */
export function playerLocked(p: WeeklyPlayer, r: number, games: PlayoffGame[], now: number, mode: PfWeeklyLock): boolean {
  const ks = roundKicks(games, r);
  if (mode === "week") return roundGames(games, r).some((g) => startedGame(g, now)) || (ks !== null && now >= ks.first);
  const g = teamGame(games, r, p.team);
  if (g) return startedGame(g, now);
  return roundGames(games, r).length > 0 && roundGames(games, r).every((x) => startedGame(x, now));
}

/** Every game of a round is over. */
const roundDone = (games: PlayoffGame[], r: number) => {
  const gs = games.filter((g) => g.round === r);
  return gs.length > 0 && gs.every((g) => g.state === "post");
};

/**
 * The round lineups are being set for: the first round not yet over (the Wild Card round before
 * anything's played). A round opens once the one before it is over (its teams are known then).
 */
export function currentRound(games: PlayoffGame[]): number {
  let r = 0;
  while (r < WEEKLY_ROUNDS - 1 && roundDone(games, r)) r++;
  return r;
}

/** The round's lineup can still change: it's the current round and not everything has locked. */
export function roundOpen(games: PlayoffGame[], r: number, now: number, mode: PfWeeklyLock): boolean {
  if (r !== currentRound(games)) return false;
  if (r > 0 && roundGames(games, r).length === 0) return false;
  const gs = roundGames(games, r);
  if (mode === "week") return !gs.some((g) => startedGame(g, now));
  return gs.length === 0 || !gs.every((g) => startedGame(g, now));
}

/**
 * Each round's lineup: what was saved for it, else last round's carried over (less players whose
 * team is out by then). Rounds past the current one stay empty.
 */
export function effectiveLineups(saved: (string[] | null)[], teamOf: (id: string) => string | undefined, lost: Map<string, number>, current: number): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < WEEKLY_ROUNDS; r++) {
    if (r > current) {
      out.push([]);
      continue;
    }
    const own = saved[r];
    const prev = r > 0 ? out[r - 1] : [];
    out.push(own ?? prev.filter((id) => aliveAt(lost, teamOf(id) ?? "", r)));
  }
  return out;
}

/** Each round's multiplier for each player in it: 1 + the rounds in a row just before it he was in the lineup (at most 4). */
export function multipliers(lineups: string[][]): Map<string, number>[] {
  return lineups.map((ids, r) => {
    const m = new Map<string, number>();
    for (const id of ids) {
      let n = 1;
      for (let k = r - 1; k >= 0 && lineups[k].includes(id) && n < MAX_MULT; k--) n++;
      m.set(id, n);
    }
    return m;
  });
}

/** An entry's points: each round, each player's points times his multiplier that round. */
export function weeklyPoints(lineups: string[][], ptsOf: (id: string, r: number) => number): { rounds: number[]; total: number; byPlayer: Map<string, number>[] } {
  const mult = multipliers(lineups);
  const byPlayer = lineups.map((ids, r) => new Map(ids.map((id) => [id, Math.round(ptsOf(id, r) * (mult[r].get(id) ?? 1) * 100) / 100])));
  const rounds = byPlayer.map((m) => Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100) / 100);
  return { rounds, total: Math.round(rounds.reduce((a, b) => a + b, 0) * 100) / 100, byPlayer };
}

/**
 * Why a change to a round's lineup can't be saved (null: it can). `before` is the round's lineup
 * as it stands (saved or carried over); `after` the new one.
 */
export function weeklyChangeError(
  before: string[],
  after: string[],
  r: number,
  o: { games: PlayoffGame[]; players: Map<string, WeeklyPlayer>; roster: Record<Position, number>; now: number; mode: PfWeeklyLock; names?: Map<string, string> },
): string | null {
  if (r < 0 || r >= WEEKLY_ROUNDS) return "That round doesn't exist.";
  if (!roundOpen(o.games, r, o.now, o.mode)) return r < currentRound(o.games) ? "That round is over." : o.mode === "week" ? "This round's lineups have locked." : "That round isn't open yet.";
  if (new Set(after).size !== after.length) return "A player is in the lineup twice.";
  const name = (id: string) => o.names?.get(id) ?? "That player";
  const lost = lostIn(o.games);
  const count = new Map<Position, number>();
  for (const id of after) {
    const p = o.players.get(id);
    if (!p) return "That player isn't in the pool's player list.";
    count.set(p.pos, (count.get(p.pos) ?? 0) + 1);
    if ((count.get(p.pos) ?? 0) > (o.roster[p.pos] ?? 0)) return `The lineup only has ${o.roster[p.pos] ?? 0} ${p.pos} spot${o.roster[p.pos] === 1 ? "" : "s"}.`;
  }
  for (const id of after.filter((x) => !before.includes(x))) {
    const p = o.players.get(id)!;
    if (!aliveAt(lost, p.team, r) || (r > 0 && !teamGame(o.games, r, p.team))) return `${name(id)}'s team isn't playing this round.`;
    if (playerLocked(p, r, o.games, o.now, o.mode)) return `${name(id)}'s game has started, so he can't be added.`;
  }
  for (const id of before.filter((x) => !after.includes(x))) {
    const p = o.players.get(id);
    if (p && playerLocked(p, r, o.games, o.now, o.mode)) return `${name(id)}'s game has started, so he can't be taken out.`;
  }
  return null;
}
