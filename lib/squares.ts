// Super Bowl Squares: a 10 × 10 board for one game. Players take squares; once the board is
// ready the commissioner draws a digit (0-9) for each column and row at random. At the end of
// each quarter, the square where the two teams' last digits meet wins. The rules live in
// pools.settings.squares (settings.format = "squares").

import { block, int, num } from "./formats";

export type SquaresSettings = {
  /** What a square costs (for the pot shown on the board; the site doesn't collect money). */
  price: number;
  /** Who fills the board: the commissioner types a name into each square (the default), or players take their own. */
  entry: "commissioner" | "players";
  /** Players filling the board: the most squares one player can take; null = no limit. */
  max_per_entry: number | null;
  /**
   * How the numbers along the top and side are set: drawn at random (the default), typed in,
   * or 0-9 in order. In order is only for a board whose names were placed at random (the
   * commissioner's random fill); otherwise people could choose their numbers.
   */
  numbers: "random" | "ordered" | "manual";
  /** The pot's split, in percent: end of the 1st quarter, halftime, end of the 3rd, final. */
  payouts: [number, number, number, number];
};

export const SQUARES_DEFAULT: SquaresSettings = { price: 10, entry: "commissioner", max_per_entry: null, numbers: "random", payouts: [25, 25, 25, 25] };

export const PAYOUT_PRESETS: { id: string; label: string; text: string; payouts: SquaresSettings["payouts"] }[] = [
  { id: "even", label: "Even quarters", text: "25% at the end of each quarter.", payouts: [25, 25, 25, 25] },
  { id: "final-heavy", label: "Bigger final", text: "20% for each of the first three quarters, 40% for the final score.", payouts: [20, 20, 20, 40] },
  { id: "half-final", label: "Half and final", text: "25% at halftime, 50% for the final, 12.5% for the 1st and 3rd.", payouts: [12.5, 25, 12.5, 50] },
  { id: "final", label: "Final score only", text: "The whole pot rides on the final score.", payouts: [0, 0, 0, 100] },
];

export const QUARTERS = ["1st quarter", "Halftime", "3rd quarter", "Final"] as const;

export function squaresSettings(settings: unknown): SquaresSettings {
  const s = block(settings, "squares");
  const p = Array.isArray(s.payouts) && s.payouts.length === 4 && s.payouts.every((n: unknown) => num(n, 0, 100) !== null) ? (s.payouts as SquaresSettings["payouts"]) : SQUARES_DEFAULT.payouts;
  return {
    price: num(s.price, 0, 100000) ?? SQUARES_DEFAULT.price,
    entry: s.entry === "players" ? "players" : "commissioner",
    max_per_entry: int(s.max_per_entry, 1, 100),
    numbers: s.numbers === "ordered" || s.numbers === "manual" ? s.numbers : "random",
    payouts: p,
  };
}

export function squaresSettingsError(s: SquaresSettings): string | null {
  if (s.price < 0) return "The price per square can't be negative.";
  if (s.numbers === "ordered" && s.entry === "players") return "Numbers in 0-9 order are only for a board the commissioner fills at random. Choose a random draw, or have the commissioner fill the board.";
  const total = s.payouts.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 0.01) return `The payouts add up to ${total}%. They have to add up to 100%.`;
  return null;
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** The rules in plain words, for the board and the settings summary. */
export function squaresRules(s: SquaresSettings): string[] {
  const paid = QUARTERS.map((q, i) => ({ q, pct: s.payouts[i] })).filter((x) => x.pct > 0);
  const cost = s.price > 0 ? ` Squares are ${money(s.price)} each.` : "";
  return [
    s.entry === "players"
      ? `Tap the open squares you want, type your name and save${s.max_per_entry ? `, up to ${s.max_per_entry} squares each` : ""}. A saved square can only be changed by the commissioner.${cost}`
      : `The commissioner writes a name on each square.${cost}`,
    s.numbers === "random"
      ? "Once every square is filled, the numbers along the top and side are drawn at random and the board locks."
      : s.numbers === "ordered"
        ? "Names are placed on the board at random, and the numbers along the top and side run 0 to 9 in order."
        : "Once every square is filled, the commissioner sets the numbers along the top and side and the board locks.",
    "At the end of each quarter, the square where the last digit of each team's score meets wins.",
    `Payouts: ${paid.map((x) => `${x.q} ${x.pct}%`).join(" · ")}.`,
  ];
}

export type Score = { home: number; away: number };

/** The square (0-99, row × 10 + column) that wins on a score, once the numbers are drawn. */
export function winningSquare(colDigits: number[] | null, rowDigits: number[] | null, score: Score | null): number | null {
  if (!colDigits || !rowDigits || !score) return null;
  const col = colDigits.indexOf(score.home % 10);
  const row = rowDigits.indexOf(score.away % 10);
  return col < 0 || row < 0 ? null : row * 10 + col;
}

/**
 * The score at the end of each quarter from ESPN's line scores (points per period). A quarter
 * counts once a later period has begun or the game is over; the final includes overtime.
 */
export function scoresFromLines(homeLines: string[], awayLines: string[], over: boolean, homeTotal: number | null, awayTotal: number | null): (Score | null)[] {
  const n = (v: string | undefined) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);
  const periods = Math.max(homeLines.length, awayLines.length);
  const at = (q: number): Score | null => {
    if (!(over || periods > q)) return null;
    let home = 0;
    let away = 0;
    for (let i = 0; i < q; i++) {
      home += n(homeLines[i]);
      away += n(awayLines[i]);
    }
    return { home, away };
  };
  const final = over && homeTotal !== null && awayTotal !== null ? { home: homeTotal, away: awayTotal } : null;
  return [at(1), at(2), at(3), final];
}

/** "Jordan D." for "Jordan Davis": the name in a square on a phone (a single name stays whole). */
export const shortName = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return w[0] ?? "?";
  return `${w[0]} ${w[w.length - 1]![0]!.toUpperCase()}.`;
};

/** "JD" for "Jordan Davis". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
