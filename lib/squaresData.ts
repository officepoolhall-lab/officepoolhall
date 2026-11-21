import "server-only";
import { getBenchedIds } from "./bench";
import { getGameSummary } from "./gameSummary";
import type { PoolBase } from "./pool";
import { scoresFromLines, squaresSettings, winningSquare, type Score } from "./squares";

// A Squares pool's board in one load: its settings, the game, the drawn numbers, every claimed
// square, and each quarter's score (typed in by the commissioner, else read from ESPN).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SquaresBoard = {
  homeName: string;
  awayName: string;
  gameEspnId: string | null;
  colDigits: number[] | null;
  rowDigits: number[] | null;
  drawn: boolean;
  /** The commissioner's typed-in scores, by quarter (1-4). */
  manual: (Score | null)[];
};

const asScore = (v: unknown): Score | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0) ? { home: v[0] as number, away: v[1] as number } : null;

export async function getSquares(ctx: PoolBase) {
  const settings = squaresSettings(ctx.pool.settings);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: b }, { data: claimRows }, { data: memberRows }, benched] = await Promise.all([
    db.from("squares_boards").select("*").eq("pool_id", ctx.pool.id).maybeSingle(),
    db.from("squares_claims").select("idx, user_id").eq("pool_id", ctx.pool.id),
    db.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    getBenchedIds(ctx.supabase, ctx.pool.id),
  ]);
  const row = (b ?? {}) as Row;
  const board: SquaresBoard = {
    homeName: row.home_name ?? "NFC",
    awayName: row.away_name ?? "AFC",
    gameEspnId: row.game_espn_id ?? null,
    colDigits: row.col_digits ?? null,
    rowDigits: row.row_digits ?? null,
    drawn: Boolean(row.drawn_at),
    manual: [1, 2, 3, 4].map((q) => asScore((row.scores ?? {})[String(q)])),
  };
  const names = new Map<string, string>(((memberRows ?? []) as Row[]).map((m) => [m.user_id, m.profile.display_name]));
  const members = [...names.entries()].filter(([id]) => !benched.has(id)).map(([userId, name]) => ({ userId, name }));
  const claims = new Map<number, string>(((claimRows ?? []) as Row[]).map((c) => [c.idx as number, c.user_id as string]));

  // ESPN's quarter scores, when the game is linked; a typed-in score wins over ESPN's.
  let espn: (Score | null)[] = [null, null, null, null];
  let live: string | null = null;
  if (board.gameEspnId) {
    const sum = await getGameSummary("nfl", board.gameEspnId, true).catch(() => null);
    if (sum?.home && sum.away && sum.status.state && sum.status.state !== "pre") {
      const total = (v: string | null) => (v !== null && Number.isFinite(Number(v)) ? Number(v) : null);
      espn = scoresFromLines(sum.home.linescores, sum.away.linescores, sum.status.state === "post", total(sum.home.score), total(sum.away.score));
      if (sum.status.state === "in") live = sum.status.detail;
    }
  }
  const scores = board.manual.map((m, i) => m ?? espn[i]);
  const winners = scores.map((s) => winningSquare(board.colDigits, board.rowDigits, s));
  return { settings, board, claims, names, members, scores, winners, live };
}
