// NCAA Tournament bracket: the shape, the scoring and the bookkeeping, shared by the bracket
// page, Admin and Standings. Mirrors supabase/migrations/…_ncaa_bracket.sql:
//   slot = region * 16 + position (bracket order); first-round game g plays slots 2g, 2g+1;
//   game g in round r is played by the winners of games 2g, 2g+1 in round r−1;
//   picks and results are maps {"r-g": team id}.

/** Seed at each position of a region, in bracket order. */
export const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15] as const;

export const ROUNDS = [
  { round: 1, name: "First Round", short: "R64" },
  { round: 2, name: "Second Round", short: "R32" },
  { round: 3, name: "Sweet 16", short: "S16" },
  { round: 4, name: "Elite 8", short: "E8" },
  { round: 5, name: "Final Four", short: "F4" },
  { round: 6, name: "Championship", short: "Final" },
] as const;

export type Picks = Record<string, string>;

export const seedOf = (slot: number) => SEED_ORDER[slot % 16];
export const gameKey = (round: number, game: number) => `${round}-${game}`;
/** How many games a round has: 32, 16, 8, 4, 2, 1. */
export const gamesIn = (round: number) => 32 >> (round - 1);

/**
 * Points for correctly picking the winner of a round's game, by the winner's seed: later
 * rounds and lower seeds (upsets) pay more. The pool's scoring sheet, verbatim.
 */
export function roundPoints(round: number, seed: number): number {
  switch (round) {
    case 1: return seed <= 8 ? 2 : seed <= 12 ? 3 : seed <= 14 ? 4 : 5;
    case 2: return seed <= 4 ? 3 : seed <= 6 ? 4 : seed <= 12 ? 5 : seed <= 14 ? 6 : 7;
    case 3: return seed <= 2 ? 5 : seed <= 4 ? 6 : seed <= 6 ? 7 : seed <= 8 ? 8 : seed <= 12 ? 9 : 10;
    case 4: return seed === 1 ? 7 : seed === 2 ? 8 : seed <= 4 ? 9 : seed <= 6 ? 10 : seed <= 8 ? 11 : seed <= 12 ? 12 : 13;
    case 5: return seed === 1 ? 10 : seed === 2 ? 12 : seed <= 4 ? 14 : seed <= 6 ? 15 : seed <= 8 ? 16 : seed <= 12 ? 18 : 20;
    case 6: return seed === 1 ? 12 : seed === 2 ? 14 : seed <= 4 ? 16 : seed <= 6 ? 18 : seed <= 8 ? 20 : seed <= 12 ? 22 : 24;
    default: return 0;
  }
}

/**
 * The two teams in a game, from the field (slot → team id) and a map of winners so far
 * (picks or results): first-round games from the field, later ones from the feeding games.
 * A side not decided yet is null.
 */
export function gameTeams(round: number, game: number, field: (string | null)[], winners: Picks): [string | null, string | null] {
  if (round === 1) return [field[2 * game] ?? null, field[2 * game + 1] ?? null];
  return [winners[gameKey(round - 1, 2 * game)] ?? null, winners[gameKey(round - 1, 2 * game + 1)] ?? null];
}

/**
 * Picks after choosing `team` to win a game: the pick is set (or cleared, when it's already
 * the pick), and any later pick that relied on the team it replaced is cleared, since that
 * team can no longer get there.
 */
export function choose(picks: Picks, round: number, game: number, team: string): Picks {
  const key = gameKey(round, game);
  const previous = picks[key];
  const next = { ...picks };
  if (previous === team) delete next[key];
  else next[key] = team;
  if (previous) {
    // Walk up the path this game feeds: later picks of the replaced team go.
    let g = game;
    for (let r = round + 1; r <= 6; r++) {
      g = Math.floor(g / 2);
      const k = gameKey(r, g);
      if (next[k] === previous) delete next[k];
      else break;
    }
  }
  return next;
}

/** The 63 games of a full bracket. */
export const TOTAL_GAMES = 63;
export const pickCount = (picks: Picks) => Object.keys(picks).filter((k) => picks[k]).length;

/** Teams knocked out by the results so far: the other side of every decided game. */
export function eliminatedTeams(field: (string | null)[], results: Picks): Set<string> {
  const out = new Set<string>();
  for (const [key, winner] of Object.entries(results)) {
    if (!winner) continue;
    const [round, game] = key.split("-").map(Number);
    for (const t of gameTeams(round, game, field, results)) if (t && t !== winner) out.add(t);
  }
  return out;
}

/**
 * A bracket's score so far, and the most it could still reach: a pick scores when the result
 * matches; a pick on a game not played yet is still live while its team hasn't been knocked out.
 */
export function scoreBracket(picks: Picks, results: Picks, field: (string | null)[]) {
  const seedByTeam = new Map(field.map((t, slot) => [t ?? "", seedOf(slot)]));
  const out = eliminatedTeams(field, results);
  let points = 0;
  let correct = 0;
  let possible = 0;
  for (const [key, team] of Object.entries(picks)) {
    if (!team) continue;
    const round = Number(key.split("-")[0]);
    const value = roundPoints(round, seedByTeam.get(team) ?? 16);
    const result = results[key];
    if (result) {
      if (result === team) {
        points += value;
        correct++;
        possible += value;
      }
    } else if (!out.has(team)) {
      possible += value;
    }
  }
  return { points, correct, possible };
}

/** Picks (or results) with every entry that no longer follows the bracket dropped, round by round. */
export function prunePicks(picks: Picks, field: (string | null)[]): Picks {
  const out: Picks = {};
  for (let r = 1; r <= 6; r++) {
    for (let g = 0; g < gamesIn(r); g++) {
      const key = gameKey(r, g);
      const team = picks[key];
      if (team && gameTeams(r, g, field, out).includes(team)) out[key] = team;
    }
  }
  return out;
}
