// The order basketball stats show in, everywhere (box score, player game log, per-game and season
// lines): minutes, points, rebounds, assists, turnovers, steals, blocks, then shooting (FG, FG%,
// 3P, 3P%, FT, FT%), anything else ESPN adds (offensive/defensive rebounds…), and fouls last.

const ORDER = ["MIN", "PTS", "REB", "AST", "TO", "STL", "BLK", "FG", "FG%", "3PT", "3P%", "FT", "FT%"];
const ALIASES: Record<string, string> = { "3P": "3PT", "3PM-A": "3PT", "FGM-A": "FG", "FTM-A": "FT", "3PT%": "3P%" };

/** The indexes of `labels` in display order (stable for labels not in the list; PF at the end). */
export function basketballOrder(labels: string[]): number[] {
  const rank = (l: string) => {
    const key = ALIASES[l.toUpperCase()] ?? l.toUpperCase();
    if (key === "PF") return 1000;
    const i = ORDER.indexOf(key);
    return i === -1 ? 500 : i;
  };
  return labels.map((l, i) => [rank(l), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
}

/** Reorders a row of values (or labels) by `order`; null stays null. */
export function reorder<T>(values: T[] | null, order: number[]): T[] | null {
  return values ? order.map((i) => values[i]) : null;
}
