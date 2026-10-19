import "server-only";
import { getPublishedSlates, type PoolContext } from "./pool";
import { rankBySplit, splitRecords, type Split, type SplitPick } from "./splits";

export type FilteredSplit = Exclude<Split, "all">;
import type { StandingRow } from "./standings";

const PAGE = 1000; // PostgREST's default row cap per request

type GameRow = { slate_id: string; game_id: string; locked_home_spread: number | null; game: { neutral_site: boolean } };
type PickRow = { user_id: string; slate_id: string; game_id: string; picked_side: string; result: string | null; points: number | null };

/** Every row of a query, fetched in pages of 1000. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Season standings for every pick type at once (favorites, underdogs, home, away), each ranked
 * by win % in that split, from one load of the season's graded picks. Graded picks are
 * visible to every member (RLS), so this is the same for everyone.
 */
export async function getAllSplitStandings(ctx: PoolContext): Promise<Record<FilteredSplit, StandingRow[]>> {
  const ids = (await getPublishedSlates(ctx)).map((s) => s.id);
  const [{ data: members }, games, picks] = await Promise.all([
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    ids.length
      ? all<GameRow>((from, to) =>
          ctx.supabase
            .from("slate_games")
            .select("slate_id, game_id, locked_home_spread, game:games!inner ( neutral_site )")
            .in("slate_id", ids)
            .range(from, to),
        )
      : ([] as GameRow[]),
    ids.length
      ? all<PickRow>((from, to) =>
          ctx.supabase
            .from("picks")
            .select("user_id, slate_id, game_id, picked_side, result, points")
            .in("slate_id", ids)
            .not("result", "is", null)
            .order("id")
            .range(from, to),
        )
      : ([] as PickRow[]),
  ]);

  const line = new Map<string, GameRow>(games.map((g: GameRow) => [`${g.slate_id}:${g.game_id}`, g]));
  const rows: SplitPick[] = picks.map((p: PickRow) => {
    const g = line.get(`${p.slate_id}:${p.game_id}`);
    return {
      user_id: p.user_id,
      picked_side: p.picked_side,
      result: p.result,
      points: p.points === null ? null : Number(p.points),
      homeSpread: g?.locked_home_spread === null || g?.locked_home_spread === undefined ? null : Number(g.locked_home_spread),
      neutral: Boolean(g?.game.neutral_site),
    };
  });
  const table = (split: FilteredSplit): StandingRow[] => {
    const records = splitRecords(rows, split);
    return rankBySplit(
      (members ?? []).map((m: { user_id: string; profile: { display_name: string } }) => {
        const r = records.get(m.user_id) ?? { wins: 0, losses: 0, pushes: 0, points: 0 };
        return { userId: m.user_id, name: m.profile.display_name, bonus: 0, missed: 0, ...r };
      }),
    );
  };
  return { fav: table("fav"), dog: table("dog"), home: table("home"), away: table("away") };
}
