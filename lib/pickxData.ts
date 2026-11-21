import "server-only";
import { getBracket, type Bracket } from "./brackets";
import type { PoolBase, PoolContext } from "./pool";
import { pickXSettings, teamStatus, teamUpside, type PickXSettings, type TeamStatus } from "./pickx";

// Pick X data for the pool pages: the bracket (field, lock, winners), every entry's teams that
// the viewer can see, and each entry's score.

export type PickXEntry = { userId: string; name: string; teamIds: string[]; editedBy: string | null };
export type PickXRow = PickXEntry & { points: number; alive: number; upside: number; teams: TeamStatus[]; rank: number };

export async function getPickX(ctx: PoolBase) {
  const settings: PickXSettings = pickXSettings(ctx.pool.settings);
  const [bracket, { data: members }, { data: entries }] = await Promise.all([
    getBracket(ctx as unknown as PoolContext),
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    // Row security: the viewer's own picks always, everyone's once the bracket locks.
    ctx.supabase.from("pickx_entries").select("user_id, team_ids, edited_by").eq("pool_id", ctx.pool.id),
  ]);
  const byUser = new Map(((entries ?? []) as { user_id: string; team_ids: string[]; edited_by: string | null }[]).map((e) => [e.user_id, e]));
  const list: PickXEntry[] = ((members ?? []) as { user_id: string; profile: { display_name: string } }[]).map((m) => ({
    userId: m.user_id,
    name: m.profile.display_name,
    teamIds: byUser.get(m.user_id)?.team_ids ?? [],
    editedBy: byUser.get(m.user_id)?.edited_by ?? null,
  }));
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of the lock
  const locked = bracket ? Date.parse(bracket.lockAt) <= Date.now() : false;
  return { settings, bracket, entries: list, locked };
}

/** Standings: each entry's points from its teams' wins, how many teams are still alive, and the most it can still add. */
export function pickXStandings(bracket: Bracket | null, entries: PickXEntry[], s: PickXSettings): PickXRow[] {
  const field = bracket ? bracket.field.map((t) => t?.id ?? null) : [];
  const results = bracket?.results ?? {};
  const rows = entries.map((e) => {
    const teams = e.teamIds.map((id) => teamStatus(id, field, results, s.scoring)).filter((t): t is TeamStatus => t !== null);
    return {
      ...e,
      teams,
      points: teams.reduce((t, x) => t + x.points, 0),
      alive: teams.filter((x) => x.alive).length,
      upside: teams.reduce((t, x) => t + teamUpside(x, s.scoring), 0),
      rank: 0,
    };
  });
  rows.sort((a, b) => b.points - a.points || b.upside - a.upside || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
