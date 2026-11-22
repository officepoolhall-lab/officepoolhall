import "server-only";
import { getGameSummary } from "./gameSummary";
import { getSuperBowl } from "./nflPlayoffs";
import { teamSport } from "./sports";
import { scoresFromLines, squaresSettings, winningSquare, type Score } from "./squares";

// A Squares pool's board in one load: its settings, the game (the season's Super Bowl, found on
// ESPN by itself, unless the commissioner chose another), the numbers, the name on every
// square, and each quarter's score (typed in by the commissioner, else read from ESPN).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SquaresBoard = {
  homeName: string;
  awayName: string;
  /** The game the commissioner chose, or null for the Super Bowl. */
  chosenGameId: string | null;
  /** The game being followed on ESPN (chosen, or the Super Bowl once ESPN lists it). */
  gameEspnId: string | null;
  /** The names came from ESPN (the matchup is set), not from what the commissioner typed. */
  namesFromEspn: boolean;
  colDigits: number[] | null;
  rowDigits: number[] | null;
  drawn: boolean;
  /** The commissioner's typed-in scores, by quarter (1-4). */
  manual: (Score | null)[];
  /** For the link anyone can open without signing in (/board/<token>); null until the board's row exists. */
  shareToken: string | null;
  /** Every name was placed by the random fill, and none changed by hand since. */
  randomFilled: boolean;
};

/** Where the board is read from: a signed-in viewer's own client, or (for the public link) the service role with no viewer. */
export type SquaresSource = { supabase: unknown; pool: { id: string; season: number; sport: string | null; settings: unknown } };
export type Square = { label: string };

const asScore = (v: unknown): Score | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0) ? { home: v[0] as number, away: v[1] as number } : null;
/** The stand-in team name: what the commissioner typed, else "Home"/"Away" for a college board (the saved default is the NFL's conferences). */
const standIn = (saved: string | null | undefined, college: boolean, collegeDefault: string, nflDefault: string) =>
  !saved || (college && /^(afc|nfc)$/i.test(saved)) ? (college ? collegeDefault : nflDefault) : saved;
const placeholder = (name: string | null | undefined) => !name || /^(tbd|afc|nfc)$/i.test(name.trim());

export async function getSquares(ctx: SquaresSource) {
  const settings = squaresSettings(ctx.pool.settings);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: b }, { data: claimRows }] = await Promise.all([
    db.from("squares_boards").select("*").eq("pool_id", ctx.pool.id).maybeSingle(),
    db.from("squares_claims").select("idx, label").eq("pool_id", ctx.pool.id),
  ]);
  const row = (b ?? {}) as Row;
  const sport = teamSport(ctx.pool.sport);
  const college = sport !== "nfl";
  const chosen: string | null = row.game_espn_id ?? null;
  // An NFL board with no game chosen follows the season's Super Bowl, as soon as ESPN lists it.
  // A college board follows the game its commissioner chooses.
  const gameId = chosen ?? (college ? null : (await getSuperBowl(ctx.pool.season).catch(() => null))?.id ?? null);

  // ESPN's teams and quarter scores for the game. A typed-in score wins over ESPN's.
  let espn: (Score | null)[] = [null, null, null, null];
  let live: string | null = null;
  let names: { home: string; away: string } | null = null;
  if (gameId) {
    const sum = await getGameSummary(sport, gameId, true).catch(() => null);
    if (sum?.home && sum.away) {
      if (!placeholder(sum.home.name) && !placeholder(sum.away.name)) names = { home: sum.home.name, away: sum.away.name };
      if (sum.status.state && sum.status.state !== "pre") {
        const total = (v: string | null) => (v !== null && Number.isFinite(Number(v)) ? Number(v) : null);
        espn = scoresFromLines(sum.home.linescores, sum.away.linescores, sum.status.state === "post", total(sum.home.score), total(sum.away.score));
        if (sum.status.state === "in") live = sum.status.detail;
      }
    }
  }
  const board: SquaresBoard = {
    // ESPN's home team runs across the top, so its scores line up with the columns.
    homeName: names?.home ?? standIn(row.home_name, college, "Home", "NFC"),
    awayName: names?.away ?? standIn(row.away_name, college, "Away", "AFC"),
    chosenGameId: chosen,
    gameEspnId: gameId,
    namesFromEspn: Boolean(names),
    colDigits: row.col_digits ?? null,
    rowDigits: row.row_digits ?? null,
    drawn: Boolean(row.drawn_at),
    manual: [1, 2, 3, 4].map((q) => asScore((row.scores ?? {})[String(q)])),
    shareToken: row.share_token ?? null,
    randomFilled: row.random_filled === true,
  };
  const squares = new Map<number, Square>(((claimRows ?? []) as Row[]).map((c) => [c.idx as number, { label: c.label as string }]));
  const scores = board.manual.map((m, i) => m ?? espn[i]);
  const winners = scores.map((s) => winningSquare(board.colDigits, board.rowDigits, s));
  return { settings, board, squares, scores, winners, live, college };
}
