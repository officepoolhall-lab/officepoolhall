import "server-only";
import type { Picks } from "./bracket";
import type { PoolContext } from "./pool";

// Loads the pool's NCAA Tournament bracket (see lib/bracket.ts for the shape).

export type BracketTeam = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null; /** ESPN's team id, for reading results from ESPN. */ espn_id?: string | null };

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
  /** The First Four: each play-in game's First Round slot, its two teams and its winner (null until played). */
  firstFour: { slot: number; teams: [BracketTeam | null, BracketTeam | null]; winner: string | null }[];
};

const asPicks = (v: unknown): Picks => (v && typeof v === "object" ? (v as Picks) : {});

/** The pool's bracket (its newest, if somehow more than one), or null. */
export async function getBracket(ctx: PoolContext): Promise<Bracket | null> {
  const { data } = await ctx.supabase
    .from("brackets")
    .select("id, name, week, lock_at, regions, bracket_teams ( slot, team:teams ( id, name, short_name, abbreviation, logo_url, espn_id ) ), bracket_results ( results )")
    .eq("pool_id", ctx.pool.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const field: (BracketTeam | null)[] = Array.from({ length: 64 }, () => null);
  for (const bt of data.bracket_teams ?? []) field[bt.slot] = bt.team;
  const res = Array.isArray(data.bracket_results) ? data.bracket_results[0] : data.bracket_results;
  // The First Four, on its own (its column may not be there yet): its teams loaded by id.
  type FF = { slot: number; teams: string[]; winner: string | null };
  // Untyped: the column comes with migration 070, after the generated types.
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const ffRow: { data: { first_four?: unknown } | null; error: unknown } = await db.from("brackets").select("first_four").eq("id", data.id).maybeSingle();
  const ffRaw = (!ffRow.error && Array.isArray(ffRow.data?.first_four) ? (ffRow.data!.first_four as FF[]) : []).filter(
    (g) => Number.isInteger(g?.slot) && g.slot >= 0 && g.slot < 64 && Array.isArray(g?.teams),
  );
  const ffIds = [...new Set(ffRaw.flatMap((g) => g.teams).filter(Boolean))];
  const ffTeams = new Map<string, BracketTeam>();
  if (ffIds.length) {
    const { data: rows } = await ctx.supabase.from("teams").select("id, name, short_name, abbreviation, logo_url, espn_id").in("id", ffIds);
    for (const t of (rows ?? []) as BracketTeam[]) ffTeams.set(t.id, t);
  }
  return {
    id: data.id,
    name: data.name,
    week: data.week,
    lockAt: data.lock_at,
    regions: data.regions,
    field,
    results: asPicks(res?.results),
    firstFour: ffRaw.map((g) => ({
      slot: g.slot,
      teams: [ffTeams.get(g.teams[0]) ?? null, ffTeams.get(g.teams[1]) ?? null],
      winner: typeof g.winner === "string" ? g.winner : null,
    })),
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
