import "server-only";
import { getBracket, type Bracket } from "./brackets";
import type { PoolBase, PoolContext } from "./pool";
import { pickXSettings, teamStatus, teamUpside, type PickXSettings, type PlayInTeams, type TeamStatus } from "./pickx";
import { getActiveMembers } from "./bench";

// Pick X data for the pool pages: the bracket (field, lock, winners), every entry's teams that
// the viewer can see, and each entry's score.

export type PickXEntry = { userId: string; name: string; teamIds: string[]; editedBy: string | null; /** Their guess of the championship game's total points (the tiebreaker). */ tiebreak: number | null };
export type PickXRow = PickXEntry & { points: number; alive: number; upside: number; teams: TeamStatus[]; rank: number };

export async function getPickX(ctx: PoolBase) {
  const settings: PickXSettings = pickXSettings(ctx.pool.settings);
  const [bracket, { data: members }, { data: entries }] = await Promise.all([
    getBracket(ctx as unknown as PoolContext),
    getActiveMembers(ctx.supabase, ctx.pool.id),
    // Row security: the viewer's own picks always, everyone's once the bracket locks.
    loadEntries(ctx),
  ]);
  const byUser = new Map(((entries ?? []) as { user_id: string; team_ids: string[]; edited_by: string | null; tiebreak?: number | null }[]).map((e) => [e.user_id, e]));
  const list: PickXEntry[] = ((members ?? []) as { user_id: string; profile: { display_name: string } }[]).map((m) => ({
    userId: m.user_id,
    name: m.profile.display_name,
    teamIds: byUser.get(m.user_id)?.team_ids ?? [],
    editedBy: byUser.get(m.user_id)?.edited_by ?? null,
    tiebreak: byUser.get(m.user_id)?.tiebreak ?? null,
  }));
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of the lock
  const locked = bracket ? Date.parse(bracket.lockAt) <= Date.now() : false;
  return { settings, bracket, entries: list, locked };
}

/** The entries, with the tiebreaker guess (without it until that column's migration is in). */
async function loadEntries(ctx: PoolBase) {
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const full = await db.from("pickx_entries").select("user_id, team_ids, edited_by, tiebreak").eq("pool_id", ctx.pool.id);
  if (!full.error) return full;
  return db.from("pickx_entries").select("user_id, team_ids, edited_by").eq("pool_id", ctx.pool.id);
}

/** Standings: each entry's points from its teams' wins, how many teams are still alive, and the most it can still add. */
/** The First Four's teams that aren't in the field (both, until a winner takes the spot). */
export function playInTeams(bracket: Bracket | null): PlayInTeams {
  const out: PlayInTeams = new Map();
  if (!bracket) return out;
  const inField = new Set(bracket.field.map((t) => t?.id).filter(Boolean));
  for (const g of bracket.firstFour)
    for (const t of g.teams) if (t && !inField.has(t.id)) out.set(t.id, { slot: g.slot, lost: g.winner !== null && g.winner !== t.id });
  return out;
}

export function pickXStandings(bracket: Bracket | null, entries: PickXEntry[], s: PickXSettings): PickXRow[] {
  const field = bracket ? bracket.field.map((t) => t?.id ?? null) : [];
  const results = bracket?.results ?? {};
  const playIn = playInTeams(bracket);
  const rows = entries.map((e) => {
    const teams = e.teamIds.map((id) => teamStatus(id, field, results, s.scoring, playIn)).filter((t): t is TeamStatus => t !== null);
    return {
      ...e,
      teams,
      points: teams.reduce((t, x) => t + x.points, 0),
      alive: teams.filter((x) => x.alive).length,
      upside: teams.reduce((t, x) => t + teamUpside(x, s.scoring), 0),
      rank: 0,
    };
  });
  // The tiebreaker (when the pool uses one and the title game is over): closest guess first; no guess last.
  const off = (e: PickXEntry) => (s.tiebreaker === "title_total" && s.title_total !== null ? (e.tiebreak === null ? Infinity : Math.abs(e.tiebreak - s.title_total)) : 0);
  rows.sort((a, b) => b.points - a.points || off(a) - off(b) || b.upside - a.upside || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    const tied = i > 0 && rows[i - 1].points === r.points && off(rows[i - 1]) === off(r);
    r.rank = tied ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
