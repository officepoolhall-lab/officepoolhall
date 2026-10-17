import "server-only";
import type { PoolContext } from "./pool";

export type StandingRow = { userId: string; name: string; points: number; wins: number; losses: number; pushes: number; rank: number };

/** Season (all published weeks) or one week. Ties share a rank (TODO(brooks): weekly tiebreaker? none in MVP). */
export async function getStandings(ctx: PoolContext, slateId?: string): Promise<StandingRow[]> {
  const [{ data: members }, { data: slates }] = await Promise.all([
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    ctx.supabase.from("slates").select("id").eq("pool_id", ctx.pool.id).neq("status", "draft"),
  ]);
  const slateIds = slateId ? [slateId] : (slates ?? []).map((s) => s.id);
  const { data: scores } = slateIds.length
    ? await ctx.supabase.from("slate_scores").select("*").in("slate_id", slateIds)
    : { data: [] };

  const totals = new Map<string, StandingRow>();
  for (const m of members ?? []) {
    totals.set(m.user_id, { userId: m.user_id, name: m.profile.display_name, points: 0, wins: 0, losses: 0, pushes: 0, rank: 0 });
  }
  for (const s of scores ?? []) {
    const row = totals.get(s.user_id);
    if (!row) continue;
    row.points += Number(s.points);
    row.wins += s.wins;
    row.losses += s.losses;
    row.pushes += s.pushes;
  }

  const rows = [...totals.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1));
  return rows;
}
