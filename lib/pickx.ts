// NCAA Pick X: each entry picks a set number of NCAA Tournament teams and scores every time one of
// them wins. The rules live in pools.settings.pick_x (settings.format = "pick_x"); the field and
// winners come from the pool's bracket (lib/brackets.ts). The database checks the same limits
// (supabase/migrations/…_pick_x.sql, submit_pickx).

import { ROUNDS, SEED_ORDER, gameKey, gameTeams, gamesIn, type Picks } from "./bracket";

export type PickXScoring = {
  /** Multiply by the team's seed (upsets pay more); off = every team scores the same. */
  seed: boolean;
  /** A value for each round, First Round to Championship. */
  rounds: number[];
  /** Added for every win. */
  bonus: number;
};
export type PickXLimits = { one_per_seed: boolean; max_per_region: number | null; min_seed_total: number | null };
export type PickXSettings = {
  picks: number;
  scoring: PickXScoring;
  limits: PickXLimits;
  /** How ties are broken: not at all (tied entries share a place), or by the closest guess of the championship game's total points. */
  tiebreaker: "none" | "title_total";
  /** The championship game's total points, once played (filled from ESPN, or typed in). */
  title_total: number | null;
};

export const PICKX_DEFAULT: PickXSettings = {
  picks: 8,
  scoring: { seed: true, rounds: [1, 2, 3, 4, 5, 6], bonus: 0 },
  limits: { one_per_seed: false, max_per_region: null, min_seed_total: null },
  tiebreaker: "none",
  title_total: null,
};

/** Common scoring setups, offered as one-tap choices (all editable). */
export const SCORING_PRESETS: { id: string; label: string; text: string; scoring: PickXScoring }[] = [
  { id: "seed-round", label: "Seed × round", text: "A win is worth the team's seed times the round (1 to 6).", scoring: { seed: true, rounds: [1, 2, 3, 4, 5, 6], bonus: 0 } },
  { id: "seed-plus", label: "Seed + 3 per win", text: "A win is worth the team's seed, plus 3.", scoring: { seed: true, rounds: [1, 1, 1, 1, 1, 1], bonus: 3 } },
  { id: "seed-wins", label: "Seed per win", text: "A win is worth the team's seed.", scoring: { seed: true, rounds: [1, 1, 1, 1, 1, 1], bonus: 0 } },
  { id: "flat-double", label: "Flat, doubling", text: "Every team scores the same: 1, 2, 4, 8, 16, 32 by round.", scoring: { seed: false, rounds: [1, 2, 4, 8, 16, 32], bonus: 0 } },
];

export const isPickX = (settings: unknown) => (settings as Record<string, unknown> | null)?.format === "pick_x";

const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The pool's Pick X rules, with defaults for anything missing. */
export function pickXSettings(settings: unknown): PickXSettings {
  const p = ((settings as Record<string, any> | null)?.pick_x ?? {}) as Record<string, any>;
  const sc = (p.scoring ?? {}) as Record<string, any>;
  const lim = (p.limits ?? {}) as Record<string, any>;
  const rounds = Array.isArray(sc.rounds) && sc.rounds.length === 6 && sc.rounds.every((n: unknown) => num(n) !== null && (n as number) >= 0) ? (sc.rounds as number[]) : PICKX_DEFAULT.scoring.rounds;
  return {
    picks: int(p.picks, 1, 32) ?? PICKX_DEFAULT.picks,
    scoring: { seed: sc.seed !== false, rounds, bonus: num(sc.bonus) !== null && sc.bonus >= 0 ? sc.bonus : 0 },
    limits: {
      one_per_seed: lim.one_per_seed === true,
      max_per_region: int(lim.max_per_region, 1, 16),
      min_seed_total: int(lim.min_seed_total, 1, 999),
    },
    tiebreaker: p.tiebreaker === "title_total" ? "title_total" : "none",
    title_total: int(p.title_total, 0, 999),
  };
}

/** Problems with Pick X rules a commissioner entered (empty when they're fine). */
export function pickXSettingsError(s: PickXSettings): string | null {
  if (s.picks < 1 || s.picks > 32) return "Pick between 1 and 32 teams.";
  if (s.scoring.rounds.some((n) => n < 0 || n > 1000)) return "Round values have to be between 0 and 1,000.";
  if (s.scoring.bonus < 0 || s.scoring.bonus > 1000) return "The bonus per win has to be between 0 and 1,000.";
  if (s.limits.one_per_seed && s.picks > 16) return "With one team per seed line, pick 16 teams or fewer.";
  if (s.limits.max_per_region !== null && s.limits.max_per_region * 4 < s.picks) return `${s.limits.max_per_region} per region allows only ${s.limits.max_per_region * 4} teams in all.`;
  return null;
}

/** "Seed × round (1–6)", for summaries. */
export function scoringLabel(sc: PickXScoring): string {
  const preset = SCORING_PRESETS.find((p) => JSON.stringify(p.scoring) === JSON.stringify(sc));
  if (preset) return preset.label;
  const r = sc.rounds.every((n) => n === sc.rounds[0]) ? String(sc.rounds[0]) : sc.rounds.join("/");
  const base = sc.seed ? (r === "1" ? "Seed" : `Seed × ${r}`) : r;
  return sc.bonus ? `${base} + ${sc.bonus} per win` : `${base} per win`;
}

/** What one win in a round is worth for a team of this seed. */
export const winPoints = (sc: PickXScoring, round: number, seed: number) => (sc.seed ? seed : 1) * (sc.rounds[round - 1] ?? 0) + sc.bonus;

export const seedAt = (slot: number) => SEED_ORDER[slot % 16];
export const regionAt = (slot: number) => Math.floor(slot / 16);

/** How each picked team is doing: its wins (by round), points so far, and whether it's still alive. */
export type TeamStatus = { teamId: string; slot: number; seed: number; region: number; wins: number[]; points: number; alive: boolean };

export function teamStatus(teamId: string, field: (string | null)[], results: Picks, sc: PickXScoring): TeamStatus | null {
  const slot = field.indexOf(teamId);
  if (slot < 0) return null;
  const seed = seedAt(slot);
  const wins: number[] = [];
  let alive = true;
  for (const { round } of ROUNDS) {
    for (let g = 0; g < gamesIn(round); g++) {
      const [a, b] = gameTeams(round, g, field, results);
      if (a !== teamId && b !== teamId) continue;
      const winner = results[gameKey(round, g)];
      if (!winner) continue;
      if (winner === teamId) wins.push(round);
      else alive = false;
    }
  }
  return { teamId, slot, seed, region: regionAt(slot), wins, points: wins.reduce((t, r) => t + winPoints(sc, r, seed), 0), alive };
}

/** The most a team could still add: every remaining round won. */
export function teamUpside(t: TeamStatus, sc: PickXScoring): number {
  if (!t.alive) return 0;
  const next = (t.wins.length ? Math.max(...t.wins) : 0) + 1;
  let total = 0;
  for (let r = next; r <= 6; r++) total += winPoints(sc, r, t.seed);
  return total;
}

/** Which rule a set of picks breaks (by slot), or null. Mirrors submit_pickx. */
export function picksError(slots: number[], s: PickXSettings): string | null {
  if (slots.length > s.picks) return `Pick no more than ${s.picks} teams.`;
  if (s.limits.one_per_seed && new Set(slots.map(seedAt)).size !== slots.length) return "Only one team from each seed line.";
  if (s.limits.max_per_region !== null) {
    const per = new Map<number, number>();
    for (const sl of slots) per.set(regionAt(sl), (per.get(regionAt(sl)) ?? 0) + 1);
    if ([...per.values()].some((n) => n > s.limits.max_per_region!)) return `No more than ${s.limits.max_per_region} teams from one region.`;
  }
  if (s.limits.min_seed_total !== null && slots.length === s.picks && slots.reduce((t, sl) => t + seedAt(sl), 0) < s.limits.min_seed_total) {
    return `Your seeds have to add up to at least ${s.limits.min_seed_total}.`;
  }
  return null;
}

/** Why a team can't be added to these picks right now (a rule it would break), or null. */
export function blockedReason(slot: number, slots: number[], s: PickXSettings): string | null {
  if (slots.includes(slot)) return null;
  if (slots.length >= s.picks) return `You have ${s.picks} teams.`;
  if (s.limits.one_per_seed && slots.some((x) => seedAt(x) === seedAt(slot))) return `You already have a ${seedAt(slot)} seed.`;
  if (s.limits.max_per_region !== null && slots.filter((x) => regionAt(x) === regionAt(slot)).length >= s.limits.max_per_region) return "That region is full.";
  if (s.limits.min_seed_total !== null) {
    // The last pick has to bring the total up to the minimum.
    const total = slots.reduce((t, x) => t + seedAt(x), 0) + seedAt(slot);
    if (slots.length + 1 === s.picks && total < s.limits.min_seed_total) return `Seeds would total ${total}; you need ${s.limits.min_seed_total}.`;
  }
  return null;
}

/** The rules in a sentence, for players. */
export function rulesSummary(s: PickXSettings): string[] {
  const out = [`Pick ${s.picks} teams. Every time one of them wins, you score.`];
  const example = winPoints(s.scoring, 1, 12);
  out.push(`Scoring: ${scoringLabel(s.scoring)} (a 12 seed's first win is worth ${example}).`);
  const lim: string[] = [];
  if (s.limits.one_per_seed) lim.push("one team per seed line");
  if (s.limits.max_per_region !== null) lim.push(`up to ${s.limits.max_per_region} from a region`);
  if (s.limits.min_seed_total !== null) lim.push(`seeds adding up to at least ${s.limits.min_seed_total}`);
  if (lim.length) out.push(`Rules: ${lim.join(", ")}.`);
  if (s.tiebreaker === "title_total") out.push("Tiebreaker: the closest guess of the championship game's total points.");
  return out;
}

/** The scoring rules as a table for the info pop-up: points for a win in each round, examples, and the pick rules. */
export function pickXScoringTable(s: PickXSettings): { group: string; rows: [string, string][] }[] {
  const sc = s.scoring;
  const value = (r: number) => `${sc.seed ? `seed × ${sc.rounds[r]}` : sc.rounds[r]}${sc.bonus ? ` + ${sc.bonus}` : ""}`;
  const lim: [string, string][] = [];
  if (s.limits.one_per_seed) lim.push(["One team per seed line", "✓"]);
  if (s.limits.max_per_region !== null) lim.push(["Most from one region", String(s.limits.max_per_region)]);
  if (s.limits.min_seed_total !== null) lim.push(["Seeds add up to at least", String(s.limits.min_seed_total)]);
  if (s.tiebreaker === "title_total") lim.push(["Tiebreaker", "Title game total"]);
  return [
    { group: "Points for a win", rows: ROUNDS.map((r, i) => [r.name, value(i)] as [string, string]) },
    ...(sc.seed
      ? [{ group: "For example", rows: [["1 seed, First Round win", String(winPoints(sc, 1, 1))], ["12 seed, First Round win", String(winPoints(sc, 1, 12))], ["12 seed, Sweet 16 win", String(winPoints(sc, 3, 12))]] as [string, string][] }]
      : []),
    ...(lim.length ? [{ group: "Rules", rows: lim }] : []),
  ];
}

/** Points by round for a team (null where it didn't win that round), and the round it lost in (0 = still alive). */
export function roundPointsOf(t: TeamStatus, sc: PickXScoring): { points: (number | null)[]; lostIn: number } {
  const points = ROUNDS.map(({ round }) => (t.wins.includes(round) ? winPoints(sc, round, t.seed) : null));
  return { points, lostIn: t.alive ? 0 : (t.wins.length ? Math.max(...t.wins) : 0) + 1 };
}

/** How many rounds have a result in (0-6): the round columns to fill in. */
export function roundsStarted(results: Picks): number {
  return Object.keys(results).reduce((m, k) => Math.max(m, Number(k.split("-")[0]) || 0), 0);
}
