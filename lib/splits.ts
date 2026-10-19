// Season records split by the kind of pick: favorites, underdogs, home or away teams.
// Pure: the Standings page loads the rows (lib/splitsData.ts) and this does the counting.

export const SPLITS = [
  { id: "all", label: "All" },
  { id: "fav", label: "Favorites" },
  { id: "dog", label: "Underdogs" },
  { id: "home", label: "Home" },
  { id: "away", label: "Away" },
] as const;
export type Split = (typeof SPLITS)[number]["id"];

export type SplitPick = {
  user_id: string;
  picked_side: string;
  result: string | null;
  points: number | null;
  /** The line the pick was graded against: home team's spread, negative = home favored. */
  homeSpread: number | null;
  neutral: boolean;
};

/**
 * Whether a pick counts toward a split. Favorites/underdogs need a line (a pick'em at 0 is
 * neither); home/away skip neutral-site games, where neither team is at home.
 */
export function inSplit(p: SplitPick, split: Split): boolean {
  if (split === "all") return true;
  if (split === "home") return p.picked_side === "home" && !p.neutral;
  if (split === "away") return p.picked_side === "away" && !p.neutral;
  if (p.homeSpread === null || p.homeSpread === 0) return false;
  const pickedSpread = p.picked_side === "home" ? p.homeSpread : -p.homeSpread;
  return split === "fav" ? pickedSpread < 0 : pickedSpread > 0;
}

export type SplitRecord = { wins: number; losses: number; pushes: number; points: number };

/** Each player's record on graded picks in the split (voids and pending picks don't count). */
export function splitRecords(picks: SplitPick[], split: Split): Map<string, SplitRecord> {
  const out = new Map<string, SplitRecord>();
  for (const p of picks) {
    if (p.result !== "win" && p.result !== "loss" && p.result !== "push") continue;
    if (!inSplit(p, split)) continue;
    const r = out.get(p.user_id) ?? { wins: 0, losses: 0, pushes: 0, points: 0 };
    if (p.result === "win") r.wins++;
    else if (p.result === "loss") r.losses++;
    else r.pushes++;
    r.points += Number(p.points ?? 0);
    out.set(p.user_id, r);
  }
  return out;
}

/** Best win % first, then more wins; players with nothing decided go last. Ties share a rank. */
export function rankBySplit<T extends { name: string } & SplitRecord>(rows: T[]): (T & { rank: number })[] {
  const pct = (r: SplitRecord) => (r.wins + r.losses ? r.wins / (r.wins + r.losses) : -1);
  const sorted = [...rows].sort((a, b) => pct(b) - pct(a) || b.wins - a.wins || a.name.localeCompare(b.name));
  const ranked: (T & { rank: number })[] = [];
  sorted.forEach((r, i) => {
    const prev = ranked[i - 1];
    const tied = prev && pct(prev) === pct(r) && prev.wins === r.wins;
    ranked.push({ ...r, rank: tied ? prev.rank : i + 1 });
  });
  return ranked;
}
