import "server-only";
import type { Picks } from "./bracket";
import type { PoolContext } from "./pool";

// Loads the pool's NCAA Tournament bracket (see lib/bracket.ts for the shape).

export type BracketTeam = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null };

export type Bracket = {
  id: string;
  name: string;
  week: number;
  lockAt: string;
  /** Four region names, in Final Four order (0 meets 1, 2 meets 3). */
  regions: string[];
  /** 64 slots (region * 16 + bracket position); null until the commissioner fills one. */
  field: (BracketTeam | null)[];
  /** Winners so far, {"r-g": team id}. */
  results: Picks;
};

const asPicks = (v: unknown): Picks => (v && typeof v === "object" ? (v as Picks) : {});

/** The pool's bracket (its newest, if somehow more than one), or null. */
export async function getBracket(ctx: PoolContext): Promise<Bracket | null> {
  const { data } = await ctx.supabase
    .from("brackets")
    .select("id, name, week, lock_at, regions, bracket_teams ( slot, team:teams ( id, name, short_name, abbreviation, logo_url ) ), bracket_results ( results )")
    .eq("pool_id", ctx.pool.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const field: (BracketTeam | null)[] = Array.from({ length: 64 }, () => null);
  for (const bt of data.bracket_teams ?? []) field[bt.slot] = bt.team;
  const res = Array.isArray(data.bracket_results) ? data.bracket_results[0] : data.bracket_results;
  return {
    id: data.id,
    name: data.name,
    week: data.week,
    lockAt: data.lock_at,
    regions: data.regions,
    field,
    results: asPicks(res?.results),
  };
}

export type BracketEntry = { user_id: string; picks: Picks; points: number; correct: number };

/** Brackets the viewer can see: their own (or the entry they co-manage) always; everyone's after the lock. */
export async function getBracketEntries(ctx: PoolContext, bracketId: string, userId?: string): Promise<BracketEntry[]> {
  let q = ctx.supabase.from("bracket_entries").select("user_id, picks, points, correct").eq("bracket_id", bracketId);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return (data ?? []).map((e) => ({ user_id: e.user_id, picks: asPicks(e.picks), points: Number(e.points), correct: e.correct }));
}
