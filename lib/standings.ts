import "server-only";
import { getPublishedSlates, type PoolContext } from "./pool";

export type StandingRow = {
  userId: string;
  name: string;
  /** Includes upset bonus; can be negative in minus-points pools. */
  points: number;
  bonus: number;
  wins: number;
  losses: number;
  pushes: number;
  /** Weeks with no picks at all (scored per settings.missed_week). One week: 0 or 1. */
  missed: number;
  rank: number;
};

/**
 * Which published weeks to total: one slate by id, or a week range (a segment; toWeek null =
 * open-ended). Omitted = the whole season.
 */
export type StandingsScope = string | { fromWeek: number; toWeek: number | null };

/** Season (all published weeks), one week, or a segment. Ties share a rank (TODO(brooks): weekly tiebreaker? none in MVP). */
export async function getStandings(ctx: PoolContext, scope?: StandingsScope): Promise<StandingRow[]> {
  const [{ data: members }, { data: slates }] = await Promise.all([
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    ctx.supabase.from("slates").select("id, week").eq("pool_id", ctx.pool.id).neq("status", "draft"),
  ]);
  const slateIds =
    typeof scope === "string"
      ? [scope]
      : (slates ?? [])
          .filter((s) => !scope || (s.week >= scope.fromWeek && (scope.toWeek === null || s.week <= scope.toWeek)))
          .map((s) => s.id);
  const { data: scores } = slateIds.length
    ? await ctx.supabase.from("slate_scores").select("*").in("slate_id", slateIds)
    : { data: [] };

  return tally(members ?? [], scores ?? []);
}

type MemberRow = { user_id: string; profile: { display_name: string } };
type ScoreRow = { slate_id: string; user_id: string; points: number; bonus: number; wins: number; losses: number; pushes: number; missed: boolean };

/** Every member's totals over the given score rows, ranked: points, then wins, then name; equal points share a rank. */
export function tally(members: MemberRow[], scores: ScoreRow[]): StandingRow[] {
  const totals = new Map<string, StandingRow>();
  for (const m of members) {
    totals.set(m.user_id, { userId: m.user_id, name: m.profile.display_name, points: 0, bonus: 0, wins: 0, losses: 0, pushes: 0, missed: 0, rank: 0 });
  }
  for (const s of scores) {
    const row = totals.get(s.user_id);
    if (!row) continue;
    row.points += Number(s.points);
    row.wins += s.wins;
    row.losses += s.losses;
    row.pushes += s.pushes;
    row.bonus += Number(s.bonus);
    if (s.missed) row.missed += 1;
  }

  const rows = [...totals.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1));
  return rows;
}

/**
 * Standings for the season, every week and any week range, from one load of the pool's
 * members and published weeks' scores. The Standings page uses it to switch weeks and
 * bonus segments instantly instead of asking the server again.
 */
export async function getStandingsBook(ctx: PoolContext) {
  const [{ data: members }, slates] = await Promise.all([
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    // Shared, per-request cache: the page asks for the same list.
    getPublishedSlates(ctx),
  ]);
  const ids = (slates ?? []).map((s: { id: string }) => s.id);
  // Members × weeks can pass PostgREST's 1000-row cap late in a big pool's season: page through.
  const scores: ScoreRow[] = [];
  for (let from = 0; ids.length; from += 1000) {
    const { data, error } = await ctx.supabase.from("slate_scores").select("*").in("slate_id", ids).order("slate_id").order("user_id").range(from, from + 999);
    if (error) throw error;
    scores.push(...((data ?? []) as ScoreRow[]));
    if (!data || data.length < 1000) break;
  }
  const weekOf = new Map<string, number>((slates ?? []).map((s: { id: string; week: number }) => [s.id, s.week]));
  const m = (members ?? []) as MemberRow[];

  return {
    season: () => tally(m, scores),
    week: (slateId: string) => tally(m, scores.filter((s) => s.slate_id === slateId)),
    range: (fromWeek: number, toWeek: number | null) =>
      tally(
        m,
        scores.filter((s) => {
          const w = weekOf.get(s.slate_id);
          return w !== undefined && w >= fromWeek && (toWeek === null || w <= toWeek);
        }),
      ),
  };
}
